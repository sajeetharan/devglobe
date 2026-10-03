'use client';

import { useEffect } from 'react';
import { shouldCollectBrowserTelemetry } from '../lib/automated-traffic.js';
import { browserAnalytics } from '../lib/browser-analytics.js';

// Initializes Application Insights browser RUM (users, sessions, page views).
// The connection string is fetched at runtime from /api/telemetry-config so it
// can be configured via a Container App env var without rebuilding the image.
export default function AppInsights({ connectionString: connectionStringProp }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!shouldCollectBrowserTelemetry({
      hostname: window.location.hostname,
      userAgent: window.navigator.userAgent,
    })) {
      browserAnalytics.disable();
      return;
    }
    let cancelled = false;
    let client = null;

    (async () => {
      try {
        let connectionString = connectionStringProp;
        if (!connectionString) {
          const res = await fetch('/api/telemetry-config', { cache: 'no-store' });
          if (!res.ok) throw new Error(`Telemetry configuration failed (${res.status})`);
          ({ connectionString } = await res.json());
        }
        if (cancelled) return;
        if (!connectionString) {
          browserAnalytics.disable();
          return;
        }

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
        client = appInsights;
        appInsights.trackPageView();
        browserAnalytics.attach(appInsights);
      } catch (error) {
        if (cancelled) return;
        browserAnalytics.disable();
        console.warn('Browser analytics initialization failed:', error);
      }
    })();

    return () => {
      cancelled = true;
      if (client) {
        browserAnalytics.detach(client);
        client.unload(false);
      }
    };
  }, [connectionStringProp]);

  return null;
}
