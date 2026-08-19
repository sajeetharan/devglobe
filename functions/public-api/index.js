const { PUBLIC_FILTER, environmentValue, getContainer, projectDeveloper } = require('../shared/cosmos');
const { corsHeaders, json } = require('../shared/http');

const LIST_FIELDS = 'c.id, c.login, c.name, c.avatarUrl, c.location, c.lat, c.lng, c.followers, c.publicRepos, c.totalStars, c.totalCommits, c.topLanguage, c.soReputation, c.soAnswers, c.soBadges, c.score, c.specialTags, c.claimed, c.metricsUpdatedAt, c.aiProfile';
const DETAIL_FIELDS = 'c.id, c.login, c.name, c.avatarUrl, c.bio, c.githubUrl, c.location, c.lat, c.lng, c.followers, c.totalStars, c.totalForks, c.totalWatchers, c.totalCommits, c.topLanguage, c.languages, c.publicRepos, c.topRepos, c.soReputation, c.soAnswers, c.soAcceptRate, c.soBadges, c.soUserId, c.score, c.scoreDimensions, c.scoreWeights, c.scoreHasSO, c.scorePercentile, c.specialTags, c.claimed, c.claimedAt, c.metricsUpdatedAt, c.aiProfile';
const activityCache = new Map();

function boundedInteger(value, fallback, maximum) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) ? Math.min(Math.max(number, 1), maximum) : fallback;
}

function activityCursor(value) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return typeof cursor.id === 'string' && !Number.isNaN(Date.parse(cursor.createdAt)) ? cursor : null;
  } catch {
    return null;
  }
}

function encodeActivityCursor(activity) {
  return activity
    ? Buffer.from(JSON.stringify({ createdAt: activity.createdAt, id: activity.id })).toString('base64url')
    : null;
}

async function developers(request) {
  const { resources } = await getContainer().items.query(`SELECT ${LIST_FIELDS} FROM c WHERE ${PUBLIC_FILTER}`).fetchAll();
  return json(request, resources.map(projectDeveloper), 200, 'public, max-age=300, stale-while-revalidate=3600');
}

async function developer(request) {
  const id = request.query.id;
  if (!id) return json(request, { error: 'Query parameter "id" is required' }, 400, 'no-store');
  const { resources } = await getContainer().items.query({
    query: `SELECT ${DETAIL_FIELDS} FROM c WHERE (c.id = @id OR c.login = @id) AND ${PUBLIC_FILTER}`,
    parameters: [{ name: '@id', value: id }],
  }).fetchAll();
  return resources[0]
    ? json(request, projectDeveloper(resources[0]), 200, 'public, max-age=3600, stale-while-revalidate=86400')
    : json(request, { error: 'Developer not found' }, 404, 'public, max-age=60');
}

async function developerCount(request) {
  const { resources } = await getContainer().items.query(`SELECT VALUE COUNT(1) FROM c WHERE ${PUBLIC_FILTER}`).fetchAll();
  return json(request, { count: resources[0] || 0 }, 200, 'public, max-age=3600, stale-while-revalidate=86400');
}

async function embedding(text) {
  const endpoint = environmentValue(process.env.AZURE_OPENAI_ENDPOINT);
  const key = environmentValue(process.env.AZURE_OPENAI_KEY);
  const deployment = environmentValue(process.env.EMBEDDING_DEPLOYMENT) || 'text-embedding-3-small';
  if (!endpoint || !key) throw new Error('Azure OpenAI is not configured');
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(deployment)}/embeddings?api-version=2024-02-01`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify({ input: [text] }),
  });
  if (!response.ok) throw new Error(`Azure OpenAI returned ${response.status}`);
  return (await response.json()).data[0].embedding;
}

async function search(request) {
  const queryText = String(request.query.q || '').trim();
  if (!queryText) return json(request, { error: 'Query parameter "q" is required' }, 400, 'no-store');
  const mode = request.query.mode || 'hybrid';
  const limit = boundedInteger(request.query.top, 10, 50);
  const fields = 'c.id, c.login, c.name, c.avatarUrl, c.location, c.lat, c.lng, c.topLanguage, c.score, c.totalStars, c.followers, c.soReputation, c.specialTags';
  const container = getContainer();
  let resources;

  if (mode === 'text') {
    ({ resources } = await container.items.query({
      query: `SELECT TOP ${limit} ${fields} FROM c WHERE (CONTAINS(LOWER(c.login), @q) OR CONTAINS(LOWER(c.name), @q) OR CONTAINS(LOWER(c.location), @q) OR CONTAINS(LOWER(c.bio), @q) OR CONTAINS(LOWER(c.topLanguage), @q)) AND ${PUBLIC_FILTER} ORDER BY c.score DESC`,
      parameters: [{ name: '@q', value: queryText.toLowerCase() }],
    }).fetchAll());
  } else {
    const vector = await embedding(queryText);
    ({ resources } = await container.items.query({
      query: `SELECT TOP ${limit} ${fields}, VectorDistance(c.embedding, @embedding) AS relevance FROM c WHERE ${PUBLIC_FILTER} ORDER BY VectorDistance(c.embedding, @embedding)`,
      parameters: [{ name: '@embedding', value: vector }],
    }).fetchAll());
  }
  return json(request, { query: queryText, mode, count: resources.length, results: resources }, 200, 'public, max-age=300');
}

function normalizeGitHubEvent(event, login) {
  if (!event.id || !event.created_at) return null;
  const repo = event.repo?.name || null;
  return {
    id: String(event.id),
    login: event.actor?.login || login,
    avatarUrl: event.actor?.avatar_url || null,
    type: event.type || 'UnknownEvent',
    description: repo ? `Contributed to ${repo}` : 'Contributed on GitHub',
    repo,
    url: repo ? `https://github.com/${repo}` : `https://github.com/${login}`,
    createdAt: new Date(event.created_at).toISOString(),
  };
}

async function profileActivities(request) {
  const logins = [...new Set(String(request.query.logins || '').split(',').map(value => value.trim()).filter(value => /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(value)))].slice(0, 5);
  if (logins.length === 0) return json(request, { error: 'At least one valid login is required' }, 400, 'no-store');
  const limit = boundedInteger(request.query.limit, 4, logins.length === 1 ? 20 : 4);
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'DevGlobe', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const results = await Promise.all(logins.map(async login => {
    const cached = activityCache.get(login);
    if (cached?.expiresAt > Date.now()) return cached.activities.slice(0, limit);
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}/events/public?per_page=${limit}`, { headers });
    const activities = response.ok ? (await response.json()).map(event => normalizeGitHubEvent(event, login)).filter(Boolean) : [];
    activityCache.set(login, { activities, expiresAt: Date.now() + 5 * 60 * 1000 });
    return activities;
  }));
  return json(request, results.flat().sort((left, right) => right.createdAt.localeCompare(left.createdAt)), 200, 'public, max-age=300, stale-while-revalidate=600');
}

async function liveActivities(request) {
  const limit = boundedInteger(request.query.limit, 50, 100);
  const cursorValue = request.query.cursor;
  const afterValue = request.query.after;
  const cursor = activityCursor(cursorValue);
  const after = activityCursor(afterValue);
  if ((cursorValue && !cursor) || (afterValue && !after) || (cursor && after)) {
    return json(request, { error: 'Invalid activity cursor' }, 400, 'no-store');
  }
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const container = getContainer(process.env.COSMOS_ACTIVITY_CONTAINER || 'activities');
  const conditions = ['c.documentType IN ("github-activity", "platform-activity")', 'c.createdAt >= @cutoff'];
  const parameters = [{ name: '@cutoff', value: cutoff }];
  if (cursor) {
    conditions.push('(c.createdAt < @cursorTime OR (c.createdAt = @cursorTime AND c.id < @cursorId))');
    parameters.push({ name: '@cursorTime', value: cursor.createdAt }, { name: '@cursorId', value: cursor.id });
  }
  if (after) {
    conditions.push('(c.createdAt > @afterTime OR (c.createdAt = @afterTime AND c.id > @afterId))');
    parameters.push({ name: '@afterTime', value: after.createdAt }, { name: '@afterId', value: after.id });
  }
  const { resources } = await container.items.query({
    query: `SELECT TOP ${limit} c.id, c.login, c.avatarUrl, c.type, c.description, c.repo, c.url, c.createdAt, c.ingestedAt FROM c WHERE ${conditions.join(' AND ')} ORDER BY c.createdAt DESC, c.id DESC`,
    parameters,
  }).fetchAll();
  return json(request, {
    activities: resources,
    nextCursor: resources.length === limit ? encodeActivityCursor(resources.at(-1)) : null,
    afterCursor: encodeActivityCursor(resources[0]),
    sourceUpdatedAt: resources[0]?.ingestedAt || null,
    bestEffort: true,
  }, 200, 'public, max-age=60, stale-while-revalidate=300');
}

module.exports = async function publicApi(context, request) {
  if (request.method === 'OPTIONS') {
    context.res = { status: 204, headers: corsHeaders(request) };
    return;
  }
  const path = String(context.bindingData.path || '').replace(/^\/+|\/+$/g, '');
  try {
    if (path === 'developers') context.res = await developers(request);
    else if (path === 'developer') context.res = await developer(request);
    else if (path === 'developers/count') context.res = await developerCount(request);
    else if (path === 'search') context.res = await search(request);
    else if (path === 'activities') context.res = await profileActivities(request);
    else if (path === 'activities/live') context.res = await liveActivities(request);
    else context.res = json(request, { error: 'Not found' }, 404, 'no-store');
  } catch (error) {
    context.log.error('Public API failure', { path, message: error.message });
    context.res = json(request, { error: 'Service temporarily unavailable' }, 503, 'no-store');
  }
};