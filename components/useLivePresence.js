'use client';

import { useEffect, useState } from 'react';

export function useLivePresence(enabled = true) {
  const [developers, setDevelopers] = useState([]);
  const [connection, setConnection] = useState(enabled ? 'connecting' : 'idle');

  useEffect(() => {
    if (!enabled) {
      setConnection('idle');
      return undefined;
    }

    setConnection('connecting');
    const source = new EventSource('/api/sse/developers');
    let initialized = false;
    const initialTimer = setTimeout(() => {
      if (!initialized) setConnection('unavailable');
    }, 5000);
    const onInit = (event) => {
      try {
        setDevelopers(JSON.parse(event.data));
        initialized = true;
        clearTimeout(initialTimer);
        setConnection('live');
      } catch {
        setConnection('reconnecting');
      }
    };
    const onUpdate = (event) => {
      try {
        const update = JSON.parse(event.data);
        setDevelopers(current => {
          if (update.type === 'delete') return current.filter(item => item.id !== update.developerId);
          if (update.type !== 'upsert' || !update.developer) return current;
          const index = current.findIndex(item => item.id === update.developer.id);
          if (index === -1) return [...current, update.developer];
          const next = [...current];
          next[index] = update.developer;
          return next;
        });
        setConnection('live');
      } catch {
        setConnection('reconnecting');
      }
    };
    source.addEventListener('init', onInit);
    source.addEventListener('update', onUpdate);
    source.addEventListener('heartbeat', () => setConnection('live'));
    source.onerror = () => setConnection(initialized ? 'reconnecting' : 'unavailable');
    return () => {
      clearTimeout(initialTimer);
      source.close();
    };
  }, [enabled]);

  return { developers, connection };
}