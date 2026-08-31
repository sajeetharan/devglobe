import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = JSON.parse(fs.readFileSync(new URL('../dashboards/devglobe-product-adoption-dashboard.json', import.meta.url), 'utf8'));
const workbook = JSON.parse(fs.readFileSync(new URL('../dashboards/devglobe-product-adoption-workbook.json', import.meta.url), 'utf8'));

test('ADX dashboard contains the complete privacy-safe adoption scorecard', () => {
  const titles = new Set(dashboard.tiles.map(tile => tile.title));
  for (const title of ['Weekly Product Scorecard', 'Visitor to Value Funnel - Last 7 Days', 'Telemetry Health and Gaps', '7/30-Day Browser Retention', 'Route and Source Breakdown']) {
    assert.ok(titles.has(title), `missing ${title}`);
  }
  const queryText = dashboard.queries.map(query => query.text).join('\n');
  assert.match(queryText, /Previous7d/);
  assert.match(queryText, /MinimumCohort=3/);
  assert.match(queryText, /InstrumentationVersion/);
  assert.match(queryText, /Source !in \("local", "synthetic", "test"\)/);
  assert.match(queryText, /SearchEvent >= Visit/);
  assert.match(queryText, /ProfileEvent >= Search/);
  assert.match(queryText, /ActionEvent >= Profile/);
  assert.match(queryText, /Journey == "profile_primary_action"/);
  assert.match(queryText, /EventTime >= Start and EventTime < End/);
  assert.match(queryText, /EventTime >= ago\(180d\)/);
});

test('Azure Monitor workbook contains production-filtered scorecard and telemetry alerts', () => {
  const names = new Set(workbook.items.map(item => item.name));
  for (const name of ['weekly-scorecard', 'visitor-value-funnel', 'browser-retention', 'route-source-scorecard', 'telemetry-gaps']) {
    assert.ok(names.has(name), `missing ${name}`);
  }
  const queryText = workbook.items.map(item => item.content?.query || '').join('\n');
  assert.match(queryText, /operation_SyntheticSource/);
  assert.match(queryText, /url !startswith 'http:\/\/localhost'/);
  assert.match(queryText, /Privacy suppressed/);
  assert.match(queryText, /ALERT: missing/);
  assert.match(queryText, /SearchEvent>=Visit/);
  assert.match(queryText, /ProfileEvent>=Search/);
  assert.match(queryText, /ActionEvent>=Profile/);
  assert.match(queryText, /Journey=='profile_primary_action'/);
  assert.match(queryText, /timestamp>=Start and timestamp<End/);
  assert.match(queryText, /timestamp >= ago\(180d\)/);
});