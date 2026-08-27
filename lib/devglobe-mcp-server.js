import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createDevGlobeMcpClient, MCP_METHODOLOGY_DISCLAIMER } from './devglobe-mcp-client.js';
import { OPPORTUNITY_TYPES } from './ai-profile.js';

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
  const server = new McpServer({ name: 'devglobe', version: '1.1.0' });

  server.registerTool('search_developers', {
    description: 'Search public DevGlobe developer profiles by expertise, location, language, agent availability, and active self-declared opportunity intent.',
    inputSchema: {
      query: z.string().min(1).max(200).describe('Skills, expertise, name, or other search intent'),
      location: z.string().max(100).optional(),
      language: z.string().max(50).optional(),
      opportunityType: z.enum(OPPORTUNITY_TYPES).optional(),
      availableForAgents: z.boolean().default(false),
      limit: z.number().int().min(1).max(20).default(10),
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
    description: 'Get one public DevGlobe developer profile. Private AI collaboration settings are never returned.',
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
    description: 'Find public developer profiles with similar repository, language, location, and profile signals. Similarity supports exploration and is not a suitability judgment.',
    inputSchema: {
      login: z.string().min(1).max(39).describe('GitHub login of the source profile'),
      limit: z.number().int().min(1).max(20).default(10),
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

  server.registerTool('get_trending_developers', {
    description: 'List public developers whose DevGlobe score increased over a recent window, plus high-ranking profiles that are new to impact tracking.',
    inputSchema: {
      days: z.number().int().min(1).max(90).default(30),
      limit: z.number().int().min(1).max(20).default(10),
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
    description: 'Preview one contribution-ready public GitHub issue matched to a DevGlobe profile. The preview is read-only, does not reserve the issue, and is rate limited.',
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
    description: 'Request a consent-gated introduction to an opted-in developer. This creates a pending request and never returns private contact details.',
    inputSchema: {
      developerLogin: z.string().min(1).max(39),
      reason: z.string().min(20).max(1000),
      project: z.string().min(2).max(200),
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
    description: 'Check an introduction request owned by this agent. An accepted request returns only the developer public GitHub contact route.',
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

  return server;
}
