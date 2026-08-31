export const PROFILE_PRIMARY_ACTIONS = {
  FOLLOW: 'follow_impact',
  IMPACT: 'view_impact_history',
  OPPORTUNITIES: 'find_contribution_opportunities',
};

export function resolveProfilePrimaryAction({ viewerLogin, profileLogin, isFollowing = false }) {
  const viewer = String(viewerLogin || '').trim().toLowerCase();
  const profile = String(profileLogin || '').trim().toLowerCase();

  if (viewer && viewer === profile) return PROFILE_PRIMARY_ACTIONS.OPPORTUNITIES;
  if (isFollowing) return PROFILE_PRIMARY_ACTIONS.IMPACT;
  return PROFILE_PRIMARY_ACTIONS.FOLLOW;
}