'use client';

const STAGE_COPY = {
  connecting: 'Connecting to the developer index',
  downloading: 'Downloading developer profiles',
  preparing: 'Preparing ranks and map points',
};

export default function LoadingOverlay({ error, datasetCount, stage = 'connecting' }) {

  if (error) {
    return (
      <div className="loading-overlay" role="alert">
        <div className="loading-panel loading-panel--error">
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 16, marginBottom: 8 }}>Failed to load data</div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{error}</div>
          <button
            onClick={() => location.reload()}
            style={{ marginTop: 16, padding: '8px 20px', background: '#3b82f6', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="loading-indicator" role="status" aria-live="polite" aria-label="Loading DevGlobe">
      <span className="loading-indicator__spinner" aria-hidden="true" />
      <span>
        {STAGE_COPY[stage] || STAGE_COPY.connecting}
        {datasetCount !== null ? ` · ${datasetCount.toLocaleString()} profiles` : ''}
      </span>
    </div>
  );
}
