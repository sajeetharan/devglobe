import { promises as fs } from 'fs';
import path from 'path';
import { getCosmosContainer } from '../lib/cosmos.js';
import { getSiteUrl } from '../lib/site.js';

const siteUrl = getSiteUrl();

export const revalidate = 86400;

export function buildSitemapEntries(profileLogins, lastModified = new Date()) {
  const logins = [...new Set(profileLogins.filter(Boolean))];
  return [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/agents`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/hacktoberfest`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/countries`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/leaderboard`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...logins.map(login => ({
      url: `${siteUrl}/developer/${encodeURIComponent(login)}`,
      changeFrequency: 'daily',
      priority: 0.7,
    })),
  ];
}

async function getProfileLogins() {
  const container = getCosmosContainer();
  if (!container) {
    const filePath = path.join(process.cwd(), 'data', 'developers-sample.json');
    const developers = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    return developers.map(developer => developer.login).filter(Boolean);
  }

  try {
    const { resources } = await container.items
      .query("SELECT VALUE c.login FROM c WHERE IS_DEFINED(c.login) AND (NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')")
      .fetchAll();
    return resources.filter(Boolean);
  } catch (error) {
    console.error('Unable to load profiles for sitemap:', error.message);
    return [];
  }
}

export default async function sitemap() {
  const profileLogins = await getProfileLogins();
  return buildSitemapEntries(profileLogins);
}