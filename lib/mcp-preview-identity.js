import { createHmac, timingSafeEqual } from 'node:crypto';

function secret() {
  return process.env.ENGAGEMENT_HASH_SECRET || process.env.SESSION_SECRET || 'development-preview-secret';
}

export function createMcpPreviewIdentity(request) {
  const address = request.headers.get('x-azure-clientip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const clientHash = createHmac('sha256', secret()).update(`mcp-preview-client:${address}`).digest('base64url');
  const signature = createHmac('sha256', secret()).update(`mcp-preview-proof:${clientHash}`).digest('base64url');
  return `${clientHash}.${signature}`;
}

export function verifyMcpPreviewIdentity(value) {
  const [clientHash, signature] = String(value || '').split('.');
  if (!clientHash || !signature) return null;
  const expected = createHmac('sha256', secret()).update(`mcp-preview-proof:${clientHash}`).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  return `mcp:${clientHash}`;
}