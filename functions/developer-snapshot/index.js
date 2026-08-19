const { BlobServiceClient } = require('@azure/storage-blob');
const { gzipSync } = require('zlib');
const { PUBLIC_FILTER, getContainer, projectDeveloper } = require('../shared/cosmos');

const LIST_FIELDS = 'c.id, c.login, c.name, c.avatarUrl, c.location, c.lat, c.lng, c.followers, c.publicRepos, c.totalStars, c.totalCommits, c.topLanguage, c.soReputation, c.soAnswers, c.soBadges, c.score, c.specialTags, c.claimed, c.metricsUpdatedAt, c.aiProfile';

module.exports = async function developerSnapshot(context) {
  const { resources } = await getContainer().items.query(`SELECT ${LIST_FIELDS} FROM c WHERE ${PUBLIC_FILTER}`).fetchAll();
  const payload = gzipSync(Buffer.from(JSON.stringify(resources.map(projectDeveloper))));
  const service = BlobServiceClient.fromConnectionString(process.env.AzureWebJobsStorage);
  const container = service.getContainerClient('$web');
  await container.createIfNotExists();
  await container.getBlockBlobClient('developers.json').uploadData(payload, {
    blobHTTPHeaders: {
      blobContentType: 'application/json; charset=utf-8',
      blobContentEncoding: 'gzip',
      blobCacheControl: 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
  context.log('Developer snapshot updated', { developers: resources.length, compressedBytes: payload.length });
};