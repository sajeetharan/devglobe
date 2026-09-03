import { getCosmosContainer } from './cosmos.js';
import { getEngagementContainer } from './engagement-store.js';
import {
  MAINTAINER_OUTREACH_LIMIT,
  selectMaintainerOutreachDrafts,
  summarizeMaintainerOutreach,
} from './maintainer-outreach.js';
import {
  getMaintainerOutreachContainer,
  listMaintainerOutreachRecords,
  saveMaintainerOutreachDraft,
} from './maintainer-outreach-store.js';

async function loadCandidates(container) {
  if (!container) throw new Error('Developer Cosmos container is required');
  const { resources } = await container.items.query({
    query: `SELECT TOP 500 c.login, c.name, c.topLanguage, c.score, c.totalStars,
        c.totalCommits, c.followers, c.soReputation, c.claimed
      FROM c
      WHERE (NOT IS_DEFINED(c.nomination) OR c.nomination.status = "approved")
        AND (NOT IS_DEFINED(c.claimed) OR c.claimed != true)
      ORDER BY c.score DESC`,
  }).fetchAll();
  return resources;
}

export async function runMaintainerOutreachSchedule({
  now = new Date(),
  limit = MAINTAINER_OUTREACH_LIMIT,
  developers,
  developerContainer = getCosmosContainer(),
  outreachContainer = getMaintainerOutreachContainer(),
} = {}) {
  if (!outreachContainer) throw new Error('Maintainer outreach Cosmos container is required');
  const [candidates, records] = await Promise.all([
    developers ? Promise.resolve(developers) : loadCandidates(developerContainer),
    listMaintainerOutreachRecords(undefined, outreachContainer),
  ]);
  const drafts = selectMaintainerOutreachDrafts({ developers: candidates, records, now, limit });
  const queued = [];
  for (const draft of drafts) queued.push(await saveMaintainerOutreachDraft(draft, outreachContainer));
  return { selected: drafts.length, queued: queued.length, delivery: 'manual_review_only' };
}

export async function getMaintainerOutreachReport({
  now = new Date(),
  days = 30,
  outreachContainer = getMaintainerOutreachContainer(),
  engagementContainer = getEngagementContainer(),
} = {}) {
  const records = await listMaintainerOutreachRecords(undefined, outreachContainer);
  if (!engagementContainer) return summarizeMaintainerOutreach(records);
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const { resources } = await engagementContainer.items.query({
    query: `SELECT c.eventName, c.targetLogin FROM c
      WHERE c.documentType = "engagement-event"
        AND c.createdAt >= @since
        AND c.eventName IN ("profile_viewed", "profile_claimed")
        AND c.properties.source = "manual_outreach"
        AND c.properties.campaign = "developer_activation"`,
    parameters: [{ name: '@since', value: since }],
  }).fetchAll();
  return summarizeMaintainerOutreach(records, resources);
}