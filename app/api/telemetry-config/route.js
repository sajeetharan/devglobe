export const dynamic = 'force-dynamic';

// Exposes the App Insights connection string at request time (runtime env var),
// avoiding build-time coupling. The ingestion key is client-visible by design.
export function GET() {
  return Response.json(
    { connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
