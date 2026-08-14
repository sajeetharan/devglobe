/**
 * Shared logic for the "Add me to DevGlobe" self-nomination flow.
 *
 * Used by:
 *   - app/api/nominate/route.js (Next.js API route)
 *   - scripts/review-nominations.js (admin review flow)
 *   - scripts/migrate-nominations.js (one-time legacy migration)
 *
 * Data model (see issue #96):
 *   `developers` is the single source of truth for both public profiles and
 *   in-flight nominations. A nomination writes one developer-shaped document
 *   with a `nomination` lifecycle object. Approval/rejection patch that same
 *   document in place; nothing is ever duplicated across containers.
 *
 *   Documents with no `nomination` field are legacy/approved records and are
 *   treated as public. `nomination.status` is one of: pending, approved,
 *   rejected.
 *
 * Flow:
 *   1. Validate the GitHub username exists via the GitHub API.
 *   2. Reject if an approved/public developer already exists for this login.
 *   3. Reject duplicate pending nominations (idempotent).
 *   4. Fetch public GitHub profile + repository data for enrichment.
 *   5. Resolve `location` once (submitted value, else GitHub profile, else
 *      "Unknown") — this becomes the item's partition key and must never
 *      change after creation (see resolveLocation / CosmosDB partition key
 *      contract below).
 *   6. Upsert one developer document with `nomination.status = 'pending'`.
 */
import { CosmosClient } from '@azure/cosmos';
import {
  DeveloperContactValidationError,
  normalizeContactEmail,
  saveDeveloperContact,
} from './developer-contact-store.js';

const DATABASE = 'devglobe';
const DEVELOPERS_CONTAINER = 'developers';
const GITHUB_API = 'https://api.github.com';
export const SCHEMA_VERSION = 2;

const FALLBACK_COORDINATES = [
  ['san francisco', 37.7749, -122.4194], ['new york', 40.7128, -74.006],
  ['seattle', 47.6062, -122.3321], ['london', 51.5074, -0.1278],
  ['berlin', 52.52, 13.405], ['paris', 48.8566, 2.3522],
  ['toronto', 43.6532, -79.3832], ['vancouver', 49.2827, -123.1207],
  ['bangalore', 12.9716, 77.5946], ['bengaluru', 12.9716, 77.5946],
  ['colombo', 6.9271, 79.8612], ['singapore', 1.3521, 103.8198],
  ['sydney', -33.8688, 151.2093], ['tokyo', 35.6762, 139.6503],
  ['amsterdam', 52.3676, 4.9041], ['stockholm', 59.3293, 18.0686],
  ['united states', 39.8283, -98.5795], ['usa', 39.8283, -98.5795],
  ['united kingdom', 55.3781, -3.436], ['uk', 55.3781, -3.436],
  ['sri lanka', 7.8731, 80.7718], ['india', 20.5937, 78.9629],
  ['germany', 51.1657, 10.4515], ['france', 46.2276, 2.2137],
  ['canada', 56.1304, -106.3468], ['brazil', -14.235, -51.9253],
  ['australia', -25.2744, 133.7751], ['japan', 36.2048, 138.2529],
];

// GitHub usernames: alphanumeric + single hyphens, 1-39 chars, cannot end with hyphen
const USERNAME_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export function normalizeUsername(raw) {
  if (!raw) return '';
  return String(raw).trim().replace(/^@/, '').toLowerCase();
}

/**
 * A document counts as "public" (visible on every public read surface) when
 * it either predates the nomination lifecycle (no `nomination` field, kept
 * backward-compatible on purpose) or has been explicitly approved.
 */
export function isPublicDeveloper(doc) {
  if (!doc) return false;
  return !doc.nomination || doc.nomination.status === 'approved';
}

/**
 * Resolves the location to store on a new nomination document. This value
 * becomes the Cosmos partition key for the item's entire lifecycle, so it is
 * computed once, here, at creation time, and must not be changed by later
 * review/approval writes (see `patchDeveloperNomination`, which never
 * touches `location`).
 */
export function resolveLocation(submittedLocation, githubLocation) {
  const submitted = String(submittedLocation || '').trim();
  if (submitted) return submitted;
  const gh = String(githubLocation || '').trim();
  if (gh) return gh;
  return 'Unknown';
}

export async function geocodeLocation(location) {
  const normalized = String(location || '').trim().toLowerCase();
  if (!normalized || normalized === 'unknown') return null;

  const fallback = FALLBACK_COORDINATES.find(([name]) => normalized.includes(name));
  if (fallback) return { lat: fallback[1], lng: fallback[2] };
  if (process.env.GEOCODE_API_KEY) {
    try {
      const params = new URLSearchParams({
        q: location,
        key: process.env.GEOCODE_API_KEY,
        limit: '1',
        no_annotations: '1',
      });
      const response = await fetch(`https://api.opencagedata.com/geocode/v1/json?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (data.results?.[0]?.geometry) return data.results[0].geometry;
      }
    } catch { /* try the no-key fallback */ }
  }

  try {
    const params = new URLSearchParams({ q: location, format: 'jsonv2', limit: '1' });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'DevGlobe/1.0 (https://www.devglobe.dev)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const [result] = await response.json();
    if (!result) return null;
    return { lat: Number(result.lat), lng: Number(result.lon) };
  } catch {
    return null;
  }
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'devglobe-nomination',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function verifyGitHubUser(username) {
  const res = await fetch(`${GITHUB_API}/users/${encodeURIComponent(username)}`, { headers: githubHeaders() });
  if (res.status === 404) return { ok: false, notFound: true };
  if (res.status === 403 || res.status === 429) return { ok: false, rateLimited: true };
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  return { ok: true, user: await res.json() };
}

/**
 * Fetches public GitHub profile + top-repo data for enrichment. Never
 * throws on partial failure (e.g. rate limiting on the repos call) — it
 * returns as much as it could get plus an `enrichmentStatus` so callers can
 * store a pending record without silently pretending the data is complete.
 * `enrichmentStatus` is one of: 'complete', 'partial', 'failed'.
 */
export async function enrichFromGitHub(username, ghUser) {
  const headers = githubHeaders();
  let repos = [];
  let totalCommits = 0;
  let publicRepos = ghUser.public_repos || 0;
  let enrichmentStatus = process.env.GITHUB_TOKEN ? 'complete' : 'partial';
  let enrichmentError = process.env.GITHUB_TOKEN ? null : 'GITHUB_TOKEN is required to fetch contribution details.';

  if (process.env.GITHUB_TOKEN) {
    try {
      const graphRes = await fetch(`${GITHUB_API}/graphql`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'devglobe-nomination',
        },
        body: JSON.stringify({
          query: `query($login: String!) {
            user(login: $login) {
              contributionsCollection { totalCommitContributions restrictedContributionsCount }
              repositories(first: 10, orderBy: { field: STARGAZERS, direction: DESC }, ownerAffiliations: OWNER) {
                totalCount
                nodes { name url stargazerCount forkCount primaryLanguage { name } }
              }
            }
          }`,
          variables: { login: username },
        }),
      });
      const graphData = graphRes.ok ? await graphRes.json() : null;
      const user = graphData?.data?.user;
      if (!user) {
        enrichmentStatus = 'partial';
        enrichmentError = `GitHub GraphQL enrichment failed${graphRes.ok ? '' : ` with status ${graphRes.status}`}.`;
      } else {
        repos = (user.repositories?.nodes || []).map(repo => ({
          name: repo.name,
          html_url: repo.url,
          stargazers_count: repo.stargazerCount,
          forks_count: repo.forkCount,
          language: repo.primaryLanguage?.name || null,
        }));
        publicRepos = user.repositories?.totalCount || publicRepos;
        totalCommits = (user.contributionsCollection?.totalCommitContributions || 0) +
          (user.contributionsCollection?.restrictedContributionsCount || 0);
      }
    } catch (err) {
      enrichmentStatus = 'partial';
      enrichmentError = err.message;
    }
  }

  if (repos.length === 0) {
    try {
      const reposRes = await fetch(
        `${GITHUB_API}/users/${encodeURIComponent(username)}/repos?sort=stargazers_count&direction=desc&per_page=10&type=owner`,
        { headers }
      );
      if (reposRes.ok) {
        repos = await reposRes.json();
      } else {
        enrichmentStatus = 'partial';
        enrichmentError ||= `GitHub API returned ${reposRes.status} while fetching repositories.`;
      }
    } catch (err) {
      enrichmentStatus = 'partial';
      enrichmentError ||= err.message;
    }
  }

  const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const totalForks = repos.reduce((sum, r) => sum + (r.forks_count || 0), 0);
  const langCounts = {};
  repos.forEach(r => {
    if (r.language) langCounts[r.language] = (langCounts[r.language] || 0) + 1;
  });
  const totalLangRepos = Object.values(langCounts).reduce((s, v) => s + v, 0);
  const languages = Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, percent: Math.round((count / totalLangRepos) * 100) }));

  return {
    login: ghUser.login,
    name: ghUser.name || ghUser.login,
    avatarUrl: ghUser.avatar_url,
    bio: ghUser.bio || null,
    githubUrl: ghUser.html_url,
    followers: ghUser.followers || 0,
    publicRepos,
    totalStars,
    totalForks,
    totalWatchers: totalForks,
    topLanguage: languages[0]?.name || null,
    languages,
    topRepos: repos.map(r => ({
      name: r.name,
      url: r.html_url || `https://github.com/${encodeURIComponent(ghUser.login)}/${encodeURIComponent(r.name)}`,
      stars: r.stargazers_count,
      forks: r.forks_count,
    })),
    totalCommits,
    githubLocation: ghUser.location || null,
    enrichmentStatus,
    enrichmentError,
  };
}

async function getClient() {
  return new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY,
  });
}

export async function getDevelopersContainer() {
  const client = await getClient();
  const { database } = await client.databases.createIfNotExists({ id: DATABASE });
  const { container } = await database.containers.createIfNotExists({
    id: DEVELOPERS_CONTAINER,
    partitionKey: { paths: ['/location'] },
  });
  return container;
}

/**
 * Looks up a developer document by canonical (lowercased) login, returning
 * the resource including its `_etag` for optimistic-concurrency writes.
 */
export async function findDeveloperByLogin(container, login) {
  const { resources } = await container.items
    .query({
      query: 'SELECT * FROM c WHERE LOWER(c.login) = @login',
      parameters: [{ name: '@login', value: login.toLowerCase() }],
    })
    .fetchAll();
  return resources[0] || null;
}

/**
 * Patches an existing nomination document's lifecycle fields in place using
 * an ETag precondition, so two simultaneous review actions on the same
 * nomination can't silently clobber each other — the losing write gets a
 * Cosmos precondition-failed (412) error instead.
 *
 * Never touches `location` (the partition key) or `id`/`login`, so the
 * item's partition assignment is stable for its entire lifecycle.
 */
export async function patchDeveloperNomination(container, doc, updates) {
  const next = {
    ...doc,
    ...updates,
  };
  if (doc.nomination || updates.nomination) {
    next.nomination = { ...doc.nomination, ...updates.nomination };
  }
  delete next._etag;
  delete next._rid;
  delete next._self;
  delete next._ts;

  const item = container.item(doc.id, doc.location);
  const { resource } = await item.replace(next, { accessCondition: { type: 'IfMatch', condition: doc._etag } });
  return resource;
}

export async function submitNomination({ username, location, email, emailConsent }) {
  if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) {
    return { status: 500, body: { error: 'Cosmos DB credentials not configured' } };
  }

  const cleanUsername = normalizeUsername(username);
  if (!USERNAME_RE.test(cleanUsername)) {
    return {
      status: 400,
      body: { error: 'Please enter a valid GitHub username (letters, numbers, hyphens).' },
    };
  }

  if (emailConsent !== true) {
    return { status: 400, body: { error: 'Email consent is required for nomination updates.' } };
  }

  let contactEmail;
  try {
    contactEmail = normalizeContactEmail(email);
  } catch (error) {
    if (error instanceof DeveloperContactValidationError) {
      return { status: 400, body: { error: error.message } };
    }
    throw error;
  }

  let ghUser;
  try {
    const verified = await verifyGitHubUser(cleanUsername);
    if (!verified.ok && verified.notFound) {
      return { status: 404, body: { error: 'GitHub user does not exist.' } };
    }
    if (!verified.ok && verified.rateLimited) {
      return { status: 503, body: { error: 'GitHub API rate limit reached. Please try again shortly.' } };
    }
    if (!verified.ok) {
      return { status: 502, body: { error: 'Could not verify the GitHub username. Please try again.' } };
    }
    ghUser = verified.user;
  } catch (err) {
    console.error('GitHub validation error:', err.message);
    return { status: 502, body: { error: 'Could not verify the GitHub username. Please try again.' } };
  }

  let container;
  try {
    container = await getDevelopersContainer();
  } catch (err) {
    console.error('Cosmos DB connection error:', err.message);
    return { status: 500, body: { error: 'Could not connect to the database. Please try again.' } };
  }

  try {
    const existing = await findDeveloperByLogin(container, cleanUsername);

    if (existing && isPublicDeveloper(existing)) {
      // Never overwrite an existing approved/public developer document.
      return { status: 409, body: { error: 'This developer is already on the globe.' } };
    }

    if (existing && existing.nomination?.status === 'pending') {
      await saveDeveloperContact({
        login: existing.login,
        email: contactEmail,
        source: 'self-nomination',
        emailVerified: false,
        transactionalEmailsEnabled: true,
      });
      // Idempotent: repeating the same request shouldn't error or duplicate.
      return {
        status: 200,
        body: { message: 'This username is already in the review queue.', username: cleanUsername, status: 'pending' },
      };
    }

    // `existing` is either absent, or a previously-rejected nomination that
    // the person is resubmitting — both fall through to (re)create it as a
    // fresh pending nomination below.

    const enriched = await enrichFromGitHub(cleanUsername, ghUser);
    const resolvedLocation = existing ? existing.location : resolveLocation(location, enriched.githubLocation);
    const coordinates = await geocodeLocation(resolvedLocation);
    const now = new Date().toISOString();

    const doc = {
      id: enriched.login.toLowerCase(),
      login: enriched.login,
      name: enriched.name,
      avatarUrl: enriched.avatarUrl,
      bio: enriched.bio,
      githubUrl: enriched.githubUrl,
      location: resolvedLocation,
      ...(coordinates ? { lat: coordinates.lat, lng: coordinates.lng } : {}),
      followers: enriched.followers,
      publicRepos: enriched.publicRepos,
      totalStars: enriched.totalStars,
      totalForks: enriched.totalForks,
      totalWatchers: enriched.totalWatchers,
      totalCommits: enriched.totalCommits,
      topLanguage: enriched.topLanguage,
      languages: enriched.languages,
      topRepos: enriched.topRepos,
      metricsUpdatedAt: now,
      schemaVersion: SCHEMA_VERSION,
      source: 'self-nomination',
      nomination: {
        status: 'pending',
        submittedAt: now,
        submittedLocation: String(location || '').trim() || null,
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
        enrichmentStatus: enriched.enrichmentStatus,
        enrichedAt: now,
        enrichmentError: enriched.enrichmentError,
      },
    };

    await container.items.upsert(doc);
    await saveDeveloperContact({
      login: enriched.login,
      email: contactEmail,
      source: 'self-nomination',
      emailVerified: false,
      transactionalEmailsEnabled: true,
    });

    return {
      status: 201,
      body: { message: "Thanks! We'll review and add you within a week.", username: cleanUsername, status: 'pending' },
    };
  } catch (err) {
    console.error('Nomination storage error:', err.message);
    return { status: 500, body: { error: 'Failed to store nomination.' } };
  }
}