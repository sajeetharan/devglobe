import 'dotenv/config';
import { CosmosClient } from '@azure/cosmos';

const endpoint = process.env.COSMOS_ENDPOINT?.trim();
const key = process.env.COSMOS_KEY?.trim();
const databaseId = process.env.COSMOS_DATABASE || 'devglobe';
const containerId = process.env.COSMOS_MAINTAINER_OUTREACH_CONTAINER || 'maintainer-outreach';
if (!endpoint || !key) throw new Error('COSMOS_ENDPOINT and COSMOS_KEY are required');

const client = new CosmosClient({ endpoint, key });
const database = client.database(databaseId);
const { resource, statusCode } = await database.containers.createIfNotExists({
  id: containerId,
  partitionKey: { paths: ['/login'], kind: 'Hash' },
  indexingPolicy: {
    indexingMode: 'consistent',
    automatic: true,
    includedPaths: [
      { path: '/documentType/?' },
      { path: '/status/?' },
      { path: '/selectedAt/?' },
      { path: '/followUpDueAt/?' },
    ],
    excludedPaths: [{ path: '/*' }],
    compositeIndexes: [[
      { path: '/documentType', order: 'ascending' },
      { path: '/status', order: 'ascending' },
      { path: '/selectedAt', order: 'descending' },
    ]],
  },
});
console.log(`${statusCode === 201 ? 'Created' : 'Verified'} private container ${databaseId}/${resource.id}.`);