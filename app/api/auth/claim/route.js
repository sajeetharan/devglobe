import { CosmosClient } from '@azure/cosmos';
import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth.js';
import { promises as fs } from 'fs';
import path from 'path';
import { buildClaimWelcomeEmail, sendLifecycleEmail } from '../../../../lib/lifecycle-email.js';

const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT;
const COSMOS_KEY = process.env.COSMOS_KEY;
const DATABASE = process.env.COSMOS_DATABASE || 'devglobe';
const CONTAINER = process.env.COSMOS_CONTAINER || 'developers';

/**
 * Fetch public GitHub profile and build a developer document.
 */
async function buildProfileFromGitHub(login) {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    ...(process.env.GITHUB_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }),
  };

  // Fetch user profile
  const userRes = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, { headers });
  if (!userRes.ok) return null;
  const user = await userRes.json();

  // Fetch top repos for stars/forks/language stats
  const reposRes = await fetch(
    `https://api.github.com/users/${encodeURIComponent(login)}/repos?sort=stars&per_page=10&type=owner`,
    { headers }
  );
  const repos = reposRes.ok ? await reposRes.json() : [];

  const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const totalForks = repos.reduce((sum, r) => sum + (r.forks_count || 0), 0);

  // Determine top language
  const langCounts = {};
  for (const r of repos) {
    if (r.language) langCounts[r.language] = (langCounts[r.language] || 0) + (r.stargazers_count || 1);
  }
  const topLanguage = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const topRepos = repos.slice(0, 3).map(r => ({
    name: r.name,
    url: r.html_url || `https://github.com/${encodeURIComponent(user.login)}/${encodeURIComponent(r.name)}`,
    stars: r.stargazers_count || 0,
    forks: r.forks_count || 0,
  }));

  return {
    id: login,
    login: user.login,
    name: user.name || user.login,
    avatarUrl: user.avatar_url,
    bio: user.bio || '',
    location: user.location || '',
    lat: null,
    lng: null,
    followers: user.followers || 0,
    publicRepos: user.public_repos || 0,
    totalStars,
    totalForks,
    totalCommits: 0,
    topLanguage,
    topRepos,
    languages: topLanguage ? [{ name: topLanguage, percent: 100 }] : [],
    soUserId: null,
    soReputation: 0,
    soAnswers: 0,
    soAcceptRate: 0,
    soBadges: 0,
    specialTags: [],
    claimed: true,
    claimedAt: new Date().toISOString(),
    claimedBy: login,
    metricsUpdatedAt: new Date().toISOString(),
  };
}

export async function POST() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const login = session.login;

  // If Cosmos DB is configured, update or create the developer record
  if (COSMOS_ENDPOINT && COSMOS_KEY) {
    try {
      const client = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
      const container = client.database(DATABASE).container(CONTAINER);

      // Find developer by login
      const { resources } = await container.items.query({
        query: 'SELECT * FROM c WHERE c.login = @login',
        parameters: [{ name: '@login', value: login }],
      }).fetchAll();

      let dev;
      const wasClaimed = resources[0]?.claimed === true;

      if (resources.length > 0) {
        // Existing profile — mark as claimed
        dev = resources[0];
        dev.claimed = true;
        dev.claimedAt = new Date().toISOString();
        dev.claimedBy = login;
      } else {
        // No profile — create one from GitHub data
        dev = await buildProfileFromGitHub(login);
        if (!dev) {
          return NextResponse.json(
            { error: 'Could not fetch your GitHub profile' },
            { status: 502 }
          );
        }
      }

      await container.items.upsert(dev);

      if (!wasClaimed) {
        try {
          await sendLifecycleEmail({
            to: session.email,
            message: buildClaimWelcomeEmail({ login: dev.login, name: dev.name }),
            idempotencyKey: `profile-claimed-${dev.login.toLowerCase()}`,
          });
        } catch (emailError) {
          console.error('Claim email delivery failed:', emailError.message);
        }
      }

      return NextResponse.json({
        ok: true,
        login,
        created: resources.length === 0,
        claimedAt: dev.claimedAt,
      });
    } catch (err) {
      console.error('Claim error:', err);
      return NextResponse.json({ error: 'Failed to claim profile' }, { status: 500 });
    }
  }

  // Fallback: dev mode without Cosmos DB
  const filePath = path.join(process.cwd(), 'data', 'developers-sample.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const dev = data.find(d => d.login === login);

  return NextResponse.json({
    ok: true,
    login,
    created: !dev,
    claimedAt: new Date().toISOString(),
    note: 'Claim recorded (dev mode — not persisted without Cosmos DB)',
  });
}
