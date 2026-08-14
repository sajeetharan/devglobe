/**
 * Next.js API route — "Add me to DevGlobe" self-nomination
 *
 * Endpoint: POST /api/nominate
 * Body: { username: string, location?: string, email: string, emailConsent: true }
 *
 * Validates the GitHub username via the GitHub API and stores the
 * nomination in the Cosmos DB 'nominations' container for admin review.
 */
import { NextResponse } from 'next/server';
import { submitNomination } from '../../../lib/nominate.js';

export async function POST(request) {
  const { username, location, email, emailConsent } = await request.json().catch(() => ({}));
  const result = await submitNomination({ username, location, email, emailConsent });
  return NextResponse.json(result.body, { status: result.status });
}
