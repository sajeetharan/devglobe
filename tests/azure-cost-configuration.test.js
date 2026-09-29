import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('web deployment preserves scale-to-zero configuration', async () => {
  const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');
  assert.match(workflow, /--min-replicas 0/);
  assert.match(workflow, /--max-replicas 3/);
});

test('cost workflow guards and verifies the Cosmos autoscale migration', async () => {
  const workflow = await readFile('.github/workflows/optimize-azure-costs.yml', 'utf8');
  assert.match(workflow, /inputs\.confirmation == 'APPLY-COST-OPTIMIZATION'/);
  assert.match(workflow, /expected manual throughput 4000 RU\/s/);
  assert.match(workflow, /already_optimized=true/);
  assert.match(workflow, /migration_required=true/);
  assert.match(workflow, /if: steps\.throughput\.outputs\.migration_required == 'true'/);
  assert.match(workflow, /--throughput-type autoscale/);
  assert.match(workflow, /--max-throughput "\$AUTOSCALE_MAX_RU"/);
  assert.match(workflow, /IMPACT_HISTORY_TTL_SECONDS: 10368000/);
  assert.match(workflow, /--ttl "\$IMPACT_HISTORY_TTL_SECONDS"/);
});

test('hot public routes reuse Cosmos connections and expose bounded caches', async () => {
  const routes = await Promise.all([
    'app/api/trending/route.js',
    'app/api/country-stats/route.js',
    'app/api/developer/route.js',
    'app/api/developers/route.js',
    'app/api/search/route.js',
  ].map(file => readFile(file, 'utf8')));

  for (const route of routes) {
    assert.doesNotMatch(route, /new CosmosClient/);
    assert.match(route, /getCosmosContainer/);
  }
  assert.match(routes[0], /TRENDING_CACHE_MS = 60 \* 60 \* 1000/);
  assert.match(routes[1], /COUNTRY_STATS_CACHE_MS = 60 \* 60 \* 1000/);
  assert.match(routes[1], /countryStatsPromise \|\|=/);
});

test('Cosmos helper reuses clients across containers', async () => {
  const helper = await readFile('lib/cosmos.js', 'utf8');
  assert.match(helper, /const clients = new Map\(\)/);
  assert.match(helper, /clients\.get\(clientKey\)/);
  assert.match(helper, /clients\.set\(clientKey, client\)/);
});