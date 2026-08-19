import { CosmosClient } from '@azure/cosmos';
import dotenv from 'dotenv';

dotenv.config({ path: process.argv[2] || '.env.local' });

function category(error) {
  const code = String(error.code || error.statusCode || 'unknown');
  if (code === '401') return { code, category: 'authentication' };
  if (code === '403') return { code, category: 'forbidden' };
  if (code === '404') return { code, category: 'not-found' };
  if (code === '408') return { code, category: 'timeout' };
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { code, category: 'dns' };
  if (code === 'ERR_INVALID_URL') return { code, category: 'invalid-endpoint' };
  return { code, category: 'other' };
}

function environmentValue(value) {
  let result = String(value || '').trim();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (result.startsWith('\\"') && result.endsWith('\\"')) {
      result = result.slice(2, -2).trim();
      continue;
    }
    if (result.startsWith('"') && result.endsWith('"')) {
      try {
        const parsed = JSON.parse(result);
        if (typeof parsed === 'string') {
          result = parsed.trim();
          continue;
        }
      } catch {
        result = result.slice(1, -1).trim();
        continue;
      }
    }
    break;
  }
  return result;
}

try {
  const endpoint = environmentValue(process.env.COSMOS_ENDPOINT);
  const key = environmentValue(process.env.COSMOS_KEY);
  const database = environmentValue(process.env.COSMOS_DATABASE) || 'devglobe';
  const container = environmentValue(process.env.COSMOS_CONTAINER) || 'developers';
  const endpointUrl = new URL(endpoint);
  const client = new CosmosClient({ endpoint: endpointUrl.origin, key });
  const response = await client.database(database).container(container).items
    .query('SELECT VALUE COUNT(1) FROM c')
    .fetchAll();
  console.log(JSON.stringify({
    ok: true,
    count: response.resources[0] || 0,
    requestCharge: response.requestCharge,
  }));
} catch (error) {
  const rawEndpoint = String(process.env.COSMOS_ENDPOINT || '');
  console.log(JSON.stringify({
    ok: false,
    ...category(error),
    endpointShape: {
      length: rawEndpoint.length,
      httpsIndex: rawEndpoint.indexOf('https://'),
      firstCharacterCodes: [...rawEndpoint.slice(0, 4)].map(character => character.charCodeAt(0)),
      lastCharacterCodes: [...rawEndpoint.slice(-4)].map(character => character.charCodeAt(0)),
    },
  }));
  process.exitCode = 1;
}