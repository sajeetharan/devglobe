import { CosmosClient } from '@azure/cosmos';

const clients = new Map();
const containers = new Map();

export function getCosmosContainer(containerName) {
  const endpoint = process.env.COSMOS_ENDPOINT?.trim();
  const key = process.env.COSMOS_KEY?.trim();
  if (!endpoint || !key) return null;

  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  } catch {
    return null;
  }

  const database = process.env.COSMOS_DATABASE || 'devglobe';
  const container = containerName || process.env.COSMOS_CONTAINER || 'developers';
  const clientKey = `${endpoint}|${key}`;
  const cacheKey = `${clientKey}|${database}|${container}`;
  if (containers.has(cacheKey)) return containers.get(cacheKey);

  let client = clients.get(clientKey);
  if (!client) {
    client = new CosmosClient({ endpoint, key });
    clients.set(clientKey, client);
  }
  const cosmosContainer = client.database(database).container(container);
  containers.set(cacheKey, cosmosContainer);
  return cosmosContainer;
}