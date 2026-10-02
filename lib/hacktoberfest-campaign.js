export const HACKTOBERFEST_CAMPAIGN = 'hacktoberfest-2026';

export function isHacktoberfestCampaignActive(now = new Date()) {
  return now >= new Date('2026-10-01T00:00:00.000Z')
    && now < new Date('2026-11-01T00:00:00.000Z');
}
