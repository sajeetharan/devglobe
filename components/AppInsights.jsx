'use client';

import { useEffect } from 'react';

// Initializes Application Insights browser RUM (users, sessions, page views).
export default function AppInsights({ connectionString }) {
  useEffect(() => {
    if (!connectionString || typeof window === 'undefined') return;
    let cancelled = false;

    (async () => {
      try {
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
  }, [connectionString]);

  return null;
}
