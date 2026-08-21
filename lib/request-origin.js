function firstHeaderValue(value) {
  return value?.split(',')[0].trim() || '';
}

export function isAllowedMutationOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  let requestUrl;
  let normalizedOrigin;
  try {
    requestUrl = new URL(request.url);
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }
  if (normalizedOrigin !== origin) return false;

  const allowedOrigins = new Set([requestUrl.origin]);
  const forwardedHost = firstHeaderValue(request.headers.get('x-forwarded-host'));
  const host = forwardedHost || firstHeaderValue(request.headers.get('host'));
  const protocol = firstHeaderValue(request.headers.get('x-forwarded-proto')) || requestUrl.protocol.slice(0, -1);
  if (host && ['http', 'https'].includes(protocol)) {
    try {
      allowedOrigins.add(new URL(`${protocol}://${host}`).origin);
    } catch {
      return false;
    }
  }

  return allowedOrigins.has(normalizedOrigin);
}