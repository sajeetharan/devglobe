/**
 * Admin review flow for "Add me to DevGlobe" nominations.
 *
 * Usage:
 *   node scripts/review-nominations.js list                          # show pending/rejected nominations
 *   node scripts/review-nominations.js status <username>
 *   node scripts/review-nominations.js approve <username> [reviewer]
 *   node scripts/review-nominations.js refresh <username>
 *   node scripts/review-nominations.js reject <username> [reviewer] [reason]
 *
 * As of issue #96, nominations live entirely inside the `developers`
 * container as `nomination`-tagged documents — there is no separate
 * container. Approving/rejecting patches the same document in place (never
 * creates a second item) using an ETag precondition, so two people running
 * this concurrently on the same username can't silently overwrite each
 * other's review.
 */
import dotenv from 'dotenv';
import {
  getDevelopersContainer,
  findDeveloperByLogin,
  patchDeveloperNomination,
  normalizeUsername,
  enrichFromGitHub,
  geocodeLocation,
} from '../lib/nominate.js';
import { buildNominationApprovedEmail, sendLifecycleEmail } from '../lib/lifecycle-email.js';
import { getDeveloperContact } from '../lib/developer-contact-store.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) {
  console.error('Error: COSMOS_ENDPOINT and COSMOS_KEY are required in .env.local or .env');
  process.exit(1);
}

async function listNominations(container) {
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE IS_DEFINED(c.nomination) AND c.nomination.status IN ('pending', 'rejected') ORDER BY c.nomination.submittedAt",
    })
    .fetchAll();
  if (resources.length === 0) {
    console.log('No pending or rejected nominations found.');
    return;
  }
  console.log(`Found ${resources.length} nomination(s):\n`);
  for (const dev of resources) {
    const date = new Date(dev.nomination.submittedAt).toLocaleString();
    const enrich = dev.nomination.enrichmentStatus !== 'complete' ? ` [enrichment: ${dev.nomination.enrichmentStatus}]` : '';
    console.log(
      `  [${dev.nomination.status}] ${dev.login.padEnd(24)} (${dev.name || '—'})` +
      `${dev.location ? ` — ${dev.location}` : ''} — submitted ${date}${enrich}`
    );
  }
}

async function requireNomination(container, username, allowLegacy = false) {
  const dev = await findDeveloperByLogin(container, username);
  if (!dev) {
    console.error(`No developer document found for "${username}".`);
    process.exit(1);
  }
  if (!dev.nomination && !allowLegacy) {
    console.error(`"${username}" has no nomination metadata (it's a pre-existing public developer, not a nomination).`);
    process.exit(1);
  }
  return dev;
}

async function approve(container, username, reviewer, refresh = false) {
  const dev = await requireNomination(container, username, refresh);
  if (dev.nomination?.status === 'approved' && !refresh) {
    console.error(`"${username}" is already approved.`);
    process.exit(1);
  }

  console.log(`${refresh ? 'Refreshing' : 'Approving'} "${username}"...`);

  // Re-enrich in case the pending record has stale or partial data (e.g. it
  // was created while GitHub was rate-limiting repo lookups).
  const ghRes = await fetch(`https://api.github.com/users/${dev.login}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'devglobe-review',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!ghRes.ok) {
    console.error(`Could not re-fetch GitHub profile for "${username}" (status ${ghRes.status}). Aborting approval.`);
    process.exit(1);
  }
  const ghUser = await ghRes.json();
  const enriched = await enrichFromGitHub(dev.login, ghUser);

  if (enriched.enrichmentStatus !== 'complete') {
    console.error(
      `Refusing to approve "${username}": enrichment is still ${enriched.enrichmentStatus} ` +
      `(${enriched.enrichmentError || 'unknown reason'}). Try again once GitHub data is fully available.`
    );
    process.exit(1);
  }

  // Geocode using the location resolved at submission time. `location`
  // itself (the partition key) is intentionally never changed here — only
  // lat/lng and other non-partition fields are updated.
  const coords = await geocodeLocation(dev.location);

  try {
    await patchDeveloperNomination(container, dev, {
      name: enriched.name,
      avatarUrl: enriched.avatarUrl,
      bio: enriched.bio,
      githubUrl: enriched.githubUrl,
      followers: enriched.followers,
      publicRepos: enriched.publicRepos,
      totalStars: enriched.totalStars,
      totalForks: enriched.totalForks,
      totalWatchers: enriched.totalWatchers,
      totalCommits: enriched.totalCommits,
      topLanguage: enriched.topLanguage,
      languages: enriched.languages,
      topRepos: enriched.topRepos,
      metricsUpdatedAt: new Date().toISOString(),
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      ...(dev.nomination ? { nomination: {
        status: refresh ? dev.nomination.status : 'approved',
        reviewedAt: refresh ? dev.nomination.reviewedAt : new Date().toISOString(),
        reviewedBy: refresh ? dev.nomination.reviewedBy : reviewer || null,
        enrichmentStatus: 'complete',
        enrichedAt: new Date().toISOString(),
        enrichmentError: null,
      } } : {}),
    });
  } catch (err) {
    if (err.code === 412) {
      console.error(`  ✗ "${username}" was modified by another review action concurrently. Re-run to review the latest version.`);
      process.exit(1);
    }
    throw err;
  }

  if (!refresh) {
    let recipient = ghUser.email;
    try {
      const contact = await getDeveloperContact(dev.login);
      if (contact?.transactionalEmailsEnabled) recipient = contact.email;
    } catch (contactError) {
      console.error(`  Private contact lookup failed: ${contactError.message}`);
    }

    try {
      await sendLifecycleEmail({
        to: recipient,
        message: buildNominationApprovedEmail({ login: dev.login, name: enriched.name }),
        idempotencyKey: `nomination-approved-${dev.login.toLowerCase()}-${Date.parse(dev.nomination.submittedAt)}`,
      });
    } catch (emailError) {
      console.error(`  Approval email delivery failed: ${emailError.message}`);
    }
  }

  console.log(`  ✓ "${username}" ${refresh ? 'details refreshed' : 'approved and now public'}.`);
}

async function reject(container, username, reviewer, reason) {
  const dev = await requireNomination(container, username);

  try {
    await patchDeveloperNomination(container, dev, {
      nomination: {
        status: 'rejected',
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewer || null,
        rejectionReason: reason || null,
      },
    });
  } catch (err) {
    if (err.code === 412) {
      console.error(`  ✗ "${username}" was modified by another review action concurrently. Re-run to review the latest version.`);
      process.exit(1);
    }
    throw err;
  }

  console.log(`  ✓ "${username}" marked as rejected.`);
}

async function main() {
  const [cmd, rawUsername, ...rest] = process.argv.slice(2);
  const username = normalizeUsername(rawUsername);
  const container = await getDevelopersContainer();

  switch (cmd) {
    case 'list':
      await listNominations(container);
      break;
    case 'status':
      if (!username) { console.error('Usage: review-nominations.js status <username>'); process.exit(1); }
      console.log(JSON.stringify(await findDeveloperByLogin(container, username), null, 2));
      break;
    case 'approve':
      if (!username) { console.error('Usage: review-nominations.js approve <username> [reviewer]'); process.exit(1); }
      await approve(container, username, rest[0]);
      break;
    case 'refresh':
      if (!username) { console.error('Usage: review-nominations.js refresh <username>'); process.exit(1); }
      await approve(container, username, null, true);
      break;
    case 'reject':
      if (!username) { console.error('Usage: review-nominations.js reject <username> [reviewer] [reason]'); process.exit(1); }
      await reject(container, username, rest[0], rest[1]);
      break;
    default:
      console.log(`Usage: node scripts/review-nominations.js <command> [args]
  list                                Show pending/rejected nominations
  status <u>                          Show the full developer/nomination document
  approve <u> [reviewer]              Approve and make public (same document)
  refresh <u>                         Re-fetch details without changing visibility status
  reject <u> [reviewer] [reason]      Reject (same document, excluded from public reads)`);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});