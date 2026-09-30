'use client';

import { RadioTower, Search, Target } from 'lucide-react';
import { track } from '../lib/analytics.js';
import { githubFeatureAuthUrl } from '../lib/public-activation.js';

export default function PublicFeatureBar({ activeFeature, signedIn, username, onSearch, onToday, onLive }) {
  const selectFeature = (feature, action) => {
    track('next_action_selected', {
      action: feature,
      journey: feature === 'today' ? 'daily_companion' : 'public_activation',
      source: 'feature_bar',
    });
    action();
  };

  return (
    <nav className="public-feature-bar" aria-label="Primary DevGlobe features">
      {signedIn ? (
        <button
          type="button"
          className={activeFeature === 'today' ? 'public-feature-bar__item public-feature-bar__item--active' : 'public-feature-bar__item'}
          aria-pressed={activeFeature === 'today'}
          onClick={() => selectFeature('today', onToday)}
        >
          <Target aria-hidden="true" />
          <span><strong>Today</strong><small>{username ? `For @${username}` : 'Your next move'}</small></span>
        </button>
      ) : (
        <button
          type="button"
          className={activeFeature === 'today' ? 'public-feature-bar__item public-feature-bar__item--mission public-feature-bar__item--active' : 'public-feature-bar__item public-feature-bar__item--mission'}
          aria-pressed={activeFeature === 'today'}
          onClick={() => selectFeature('today', onToday)}
        >
          <Target aria-hidden="true" />
          <span><strong>Today</strong><small>Preview your mission</small></span>
        </button>
      )}
      <button
        type="button"
        className={activeFeature === 'search' ? 'public-feature-bar__item public-feature-bar__item--active' : 'public-feature-bar__item'}
        aria-pressed={activeFeature === 'search'}
        onClick={() => selectFeature('search', onSearch)}
      >
        <Search aria-hidden="true" />
        <span><strong>Find people</strong><small>Skills and projects</small></span>
      </button>
      {signedIn ? (
        <button
          type="button"
          className={activeFeature === 'live' ? 'public-feature-bar__item public-feature-bar__item--active' : 'public-feature-bar__item'}
          aria-pressed={activeFeature === 'live'}
          onClick={() => selectFeature('live', onLive)}
        >
          <RadioTower aria-hidden="true" />
          <span><strong>Live coding</strong><small>On the globe</small></span>
        </button>
      ) : (
        <a
          className="public-feature-bar__item"
          href={githubFeatureAuthUrl('live')}
          onClick={() => track('github_auth_started', { source: 'feature_bar_live' })}
        >
          <RadioTower aria-hidden="true" />
          <span><strong>Live coding</strong><small>Continue with GitHub</small></span>
        </a>
      )}
    </nav>
  );
}