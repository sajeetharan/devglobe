/**
 * Enrich developers — adds real commit counts, better star/fork totals,
 * and deduplicates records in Cosmos DB.
 *
 * Uses GitHub GraphQL API (batching 20 users per request, 1 point each).
 */
import { CosmosClient } from '@azure/cosmos';
import dotenv from 'dotenv';
import fs from 'fs';
import { enrichWithCollaborators } from '../lib/collaboration.js';

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT;
const COSMOS_KEY = process.env.COSMOS_KEY;

const client = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
const container = client.database('devglobe').container('developers');

const BATCH_SIZE = 10;
const CHECKPOINT_FILE = 'data/enrich-checkpoint.json';

// ─── Load/save checkpoint ───────────────────────────────────────────────────
function loadCheckpoint() {
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8')); }
  catch { return { enriched: [], deduped: false }; }
}

function saveCheckpoint(cp) {
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp));
}

// ─── Step 1: Deduplicate ────────────────────────────────────────────────────
async function deduplicate() {
  console.log('\n📋 Step 1: Finding duplicates...');

  const { resources } = await container.items.query(
    'SELECT c.id, c.login, c.totalStars, c.totalCommits, c.followers, c.topLanguage, c.location FROM c'
  ).fetchAll();

  // Group by login
  const byLogin = new Map();
  for (const dev of resources) {
    if (!byLogin.has(dev.login)) byLogin.set(dev.login, []);
    byLogin.get(dev.login).push(dev);
  }

  const duplicates = [...byLogin.entries()].filter(([, docs]) => docs.length > 1);
  console.log(`   Found ${duplicates.length} logins with duplicates`);

  let deleted = 0;
  for (const [login, docs] of duplicates) {
    // Keep the doc with the most data (highest totalStars + totalCommits + followers)
    docs.sort((a, b) => {
      const scoreA = (a.totalStars || 0) + (a.totalCommits || 0) + (a.followers || 0) + (a.topLanguage ? 100 : 0);
      const scoreB = (b.totalStars || 0) + (b.totalCommits || 0) + (b.followers || 0) + (b.topLanguage ? 100 : 0);
      return scoreB - scoreA;
    });

    // Delete all but the best one
    for (let i = 1; i < docs.length; i++) {
      try {
        await container.item(docs[i].id, docs[i].location || 'Unknown').delete();
        deleted++;
      } catch (err) {
        // Try without partition key match
        try {
          const { resources: found } = await container.items.query({
            query: 'SELECT * FROM c WHERE c.id = @id',
            parameters: [{ name: '@id', value: docs[i].id }]
          }).fetchAll();
          if (found.length > 0) {
            await container.item(found[0].id, found[0].location).delete();
            deleted++;
          }
        } catch { /* skip */ }
      }
    }
  }

  console.log(`   ✅ Deleted ${deleted} duplicate records`);
  return deleted;
}

// ─── Step 2: Enrich with commits + better repo data ────────────────────────
async function fetchEnrichmentBatch(logins) {
  const fragments = logins.map((login, i) => {
    const alias = `u${i}`;
    return `${alias}: user(login: "${login.replace(/"/g, '')}") {
      login
      contributionsCollection {
        contributionCalendar { totalContributions }
      }
      repositories(first: 10, orderBy: {field: STARGAZERS, direction: DESC}, ownerAffiliations: OWNER) {
        totalCount
        nodes { name stargazerCount forkCount primaryLanguage { name } }
      }
    }`;
  });

  const query = `query { ${fragments.join('\n')} }`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const resp = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(45000),
    }).catch(err => {
      console.log(`    ⚠ Fetch error: ${err.message?.slice(0, 60)}`);
      return null;
    });

    if (!resp) { await new Promise(r => setTimeout(r, 5000)); continue; }

    if (resp.status === 200) {
      let json;
      try {
        json = await resp.json();
      } catch (e) {
        console.log(`    ⚠ JSON parse error, retrying...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      if (json.errors && !json.data) return [];
      const users = [];
      for (let i = 0; i < logins.length; i++) {
        const userData = json.data?.[`u${i}`];
        if (userData) users.push(userData);
      }
      return users;
    }

    if (resp.status === 403 || resp.status === 429) {
      const reset = resp.headers.get('x-ratelimit-reset');
      const waitSec = reset ? Math.max(0, parseInt(reset) - Math.floor(Date.now() / 1000)) + 5 : 65;
      console.log(`    ⏳ Rate limited, waiting ${waitSec}s...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
      continue;
    }

    if (resp.status === 502 || resp.status === 503) {
      await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
      continue;
    }

    await new Promise(r => setTimeout(r, 5000));
  }
  return [];
}

function processEnrichment(user) {
  const repos = user.repositories?.nodes || [];
  const totalStars = repos.reduce((s, r) => s + (r?.stargazerCount || 0), 0);
  const totalForks = repos.reduce((s, r) => s + (r?.forkCount || 0), 0);
  const totalCommits = user.contributionsCollection?.contributionCalendar?.totalContributions || 0;

  const langCounts = {};
  repos.forEach(r => {
    const lang = r?.primaryLanguage?.name;
    if (lang) langCounts[lang] = (langCounts[lang] || 0) + 1;
  });
  const topLanguage = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    totalStars,
    totalForks,
    totalCommits,
    topLanguage,
    publicRepos: user.repositories?.totalCount || 0,
    languages: Object.entries(langCounts).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([name, count]) => ({ name, percent: Math.round((count / (repos.length || 1)) * 100) })),
    topRepos: repos.filter(r => r).slice(0, 10).map(r => ({
      name: r.name, stars: r.stargazerCount, forks: r.forkCount
    })),
  };
}

async function enrichDevs() {
  console.log('\n📊 Step 2: Enriching developers with commits & repo data...');

  const cp = loadCheckpoint();
  const enrichedSet = new Set(cp.enriched);

  // Get all devs that need enrichment (commits = 0 or missing topLanguage)
  const { resources: needsEnrich } = await container.items.query(
    'SELECT c.id, c.login, c.location FROM c WHERE c.totalCommits = 0 OR NOT IS_DEFINED(c.topLanguage) OR c.topLanguage = null'
  ).fetchAll();

  // Filter out already-enriched
  const remaining = needsEnrich.filter(d => !enrichedSet.has(d.login));
  console.log(`   Found ${needsEnrich.length} needing enrichment, ${remaining.length} remaining after checkpoint`);

  let processed = enrichedSet.size;
  let errors = 0;

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    console.log(`   [batch ${i / BATCH_SIZE}] Fetching ${batch.length} users from GitHub...`);
    const users = await fetchEnrichmentBatch(batch.map(d => d.login));
    console.log(`   [batch ${i / BATCH_SIZE}] Got ${users.length} users, patching Cosmos...`);

    const enrichMap = new Map();
    for (const user of users) {
      enrichMap.set(user.login, processEnrichment(user));
    }

    // Patch Cosmos DB (10 concurrent, with 15s timeout per patch)
    for (let p = 0; p < batch.length; p += 10) {
      const chunk = batch.slice(p, p + 10);
      await Promise.all(chunk.map(async (dev) => {
        const enrichData = enrichMap.get(dev.login);
        if (!enrichData) return;
        try {
          const operations = [
            { op: 'set', path: '/totalCommits', value: enrichData.totalCommits },
            { op: 'set', path: '/totalStars', value: enrichData.totalStars },
            { op: 'set', path: '/totalForks', value: enrichData.totalForks },
            { op: 'set', path: '/publicRepos', value: enrichData.publicRepos },
            { op: 'set', path: '/topRepos', value: enrichData.topRepos },
            { op: 'set', path: '/languages', value: enrichData.languages },
          ];
          if (enrichData.topLanguage) {
            operations.push({ op: 'set', path: '/topLanguage', value: enrichData.topLanguage });
          }
          const patchPromise = container.item(dev.id, dev.location || 'Unknown').patch({ operations });
          const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
          await Promise.race([patchPromise, timeout]);
          enrichedSet.add(dev.login);
        } catch (err) {
          if (errors < 5) console.log(`    ⚠ Patch error ${dev.login}: ${err.message?.slice(0, 50)}`);
          errors++;
        }
      }));
    }

    processed += batch.length;
    console.log(`   Enriched: ${processed}/${needsEnrich.length} (errors: ${errors})`);
    if (processed % 200 === 0 || i + BATCH_SIZE >= remaining.length) {
      cp.enriched = [...enrichedSet];
      saveCheckpoint(cp);
    }
  }

  console.log(`   ✅ Enrichment complete. ${processed} processed, ${errors} errors`);
}

// ─── Step 3: Compute collaboration networks ──────────────────────────────────
async function enrichCollaborators() {
  console.log('\n🌐 Step 3: Computing collaboration graph across developers...');
  const { resources: allDevs } = await container.items
    .query('SELECT c.id, c.login, c.name, c.avatarUrl, c.location, c.lat, c.lng, c.totalStars, c.topLanguage, c.topRepos FROM c')
    .fetchAll();

  console.log(`   Found ${allDevs.length} developers. Calculating shared repository networks...`);
  const enriched = enrichWithCollaborators(allDevs);
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < enriched.length; i += 10) {
    const chunk = enriched.slice(i, i + 10);
    await Promise.all(chunk.map(async (dev) => {
      if (!dev?.id) return;
      try {
        const operations = [{ op: 'set', path: '/collaborators', value: dev.collaborators ?? [] }];
        const patchPromise = container.item(dev.id, dev.location || 'Unknown').patch({ operations });
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
        await Promise.race([patchPromise, timeout]);
        updated++;
      } catch (err) {
        if (errors < 5) console.log(`    ⚠ Collaborator patch error ${dev?.login || dev?.id}: ${err.message?.slice(0, 50)}`);
        errors++;
      }
    }));
  }

  console.log(`   ✅ Collaboration graph complete. ${updated} developers updated (errors: ${errors})`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔧 Developer Data Enrichment');
  console.log('============================\n');

  // Step 1: Deduplicate
  const cp = loadCheckpoint();
  if (!cp.deduped) {
    await deduplicate();
    cp.deduped = true;
    saveCheckpoint(cp);
  } else {
    console.log('📋 Step 1: Dedup already done, skipping');
  }

  // Step 2: Enrich (commits, stars, repos)
  await enrichDevs();

  // Step 3: Compute collaboration graph
  await enrichCollaborators();

  console.log('\n🎉 All done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
