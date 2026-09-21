export const PROFILE_PRIMARY_ACTIONS = {
  CLAIM: 'claim_profile',
  FOLLOW: 'follow_impact',
  IMPACT: 'view_impact_history',
  OPPORTUNITIES: 'find_contribution_opportunities',
};

const PRIMARY_ACTION_COPY = {
  [PROFILE_PRIMARY_ACTIONS.CLAIM]: {
    eyebrow: 'Make this profile yours',
    description: 'Verify ownership to unlock profile tools and keep your public developer story current.',
  },
  [PROFILE_PRIMARY_ACTIONS.FOLLOW]: {
    eyebrow: 'Keep up with this developer',
    description: 'Add this developer to your watchlist and see their latest public activity when you return.',
    signedOutDescription: 'Sign in with GitHub to add this developer to your watchlist and see updates when you return.',
  },
  [PROFILE_PRIMARY_ACTIONS.IMPACT]: {
    eyebrow: 'See what changed',
    description: 'Review this developer’s impact, rank movement, and recent public activity.',
  },
  [PROFILE_PRIMARY_ACTIONS.OPPORTUNITIES]: {
    eyebrow: 'Turn your profile into action',
    description: 'Find open-source issues matched to your languages and public contribution history.',
  },
};

export function resolveProfilePrimaryAction({ viewerLogin, profileLogin, isClaimed = true, isFollowing = false }) {
  const viewer = String(viewerLogin || '').trim().toLowerCase();
  const profile = String(profileLogin || '').trim().toLowerCase();

  if (viewer && viewer === profile && !isClaimed) return PROFILE_PRIMARY_ACTIONS.CLAIM;
  if (viewer && viewer === profile) return PROFILE_PRIMARY_ACTIONS.OPPORTUNITIES;
  if (isFollowing) return PROFILE_PRIMARY_ACTIONS.IMPACT;
  return PROFILE_PRIMARY_ACTIONS.FOLLOW;
}

export function getProfilePrimaryActionCopy(action, { signedIn = false } = {}) {
  const copy = PRIMARY_ACTION_COPY[action];
  if (!copy) throw new Error(`Unknown profile primary action: ${action}`);
  return {
    eyebrow: copy.eyebrow,
    description: !signedIn && copy.signedOutDescription ? copy.signedOutDescription : copy.description,
  };
}