import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth.js';
import {
  getDeveloperContact,
  setProductUpdatesPreference,
} from '../../../../lib/developer-contact-store.js';

export async function GET() {
  const session = await getSession();
  if (!session?.login) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const contact = await getDeveloperContact(session.login);
  if (!contact) {
    return NextResponse.json({ error: 'No contact email is stored' }, { status: 404 });
  }

  return NextResponse.json({
    emailVerified: contact.emailVerified === true,
    productUpdatesEnabled: contact.productUpdatesEnabled === true,
    weeklyDigestEligible: contact.emailVerified === true && contact.productUpdatesEnabled === true,
  });
}

export async function PUT(request) {
  const session = await getSession();
  if (!session?.login) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (typeof body.productUpdatesEnabled !== 'boolean') {
    return NextResponse.json({ error: 'productUpdatesEnabled must be a boolean' }, { status: 400 });
  }

  const result = await setProductUpdatesPreference(session.login, body.productUpdatesEnabled);
  if (!result.updated) {
    const status = result.reason === 'email_not_verified' ? 409
      : result.reason === 'not_found' ? 404
        : 503;
    const error = result.reason === 'email_not_verified'
      ? 'Verify your email before enabling weekly updates'
      : result.reason === 'not_found'
        ? 'No contact email is stored'
        : 'Email preferences are unavailable';
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({
    emailVerified: result.contact.emailVerified === true,
    productUpdatesEnabled: result.contact.productUpdatesEnabled === true,
    weeklyDigestEligible: result.contact.emailVerified === true && result.contact.productUpdatesEnabled === true,
  });
}