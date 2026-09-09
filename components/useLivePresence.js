'use client';

import { useEffect, useState } from 'react';

function deduplicateDevelopers(developers) {
  const unique = new Map();
  for (const developer of Array.isArray(developers) ? developers : []) {
    const login = String(developer?.login || developer?.id || '').trim().toLowerCase();
    if (!login) continue;
    const existing = unique.get(login);
    if (!existing || String(developer.lastHeartbeat || '') >= String(existing.lastHeartbeat || '')) {
      unique.set(login, { ...developer, id: login, login });
    }
  }
  return [...unique.values()];
}

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
        setDevelopers(deduplicateDevelopers(JSON.parse(event.data)));
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
          if (update.type === 'delete') {
            return current.filter(item => item.login !== String(update.developerId).toLowerCase());
          }
          if (update.type !== 'upsert' || !update.developer) return current;
          const login = String(update.developer.login || update.developer.id).toLowerCase();
          const index = current.findIndex(item => item.login === login);
          if (index === -1) return [...current, { ...update.developer, id: login, login }];
          const next = [...current];
          next[index] = { ...update.developer, id: login, login };
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

export { deduplicateDevelopers };