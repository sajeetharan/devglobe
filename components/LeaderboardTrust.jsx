import { DIMENSIONS, SCORE_METHODOLOGY } from '../lib/scoring.js';

const STEPS = [
  ['01', 'Discover your profile', 'Search the public index to see your global position and the signals behind it.'],
  ['02', 'Claim your identity', 'Confirm your GitHub identity to mark the profile as yours and correct its details.'],
  ['03', 'Track real impact', 'Follow transparent score and rank changes from daily public-data snapshots.'],
];

export default function LeaderboardTrust() {
  return (
    <>
      <section className="leaderboard-trust" aria-labelledby="leaderboard-trust-title">
        <div>
          <p className="leaderboard-page__eyebrow">PUBLIC DATA / YOUR CONTROL</p>
          <h2 id="leaderboard-trust-title">Know what stands behind the rank.</h2>
        </div>
        <div className="leaderboard-trust__actions">
          <a href="/api/auth/github">Claim with GitHub</a>
          <span>GitHub access does not read repository code or private repository contents.</span>
        </div>
      </section>

      <section className="leaderboard-onboarding" aria-label="How DevGlobe ranking works">
        {STEPS.map(([number, title, text]) => (
          <article key={number}>
            <span>{number}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <details className="leaderboard-methodology" id="score-methodology">
        <summary>How the impact score works</summary>
        <div>
          <p>{SCORE_METHODOLOGY.short}</p>
          <p>
            When a profile has no linked Stack Overflow activity, that signal's weight is
            redistributed proportionally across its available GitHub-based dimensions.
          </p>
          <ul>
            {DIMENSIONS.map(dimension => (
              <li key={dimension.key}>
                <strong>{dimension.label}</strong>
                <span>{dimension.description}</span>
              </li>
            ))}
          </ul>
          <p className="leaderboard-methodology__note">
            Contribution volume is one signal, not a measure of code quality, skill, or individual worth.
          </p>
        </div>
      </details>
    </>
  );
}