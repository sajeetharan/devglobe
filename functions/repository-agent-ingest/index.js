const { getContainer } = require('../shared/cosmos');
const { scanDeveloperRepositorySignals } = require('../shared/repository-agent-signals');

const BATCH_SIZE = 40;
const REFRESH_DAYS = 7;

module.exports = async function repositoryAgentIngest(context, {
  container = getContainer(),
  fetchImpl = fetch,
  now = () => new Date(),
  token = process.env.GITHUB_TOKEN,
} = {}) {
  token = String(token || '').trim();
  if (!token) {
    context.log.warn('Repository agent ingestion skipped: GITHUB_TOKEN is not configured');
    return;
  }

  const runAt = now();
  const cutoff = new Date(runAt.getTime() - REFRESH_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { resources: developers } = await container.items.query({
    query: `SELECT TOP ${BATCH_SIZE} c.id, c.login, c.location
      FROM c
      WHERE IS_DEFINED(c.login)
        AND (NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')
        AND (NOT IS_DEFINED(c.repositoryAgentSignals.scannedAt) OR c.repositoryAgentSignals.scannedAt < @cutoff)`,
    parameters: [{ name: '@cutoff', value: cutoff }],
  }).fetchAll();

  let updated = 0;
  let detected = 0;
  let failed = 0;

  for (const developer of developers) {
    try {
      const result = await scanDeveloperRepositorySignals(fetchImpl, developer.login, token);
      const value = {
        source: 'public-repository',
        scannedAt: runAt.toISOString(),
        scannedRepositories: result.scannedRepositories,
        toolIds: result.signals.map(signal => signal.id),
        signals: result.signals,
      };
      await container.item(developer.id, developer.location || 'Unknown').patch({
        operations: [{ op: 'set', path: '/repositoryAgentSignals', value }],
      });
      updated += 1;
      if (result.signals.length > 0) detected += 1;
    } catch (error) {
      failed += 1;
      context.log.warn('Repository agent scan failed', {
        login: developer.login,
        status: error.status,
        message: error.message,
      });
      if (error.status === 403 || error.status === 429 || error.rateLimitRemaining === 0) break;
    }
  }

  context.log('Repository agent ingestion completed', {
    selected: developers.length,
    updated,
    detected,
    failed,
    cutoff,
  });
};
