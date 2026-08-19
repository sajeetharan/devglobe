function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

export function publicApiUrl(path, origin = process.env.NEXT_PUBLIC_API_URL) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const normalizedOrigin = normalizeOrigin(origin);
  return normalizedOrigin ? `${normalizedOrigin}${normalizedPath}` : normalizedPath;
}

export function developerSnapshotUrl(origin = process.env.NEXT_PUBLIC_DEVELOPER_SNAPSHOT_URL) {
  return normalizeOrigin(origin) || publicApiUrl('/api/developers');
}