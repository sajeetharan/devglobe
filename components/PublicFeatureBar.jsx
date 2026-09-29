'use client';

import { RadioTower, Search, Target } from 'lucide-react';
import { track } from '../lib/analytics.js';
import { missionGitHubAuthUrl } from '../lib/public-activation.js';

export default function PublicFeatureBar({ activeFeature, signedIn, username, onSearch, onMission, onLive }) {
  const selectFeature = (feature, action) => {
    track('next_action_selected', {
      action: feature,
      journey: 'public_activation',
      source: 'feature_bar',
    });
    action();
  };

  return (
    <nav className="public-feature-bar" aria-label="Primary DevGlobe features">
      <button
        type="button"
        className={activeFeature === 'search' ? 'public-feature-bar__item public-feature-bar__item--active' : 'public-feature-bar__item'}
        aria-pressed={activeFeature === 'search'}
        onClick={() => selectFeature('search', onSearch)}
      >
        <Search aria-hidden="true" />
        <span><strong>Search</strong><small>Developers</small></span>
      </button>
      {signedIn ? (
        <button
          type="button"
          className={activeFeature === 'mission' ? 'public-feature-bar__item public-feature-bar__item--active' : 'public-feature-bar__item'}
          aria-pressed={activeFeature === 'mission'}
          onClick={() => selectFeature('mission', onMission)}
        >
          <Target aria-hidden="true" />
          <span><strong>Mission</strong><small>{username ? `For @${username}` : 'For you'}</small></span>
        </button>
      ) : (
        <a
          className="public-feature-bar__item public-feature-bar__item--mission"
          href={missionGitHubAuthUrl()}
          onClick={() => {
            track('next_action_selected', { action: 'mission', journey: 'public_activation', source: 'feature_bar' });
            track('github_auth_started', { source: 'feature_bar_mission' });
          }}
        >
          <Target aria-hidden="true" />
          <span><strong>Your mission</strong><small>Matched with GitHub</small></span>
        </a>
      )}
      <button
        type="button"
        className={activeFeature === 'live' ? 'public-feature-bar__item public-feature-bar__item--active' : 'public-feature-bar__item'}
        aria-pressed={activeFeature === 'live'}
        onClick={() => selectFeature('live', onLive)}
      >
        <RadioTower aria-hidden="true" />
        <span><strong>Live coding</strong><small>On the globe</small></span>
      </button>
    </nav>
  );
}