export const PROFILE_PRIMARY_ACTIONS = {
  CLAIM: 'claim_profile',
  FOLLOW: 'follow_impact',
  IMPACT: 'view_impact_history',
  OPPORTUNITIES: 'find_contribution_opportunities',
};

export function resolveProfilePrimaryAction({ viewerLogin, profileLogin, isClaimed = true, isFollowing = false }) {
  const viewer = String(viewerLogin || '').trim().toLowerCase();
  const profile = String(profileLogin || '').trim().toLowerCase();

  if (viewer && viewer === profile && !isClaimed) return PROFILE_PRIMARY_ACTIONS.CLAIM;
  if (viewer && viewer === profile) return PROFILE_PRIMARY_ACTIONS.OPPORTUNITIES;
  if (isFollowing) return PROFILE_PRIMARY_ACTIONS.IMPACT;
  return PROFILE_PRIMARY_ACTIONS.FOLLOW;
}