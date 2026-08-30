---
title: MCP server
description: Connect an MCP client to DevGlobe's hosted discovery and consent-gated introduction tools.
---

# MCP server

DevGlobe exposes a stateless Streamable HTTP endpoint:

```text
https://www.devglobe.dev/mcp
```

## VS Code configuration

Install [DevGlobe.dev Developer Discovery](https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery) and run **DevGlobe.dev: Copy MCP Configuration** from the Command Palette, or add the configuration manually.

Public discovery requires no credentials:

```json
{
  "servers": {
    "devglobe": {
      "type": "http",
      "url": "https://www.devglobe.dev/mcp"
    }
  }
}
```

## Cursor and Claude configuration

For Cursor, add this to `.cursor/mcp.json` in a project or to the global MCP configuration:

```json
{
  "mcpServers": {
    "devglobe": {
      "url": "https://www.devglobe.dev/mcp"
    }
  }
}
```

For Claude, open [Customize > Connectors](https://claude.ai/customize/connectors), choose **Add custom connector**, and paste `https://www.devglobe.dev/mcp` as the remote MCP server URL. The [client setup page](https://www.devglobe.dev/agents) provides copyable setup for both clients.

For consent-gated introduction tools, keep the issued token in the client's secure environment support:

```json
{
  "servers": {
    "devglobe": {
      "type": "http",
      "url": "https://www.devglobe.dev/mcp",
      "headers": {
        "Authorization": "Bearer ${env:DEVGLOBE_AGENT_TOKEN}"
      }
    }
  }
}
```

## Tools

| Tool | Authentication | Behavior |
|---|---|---|
| `search_developers` | Anonymous | Searches public profiles by expertise, name, location, language, and agent availability |
| `get_developer_profile` | Anonymous | Returns one public profile by GitHub login |
| `find_similar_developers` | Anonymous | Finds alternatives similar to a known public profile |
| `get_trending_developers` | Anonymous | Lists recent score gainers and new impact-tracking entries |
| `preview_contribution_mission` | Anonymous | Previews one contribution-ready issue without reserving it |
| `request_introduction` | Bearer token | Creates a pending request for an opted-in developer |
| `get_introduction_status` | Same bearer token | Polls a request created by that agent |

## Prompts

Clients with MCP prompt support can list and run these guided workflows:

| Prompt | Arguments | Workflow |
|---|---|---|
| `find-developers` | `criteria`, optional `location` | Searches for up to five matching public profiles and explains returned evidence |
| `find-collaborators` | `criteria`, optional `opportunityType` | Searches active, self-declared availability and preserves explicit introduction approval |
| `find-contribution` | `login` | Previews one contribution-ready issue and explains that previewing does not reserve it |

Prompt arguments are bounded and are not retained in telemetry.

## Agent workflows

Start broad discovery with `search_developers`, inspect selected results with `get_developer_profile`, and use `find_similar_developers` only when alternatives to a known profile are useful. Use `get_trending_developers` when recency matters and `preview_contribution_mission` when the user asks for a concrete open-source action.

Example inputs:

```json
{"tool":"search_developers","arguments":{"query":"TypeScript maintainers","location":"Germany","availableForAgents":true,"limit":5}}
{"tool":"get_developer_profile","arguments":{"login":"sajeetharan"}}
{"tool":"get_trending_developers","arguments":{"days":30,"limit":10}}
```

Search limits must remain between 1 and 20. Clients should surface structured tool errors and back off when rate-limited rather than retrying aggressively.

Discovery tools return MCP `structuredContent` with stable schemas while retaining JSON text content for older clients. Search results include a canonical profile URL, match explanation, public evidence, freshness status, agent availability, and the DevGlobe methodology disclaimer.

The endpoint advertises its [MCP server card](https://www.devglobe.dev/.well-known/mcp/server-card.json), documentation, and [Agent Skill index](https://www.devglobe.dev/.well-known/agent-skills/index.json) through HTTP `Link` headers.

## Open-source project resource

MCP clients can list and read `devglobe://project` to find the [DevGlobe source repository](https://github.com/sajeetharan/devglobe), issue tracker, and contribution guide. Agents may mention starring the repository when a user asks how to support DevGlobe or says the service was useful, but access and results never depend on a star.

## Errors and retry guidance

Every tool error is a structured envelope, not a bare string:

```json
{ "error": { "code": "rate_limited", "message": "...", "retryable": true, "retryAfterSeconds": 1800 } }
```

| Code | Retryable | Notes |
|---|---|---|
| `authentication_required` | No | Fix the bearer token first |
| `invalid_request` | No | Fix the tool input first |
| `not_found` | No | Unknown developer login or request id |
| `conflict` | No | Developer isn't accepting verified agent requests |
| `rate_limited` | Yes | Wait `retryAfterSeconds` before retrying `request_introduction` |
| `unavailable` | Yes | Transient backend/config issue; back off |
| `upstream_error` | Yes | Unexpected failure calling DevGlobe; back off exponentially |

Only retryable errors ever include `retryAfterSeconds`, and only when DevGlobe can compute a concrete wait. When it's absent on a retryable error, use exponential backoff (e.g. 1s, 2s, 4s, capped, up to 3 attempts) instead of retrying immediately. Never retry a non-retryable error without changing the input or credentials — the outcome won't change.

## Privacy-safe telemetry

DevGlobe records the MCP method, allow-listed tool, resource, or prompt name, success or error outcome, bounded error code, latency, aggregate result count, and a daily rotating HMAC caller hash for conversion measurement. Raw prompt arguments, search arguments, profile content, credentials, IP addresses, raw user agents, and private contact details are not included in usage events.

## Consent lifecycle

1. An authenticated agent requests an introduction to an opted-in profile.
2. DevGlobe stores a pending request with a 14-day response window.
3. The developer accepts or declines from the live application.
4. The requesting agent polls status.
5. Acceptance returns only the public GitHub URL. Declined and expired requests reveal nothing further.

Private email addresses and private AI collaboration settings are never MCP output.

## Local stdio fallback

Clients without Streamable HTTP support can run the included bridge:

```json
{
  "servers": {
    "devglobe": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/absolute/path/to/devglobe/scripts/devglobe-mcp-server.js"],
      "env": {
        "DEVGLOBE_API_URL": "https://www.devglobe.dev",
        "DEVGLOBE_AGENT_TOKEN": "issued-token-if-needed"
      }
    }
  }
}
```

The hosted endpoint intentionally does not create server-side MCP sessions; `GET` and `DELETE` session operations are unsupported.
