'use client';

import MissionPreview from './MissionPreview.jsx';

export default function MissionFirstHome() {
  return (
    <section className="mission-home" aria-labelledby="mission-home-title">
      <div className="mission-home__inner">
        <header className="mission-home__heading">
          <span>DevGlobe Daily</span>
          <h2 id="mission-home-title">Make one useful open-source contribution today.</h2>
          <p>Preview a real issue matched to your public GitHub profile. Sign in only when you are ready to accept it, track progress, or ask for another match.</p>
        </header>
        <MissionPreview variant="landing" />
        <dl className="mission-home__trust" aria-label="Mission preview principles">
          <div><dt>Public signals</dt><dd>Languages and contribution history</dd></div>
          <div><dt>Read-only preview</dt><dd>No issue is reserved before sign-in</dd></div>
          <div><dt>Your choice</dt><dd>Review the repository before accepting</dd></div>
        </dl>
      </div>
    </section>
  );
}
