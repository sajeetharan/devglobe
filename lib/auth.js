import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { resolveSessionCookieDomain, SESSION_COOKIE_NAME } from './auth-config.js';

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'devglobe-dev-secret-change-in-production'
);

function sessionCookieDomain() {
  return resolveSessionCookieDomain(
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NODE_ENV === 'production'
  );
}

/**
 * Create a signed JWT session token.
 */
export async function createSessionToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);
}

/**
 * Verify and decode a session token.
 */
export async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

/**
 * Get the current session from cookies.
 */
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Set session cookie with the given payload.
 */
export function buildSessionCookie(token) {
  const domain = sessionCookieDomain();
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    ...(domain ? { domain } : {}),
  };
}

/**
 * Build a cookie config that clears the session.
 */
export function buildLogoutCookie() {
  const domain = sessionCookieDomain();
  return {
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    ...(domain ? { domain } : {}),
  };
}
