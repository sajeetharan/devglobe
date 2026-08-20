'use client';

import { useEffect } from 'react';

// Initializes Application Insights browser RUM (users, sessions, page views).
// The connection string is fetched at runtime from /api/telemetry-config so it
// can be configured via a Container App env var without rebuilding the image.
export default function AppInsights({ connectionString: connectionStringProp }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    (async () => {
      try {
        let connectionString = connectionStringProp;
        if (!connectionString) {
          const res = await fetch('/api/telemetry-config', { cache: 'no-store' });
          if (!res.ok) return;
          ({ connectionString } = await res.json());
        }
        if (cancelled || !connectionString) return;

        const { ApplicationInsights } = await import('@microsoft/applicationinsights-web');
        if (cancelled) return;
        const appInsights = new ApplicationInsights({
          config: {
            connectionString,
            enableAutoRouteTracking: true,
            disableFetchTracking: false,
          },
        });
        appInsights.loadAppInsights();
        appInsights.trackPageView();
      } catch {
        // Analytics is best-effort; never block the app if it fails to load.
      }
    })();

    return () => { cancelled = true; };
  }, [connectionStringProp]);

  return null;
}
