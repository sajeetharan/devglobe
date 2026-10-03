export function createBrowserAnalytics({ maxPending = 100, reportError = console.warn } = {}) {
  const pending = [];
  let client = null;
  let disabled = false;

  function flush() {
    while (client && pending.length) {
      const event = pending[0];
      try {
        client.trackEvent({ name: event.name }, event.properties);
        pending.shift();
      } catch (error) {
        reportError('Browser analytics event delivery failed:', error);
        break;
      }
    }
  }

  return {
    track(name, properties) {
      if (disabled) return;
      if (pending.length >= maxPending) {
        pending.shift();
        reportError('Browser analytics startup queue is full; the oldest event was dropped.');
      }
      pending.push({ name, properties: { ...properties } });
      flush();
    },
    attach(nextClient) {
      disabled = false;
      client = nextClient;
      flush();
    },
    detach(previousClient) {
      if (client === previousClient) client = null;
    },
    disable() {
      disabled = true;
      client = null;
      pending.length = 0;
    },
  };
}

export const browserAnalytics = createBrowserAnalytics();
