import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createDevGlobeMcpClient, MCP_METHODOLOGY_DISCLAIMER } from './devglobe-mcp-client.js';
import { OPPORTUNITY_TYPES } from './ai-profile.js';

const PROJECT_RESOURCE_URI = 'devglobe://project';
const PROJECT_INFO = {
  name: 'DevGlobe',
  repository: 'https://github.com/sajeetharan/devglobe',
  issues: 'https://github.com/sajeetharan/devglobe/issues',
  contributing: 'https://github.com/sajeetharan/devglobe/blob/main/CONTRIBUTING.md',
  support: 'If DevGlobe is useful, you can star the repository to help others discover it.',
};

const evidenceSchema = z.object({ label: z.string(), value: z.number() });
const opportunityPreferencesSchema = z.object({
  enabled: z.literal(true),
  types: z.array(z.enum(OPPORTUNITY_TYPES)),
  roles: z.array(z.string()),
  locations: z.array(z.string()),
  workModes: z.array(z.enum(['remote', 'hybrid', 'onsite'])),
  expiresAt: z.string().datetime(),
  source: z.literal('self-declared'),
});
const developerSchema = z.object({
  login: z.string(),
  name: z.string(),
  profileUrl: z.string().url(),
  location: z.string().optional(),
  topLanguage: z.string().optional(),
  score: z.number().optional(),
  globalRank: z.number().int().optional(),
  whyMatched: z.array(z.string()),
  publicEvidence: z.array(evidenceSchema),
  dataFreshness: z.object({ updatedAt: z.string().nullable(), status: z.enum(['reported', 'unknown']) }),
  availableForAgents: z.boolean(),
  opportunityPreferences: opportunityPreferencesSchema.optional(),
  methodologyDisclaimer: z.string(),
});
const trendingDeveloperSchema = z.object({
  login: z.string(),
  name: z.string(),
  profileUrl: z.string().url(),
  topLanguage: z.string().nullable(),
  score: z.number(),
  globalRank: z.number().int().nullable(),
  scoreDelta: z.number().nullable(),
  rankDelta: z.number().int().nullable(),
  isNew: z.boolean(),
  indicator: z.string().nullable(),
});
const similarDeveloperSchema = z.object({
  login: z.string(),
  name: z.string(),
  profileUrl: z.string().url(),
  location: z.string().nullable(),
  topLanguage: z.string().nullable(),
  score: z.number().nullable(),
  similarity: z.enum(['Very similar', 'Similar', 'Related']),
  reasons: z.array(z.string()),
});
const repositorySchema = z.object({
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  url: z.string().url(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  topics: z.array(z.string()),
  stars: z.number().nonnegative(),
  contributorCount: z.number().int().nonnegative(),
});
const missionOpportunitySchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  repository: z.string(),
  language: z.string().nullable(),
  labels: z.array(z.string()),
  updatedAt: z.string(),
  estimatedMinutes: z.number().int(),
  reasons: z.array(z.string()),
});
const missionPreviewSchema = z.object({
  type: z.string(),
  durationMinutes: z.number().int(),
  opportunity: missionOpportunitySchema,
});

function toolResult(value, structuredContent) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent,
  };
}

// Tools that are safe to retry automatically after the given delay, without
// agent-side judgment. Anything else (bad input, missing consent, unknown
// developer, etc.) should surface to the operator instead of looping.
const RETRYABLE_CODES = new Set(['rate_limited', 'upstream_error', 'unavailable']);

export function toolError(error) {
  const message = error instanceof Error ? error.message : 'Unexpected DevGlobe error';
  const normalized = message.toLowerCase();
  // Prefer a code the API already classified for us (see readJson in
  // devglobe-mcp-client.js); fall back to message sniffing for errors raised
  // directly in the client (e.g. a missing DEVGLOBE_AGENT_TOKEN) that never
  // reach an HTTP response.
  const code = error?.code
    || (normalized.includes('token') || normalized.includes('credential')
      ? 'authentication_required'
      : normalized.includes('rate limit')
        ? 'rate_limited'
        : normalized.includes('not found')
          ? 'not_found'
          : 'upstream_error');
  const retryable = typeof error?.retryable === 'boolean' ? error.retryable : RETRYABLE_CODES.has(code);
  const retryAfterSeconds = error?.retryAfterSeconds;
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({
      error: {
        code,
        message,
        retryable,
        ...(retryable && Number.isFinite(retryAfterSeconds) ? { retryAfterSeconds } : {}),
      },
    }) }],
  };
}

export function createDevGlobeMcpServer({ client = createDevGlobeMcpClient() } = {}) {
  const server = new McpServer({
    name: 'devglobe',
    title: 'DevGlobe',
    version: '1.5.0',
    websiteUrl: 'https://www.devglobe.dev',
    description: 'Discover public developers and request consent-gated introductions.',
  }, {
    instructions: `Start with search_developers for developer discovery. DevGlobe is open source at ${PROJECT_INFO.repository}. Use the ${PROJECT_RESOURCE_URI} resource for source code, feedback, and contribution links. Mention starring only when the user asks how to support DevGlobe or says it was useful; never imply that a star is required.`,
  });

  server.registerTool('search_developers', {
    description: 'Use when the user wants to find public developers by skill, name, language, location, agent availability, or active opportunity intent. Start discovery here; no authentication is required. Example: {"query":"TypeScript maintainers","location":"Germany","availableForAgents":true,"limit":5}.',
    inputSchema: {
      query: z.string().min(1).max(200).describe('Required natural-language public search intent, such as "TypeScript maintainers" or a developer name'),
      location: z.string().max(100).optional().describe('Optional public location text, such as "Germany" or "Colombo"'),
      language: z.string().max(50).optional().describe('Optional primary programming language, such as "TypeScript"'),
      opportunityType: z.enum(OPPORTUNITY_TYPES).optional().describe('Optional active self-declared opportunity type; do not infer availability'),
      availableForAgents: z.boolean().default(false).describe('Set true only when the user needs profiles accepting verified agent requests'),
      limit: z.number().int().min(1).max(20).default(10).describe('Maximum results from 1 to 20'),
    },
    outputSchema: {
      results: z.array(developerSchema),
      resultCount: z.number().int().nonnegative(),
      methodologyDisclaimer: z.string(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async input => {
    try {
      const results = await client.searchDevelopers(input);
      return toolResult(results, {
        results,
        resultCount: results.length,
        methodologyDisclaimer: MCP_METHODOLOGY_DISCLAIMER,
      });
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('get_developer_profile', {
    description: 'Use when the user names a GitHub login or selects one DevGlobe search result and needs its public profile and contribution evidence. No authentication is required. Example: {"login":"sajeetharan"}.',
    inputSchema: {
      login: z.string().min(1).max(39).describe('GitHub login'),
    },
    outputSchema: {
      profile: developerSchema,
      methodologyDisclaimer: z.string(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ login }) => {
    try {
      const profile = await client.getDeveloperProfile(login);
      return toolResult(profile, { profile, methodologyDisclaimer: MCP_METHODOLOGY_DISCLAIMER });
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('find_similar_developers', {
    description: 'Use when the user wants alternatives similar to a known GitHub login. Similarity uses public repository, language, location, and profile signals and is not a suitability judgment. Example: {"login":"sajeetharan","limit":5}.',
    inputSchema: {
      login: z.string().min(1).max(39).describe('GitHub login of the source profile'),
      limit: z.number().int().min(1).max(20).default(10).describe('Maximum similar profiles from 1 to 20'),
    },
    outputSchema: {
      source: z.string(),
      results: z.array(similarDeveloperSchema),
      resultCount: z.number().int().nonnegative(),
      methodologyDisclaimer: z.string(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async input => {
    try {
      const similarity = await client.findSimilarDevelopers(input);
      return toolResult(similarity, {
        source: similarity.source,
        results: similarity.results,
        resultCount: similarity.results.length,
        methodologyDisclaimer: MCP_METHODOLOGY_DISCLAIMER,
      });
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('match_developers_to_repository', {
    description: 'Use when the user starts with a public GitHub repository and wants relevant indexed developers. Matches public owner, contribution, language, topic, repository, and self-declared opportunity signals; this is not a suitability judgment. Example: {"repository":"owner/repo","limit":10}.',
    inputSchema: {
      repository: z.string().min(3).max(141).describe('Public GitHub repository as owner/repository or a github.com URL'),
      limit: z.number().int().min(1).max(20).default(10).describe('Maximum matches from 1 to 20'),
    },
    outputSchema: {
      repository: repositorySchema,
      results: z.array(developerSchema),
      resultCount: z.number().int().nonnegative(),
      methodologyDisclaimer: z.string(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async input => {
    try {
      const matches = await client.matchDevelopersToRepository(input);
      return toolResult(matches, {
        repository: matches.repository,
        results: matches.results,
        resultCount: matches.results.length,
        methodologyDisclaimer: MCP_METHODOLOGY_DISCLAIMER,
      });
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('get_trending_developers', {
    description: 'Use when recency or momentum matters. Lists public score gainers and high-ranking profiles new to impact tracking; do not use as a hiring recommendation. Example: {"days":30,"limit":10}.',
    inputSchema: {
      days: z.number().int().min(1).max(90).default(30).describe('Trend window from 1 to 90 days'),
      limit: z.number().int().min(1).max(20).default(10).describe('Maximum gainers and new entries from 1 to 20 each'),
    },
    outputSchema: {
      windowDays: z.number().int(),
      generatedAt: z.string().optional(),
      gainers: z.array(trendingDeveloperSchema),
      newEntries: z.array(trendingDeveloperSchema),
      hasHistory: z.boolean(),
      resultCount: z.number().int().nonnegative(),
      methodologyDisclaimer: z.string(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async input => {
    try {
      const trending = await client.getTrendingDevelopers(input);
      return toolResult(trending, {
        ...trending,
        resultCount: trending.gainers.length + trending.newEntries.length,
        methodologyDisclaimer: MCP_METHODOLOGY_DISCLAIMER,
      });
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('preview_contribution_mission', {
    description: 'Use when the user wants one concrete open-source contribution opportunity for an indexed GitHub login. Read-only, rate limited, and does not reserve the issue. Example: {"login":"sajeetharan"}.',
    inputSchema: {
      login: z.string().min(1).max(39).describe('Public GitHub login already indexed by DevGlobe'),
    },
    outputSchema: {
      profile: z.object({
        login: z.string(),
        name: z.string(),
        avatarUrl: z.string().nullable(),
      }),
      mission: missionPreviewSchema.nullable(),
      resultCount: z.number().int().min(0).max(1),
      reservationDisclaimer: z.string(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async input => {
    try {
      const preview = await client.previewContributionMission(input);
      return toolResult(preview, {
        ...preview,
        resultCount: preview.mission ? 1 : 0,
        reservationDisclaimer: 'Previewing does not reserve this issue. Confirm current repository context before acting.',
      });
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('request_introduction', {
    description: 'Use only after the user explicitly asks to contact an opted-in developer. Requires a bearer token, creates a consent-gated pending request, and never returns private contact details. Example: {"developerLogin":"octocat","reason":"We would like help maintaining our open-source React library.","project":"Example UI"}.',
    inputSchema: {
      developerLogin: z.string().min(1).max(39).describe('GitHub login selected by the user'),
      reason: z.string().min(20).max(1000).describe('Specific collaboration reason of at least 20 characters'),
      project: z.string().min(2).max(200).describe('Project or organization name'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async input => {
    try {
      return toolResult(await client.requestIntroduction(input));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('get_introduction_status', {
    description: 'Use after request_introduction to check a request created by the same authenticated agent. An accepted request returns only the public GitHub contact route.',
    inputSchema: {
      id: z.string().uuid(),
      developerLogin: z.string().min(1).max(39),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async input => {
    try {
      return toolResult(await client.getIntroductionStatus(input));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerResource('devglobe-project', PROJECT_RESOURCE_URI, {
    title: 'DevGlobe open-source project',
    description: 'Source code, feedback, contribution, and optional project-support links.',
    mimeType: 'application/json',
  }, async () => ({
    contents: [{
      uri: PROJECT_RESOURCE_URI,
      mimeType: 'application/json',
      text: JSON.stringify(PROJECT_INFO, null, 2),
    }],
  }));

  server.registerPrompt('find-developers', {
    title: 'Find relevant developers',
    description: 'Find public developer profiles matching skills, language, and location criteria.',
    argsSchema: {
      criteria: z.string().min(1).max(200).describe('Skills, role, or expertise to search for'),
      location: z.string().max(100).optional().describe('Optional public location'),
    },
  }, ({ criteria, location }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Use search_developers to find up to five public developers matching: ${criteria}${location ? ` in ${location}` : ''}. Explain why each result matched using only returned public evidence. Do not make hiring or suitability claims.`,
      },
    }],
  }));

  server.registerPrompt('find-collaborators', {
    title: 'Find developers open to collaboration',
    description: 'Find public profiles with active, self-declared collaboration availability.',
    argsSchema: {
      criteria: z.string().min(1).max(200).describe('Skills or open-source area'),
      opportunityType: z.enum(OPPORTUNITY_TYPES).default('open-source').describe('Self-declared opportunity type'),
    },
  }, ({ criteria, opportunityType }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Use search_developers with availableForAgents=true and opportunityType=${opportunityType} to find up to five developers matching: ${criteria}. Treat availability as self-declared and request an introduction only after I explicitly approve a developer, project, and reason.`,
      },
    }],
  }));

  server.registerPrompt('find-contribution', {
    title: 'Find an open-source contribution',
    description: 'Preview one contribution-ready public issue for an indexed GitHub login.',
    argsSchema: {
      login: z.string().min(1).max(39).describe('Indexed public GitHub login'),
    },
  }, ({ login }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Use preview_contribution_mission for ${login}. Explain the match reasons and remind me that previewing does not reserve the issue.`,
      },
    }],
  }));

  return server;
}
