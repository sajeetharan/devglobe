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
    <div className="loading-overlay" role="status" aria-live="polite" aria-label="Loading DevGlobe">
      <div className="loading-panel">
        <div className="loading-scene" aria-hidden="true">
          <div className="loading-scene__orbit"><span /></div>
          <div className="loading-globe">
            <svg viewBox="0 0 220 220" className="loading-globe__svg">
              <defs>
                <radialGradient id="loadingGlobeFill" cx="35%" cy="28%">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                  <stop offset="75%" stopColor="currentColor" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </radialGradient>
                <clipPath id="loadingGlobeClip"><circle cx="110" cy="110" r="78" /></clipPath>
              </defs>
              <circle cx="110" cy="110" r="78" className="loading-globe__surface" />
              <g clipPath="url(#loadingGlobeClip)" className="loading-globe__grid">
                <ellipse cx="110" cy="110" rx="78" ry="29" />
                <ellipse cx="110" cy="110" rx="78" ry="55" />
                <ellipse cx="110" cy="110" rx="31" ry="78" />
                <ellipse cx="110" cy="110" rx="58" ry="78" />
                <path d="M32 110h156M110 32v156" />
              </g>
              <g className="loading-globe__routes" clipPath="url(#loadingGlobeClip)">
                <path d="M58 126 Q103 55 158 94" />
                <path d="M75 74 Q126 143 168 126" />
                <path d="M48 105 Q104 128 145 65" />
              </g>
              <g className="loading-globe__nodes">
                <circle cx="58" cy="126" r="4" />
                <circle cx="158" cy="94" r="4" />
                <circle cx="75" cy="74" r="3" />
                <circle cx="168" cy="126" r="3" />
                <circle cx="145" cy="65" r="3" />
              </g>
              <circle cx="110" cy="110" r="78" className="loading-globe__outline" />
            </svg>
          </div>
        </div>
        <div className="loading-brand">
          <img src="/devglobe.png" alt="" className="loading-brand__logo" />
          <span>DevGlobe</span>
        </div>
        <h2 className="loading-title">Loading developer map</h2>
        <p className="loading-status">
          {STAGE_COPY[stage] || STAGE_COPY.connecting}
          {datasetCount !== null ? ` · ${datasetCount.toLocaleString()} profiles` : ''}
        </p>
        <div className="loading-progress" aria-hidden="true">
          <div className="loading-progress__bar" />
        </div>
      </div>
    </div>
  );
}
