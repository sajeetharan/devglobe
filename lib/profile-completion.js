export const PROFILE_COMPLETION_STEPS = [
  { id: 'claim', label: 'Claim your profile', action: 'claim' },
  { id: 'review', label: 'Review imported data', action: 'profile' },
  { id: 'tools', label: 'Add AI tools you use', action: 'ai-profile' },
  { id: 'opportunities', label: 'Set interests and availability', action: 'ai-profile' },
  { id: 'agentContact', label: 'Choose agent contact preference', action: 'ai-profile' },
  { id: 'repositories', label: 'Feature repositories', action: 'repositories' },
  { id: 'card', label: 'Generate an identity card', action: 'card' },
];

const PROFILE_FRESHNESS_MS = 90 * 24 * 60 * 60 * 1000;

export function calculateProfileCompletion({ developer, cardGenerated = false, now = new Date() } = {}) {
  const claimed = developer?.claimed === true;
  const aiProfile = developer?.aiProfile;
  const profileUpdatedAt = Date.parse(aiProfile?.updatedAt);
  const profileFresh = Number.isFinite(profileUpdatedAt) && profileUpdatedAt > now.getTime() - PROFILE_FRESHNESS_MS;
  const completion = {
    claim: claimed,
    review: claimed && Boolean(developer?.metricsUpdatedAt),
    tools: claimed && Boolean(aiProfile?.tools?.length) && profileFresh,
    opportunities: claimed && Boolean(aiProfile?.opportunityPreferences) && profileFresh,
    agentContact: claimed && typeof aiProfile?.acceptsAgentRequests === 'boolean' && profileFresh,
    repositories: claimed && Boolean(developer?.topRepos?.length),
    card: claimed && cardGenerated === true,
  };
  const steps = PROFILE_COMPLETION_STEPS.map(step => ({
    ...step,
    complete: completion[step.id],
  }));
  const completed = steps.filter(step => step.complete).length;

  return {
    steps,
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
    complete: completed === steps.length,
    profileFresh,
    profileUpdatedAt: Number.isFinite(profileUpdatedAt) ? new Date(profileUpdatedAt).toISOString() : null,
  };
}