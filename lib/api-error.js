import { NextResponse } from 'next/server.js';

export function apiError(status, code, message, hint) {
  return NextResponse.json({ error: message, code, hint }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
