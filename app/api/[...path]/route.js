import { apiError } from '../../../lib/api-error.js';

function apiNotFound(request) {
  const pathname = new URL(request.url).pathname;
  return apiError(
    404,
    'api_route_not_found',
    `No DevGlobe API route exists at ${pathname}.`,
    'Inspect /openapi.json for supported operations or /.well-known/api-catalog for service discovery.',
  );
}

export const GET = apiNotFound;
export const POST = apiNotFound;
export const PUT = apiNotFound;
export const PATCH = apiNotFound;
export const DELETE = apiNotFound;
