/**
 * Build Dataset — orchestrates the full data pipeline
 *
 * Usage: node scripts/build-dataset.js
 *
 * Runs: fetch-github → fetch-stackoverflow → geocode → score → output
 * Output: data/developers.json (final dataset used by frontend)
 *
 * For quick local development, use data/developers-sample.json instead.
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { scoreAll } from '../lib/scoring.js';
import { addDeveloperRanks } from '../lib/ranking.js';
import { enrichWithCollaborators } from '../lib/collaboration.js';

function run(script, description) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  STEP: ${description}`);
  console.log(`${'='.repeat(60)}\n`);
  execSync(`node ${script}`, { stdio: 'inherit', cwd: process.cwd() });
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     DevGlobe Data Pipeline Builder      ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Ensure data directory exists
  mkdirSync('data', { recursive: true });

  // Check for required env vars
  if (!process.env.GITHUB_TOKEN) {
    console.error('⚠️  GITHUB_TOKEN not set. Create a .env file (see .env.example).');
    console.error('   The pipeline needs a GitHub token to fetch developer data.\n');
    process.exit(1);
  }

  // Step 1: Fetch GitHub data
  run('scripts/fetch-github.js', 'Fetching GitHub developer data');

  // Step 2: Enrich with StackOverflow data
  run('scripts/fetch-stackoverflow.js', 'Fetching StackOverflow data');

  // Step 3: Geocode locations
  run('scripts/geocode.js', 'Geocoding developer locations');

  // Step 4: Apply scoring
  console.log(`\n${'='.repeat(60)}`);
  console.log('  STEP: Computing composite scores');
  console.log(`${'='.repeat(60)}\n`);

  const developers = JSON.parse(readFileSync('data/github-so-geo.json', 'utf-8'))
    // Freshness: record when each profile's metrics were captured, so the UI
    // can show "last refreshed" and flag stale profiles. githubFetchedAt is
    // always present (every profile goes through fetch-github.js); soFetchedAt
    // only exists when a Stack Overflow match was found.
    .map(dev => ({
      ...dev,
      metricsUpdatedAt: dev.soFetchedAt && dev.soFetchedAt < dev.githubFetchedAt
        ? dev.soFetchedAt
        : dev.githubFetchedAt || dev.soFetchedAt || null,
    }));

  // Reuse the exact same scoring module the frontend uses, so the shipped
  // dataset's scores are always consistent with what the app would compute
  // client-side — no risk of the two implementations drifting apart.
  const scored = addDeveloperRanks(scoreAll(developers));

  // Step 5: Compute collaboration networks (shared topRepos)
  console.log(`\n${'='.repeat(60)}`);
  console.log('  STEP: Building developer collaboration graph');
  console.log(`${'='.repeat(60)}\n`);
  const finalDataset = enrichWithCollaborators(scored);

  // Write final output
  writeFileSync('data/developers.json', JSON.stringify(finalDataset, null, 2));

  // Score distribution summary, for reviewing calibration (spread, outliers,
  // how many profiles land in sparse-data territory) each time the dataset
  // is rebuilt.
  const scores = scored.map(d => d.score).sort((a, b) => a - b);
  const pct = p => scores[Math.min(scores.length - 1, Math.floor((p / 100) * scores.length))];
  const sparseCount = scored.filter(d => !d.scoreHasSO).length;

  console.log(`\n✅ Pipeline complete!`);
  console.log(`   Total developers: ${scored.length}`);
  console.log(`   Top scorer: ${scored[0]?.login} (${scored[0]?.score}/100)`);
  console.log(`   Score distribution: min=${scores[0]} p25=${pct(25)} median=${pct(50)} p75=${pct(75)} max=${scores[scores.length - 1]}`);
  console.log(`   Profiles without Stack Overflow data (weight redistributed): ${sparseCount}/${scored.length}`);
  console.log(`   Output: data/developers.json`);
  console.log(`\n   To use in the app, update DATA_URL in src/app.js to 'data/developers.json'`);
}

main().catch(err => {
  console.error('\n❌ Pipeline failed:', err.message);
  process.exit(1);
});