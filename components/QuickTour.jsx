'use client';

import React from 'react';

const COPY = {
  search: {
    step: 'Start here',
    title: 'Explore the open-source talent graph',
    body: 'Search a GitHub username, person, or location. Try describing the collaborator you need with semantic search.',
    action: 'Start searching',
  },
};

export default function QuickTour({ step, onFocusSearch, onClose }) {
  if (!step) return null;
  const copy = COPY[step];

  return (
    <aside className={`quick-tour quick-tour--${step}`} aria-live="polite" aria-label="DevGlobe quick tour">
      <button type="button" className="quick-tour__close" onClick={onClose} aria-label="Close quick tour" title="Close quick tour">&times;</button>
      <div className="quick-tour__step">{copy.step}</div>
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      <button type="button" className="quick-tour__action" onClick={onFocusSearch}>{copy.action}</button>
    </aside>
  );
}