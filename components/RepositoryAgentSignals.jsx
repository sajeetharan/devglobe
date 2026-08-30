'use client';

import { useEffect, useState } from 'react';
import { track } from '../lib/analytics.js';

export default function RepositoryAgentSignals({ login }) {
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('loading');
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    fetch(`/api/repository-agent-signals?login=${encodeURIComponent(login)}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Repository signals are unavailable.');
        setResult(body);
        setStatus('ready');
        track('repository_agent_signals_viewed', {
          outcome: body.signals.length > 0 ? 'found' : 'empty',
          source: 'public_repositories',
        });
      })
      .catch(error => {
        if (error.name !== 'AbortError') setStatus('error');
      });
    return () => controller.abort();
  }, [login, requestVersion]);

  return (
    <section className="repository-agents" aria-labelledby="repository-agents-title">
      <div className="repository-agents__heading">
        <div>
          <span>PUBLIC REPOSITORY SIGNALS</span>
          <h3 id="repository-agents-title">Agent configurations</h3>
        </div>
        {status === 'ready' && <strong>{result.signals.length} detected</strong>}
      </div>

      {status === 'loading' && <p className="repository-agents__status" role="status">Checking recent public repositories...</p>}
      {status === 'error' && (
        <div className="repository-agents__error" role="status">
          <span>Repository evidence is temporarily unavailable.</span>
          <button type="button" onClick={() => setRequestVersion(version => version + 1)}>Retry</button>
        </div>
      )}
      {status === 'ready' && result.signals.length === 0 && (
        <p className="repository-agents__status">No recognized agent configuration files found in {result.scannedRepositories} recent public repositories.</p>
      )}
      {status === 'ready' && result.signals.length > 0 && (
        <div className="repository-agents__signals">
          {result.signals.map(signal => (
            <details
              key={signal.id}
              onToggle={event => {
                if (event.currentTarget.open) track('repository_agent_signal_opened', { action: signal.id, source: 'public_repositories' });
              }}
            >
              <summary>
                <span>{signal.name}</span>
                <small>{signal.repositories.length} {signal.repositories.length === 1 ? 'repository' : 'repositories'}</small>
              </summary>
              <ul>
                {signal.repositories.map(repository => (
                  <li key={repository.name}>
                    <a href={repository.url} target="_blank" rel="noopener noreferrer">{repository.name}</a>
                    <span>{repository.paths.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
      <p className="repository-agents__note">Detected from filenames only. This does not confirm personal usage.</p>
    </section>
  );
}