Privacy-safe usage events include only the MCP method, known tool name, outcome, bounded error code, latency, aggregate result count, and a daily rotating caller hash; prompts and tool arguments are not recorded. The caller hash is derived with HMAC from request metadata and cannot be reversed; rotation prevents longitudinal tracking.
# DevGlobe MCP Server

DevGlobe provides a hosted Model Context Protocol server for developer discovery and consent-gated introductions. It uses stateless Streamable HTTP so agents can connect without cloning or running DevGlobe locally.

## Remote Endpoint

```text
https://www.devglobe.dev/mcp
```

Client-specific copyable configurations are available at:

```text
https://www.devglobe.dev/agents
```

For an anonymous discovery-only connection, use this VS Code `mcp.json` entry:

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

Public search and profile lookup do not require credentials. To use introduction tools, add an issued token using your MCP client's secure secret or environment-variable support:

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

- `search_developers` searches public profiles and can require agent availability or an active self-declared opportunity type.
- `get_developer_profile` returns one public profile.
- `find_similar_developers` explores profiles with similar public repository, language, location, and profile signals.
- `get_trending_developers` returns recent score gainers and high-ranking profiles that are new to impact tracking.
- `preview_contribution_mission` returns one contribution-ready public GitHub issue matched to a DevGlobe profile. It does not reserve the issue and is rate limited.
- `request_introduction` creates a pending request for an opted-in developer.
- `get_introduction_status` lets the requesting agent poll its request. After acceptance it returns only the developer's public GitHub URL.

Private AI profile settings and private contact details are never returned.

Opportunity-aware searches may pass `opportunityType` as `employment`, `contract`, `open-source`, `speaking`, or `mentoring`. Matching profiles return only active public preferences, their expiry, and an explicit match reason. Expired preferences are omitted before MCP filtering.

Public discovery tools provide schema-validated `structuredContent` with canonical profile URLs, match explanations, public evidence, freshness, agent availability, and the methodology disclaimer. JSON text content remains available for older clients.

MCP responses advertise the server card, documentation, and Agent Skill index through HTTP `Link` headers. Privacy-safe usage events include only the MCP method, known tool name, outcome, latency, and aggregate result count; prompts and tool arguments are not recorded.

Known MCP clients are recorded as a coarse allow-listed value such as `smithery`, `vscode`, `cursor`, `claude`, or `openai`. Raw user-agent strings and client-provided identifiers are not retained. Unknown clients are grouped as `other`.

When Azure Container Apps diagnostic logs are connected to Log Analytics, use this query to review usage by client and tool:

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(30d)
| extend Metric = parse_json(Log_s)
| where Metric.event == "devglobe_mcp" and Metric.method == "tools/call"
| summarize Calls=count(), SuccessRate=100.0 * countif(Metric.outcome == "success") / count(), P95LatencyMs=percentile(todouble(Metric.durationMs), 95), Results=sum(toint(Metric.resultCount)) by Client=tostring(Metric.client), Tool=tostring(Metric.tool), bin(TimeGenerated, 1d)
| order by TimeGenerated desc
```

Registry listing views and installs remain external metrics. Compare each registry's analytics with MCP calls attributed to its client or gateway; the official MCP Registry is a directory and does not proxy calls.

Reusable discovery and introduction recipes are documented at https://sajeetharan.github.io/devglobe/agents/workflows.

## Application Setup

Create the introduction request container:

```bash
npm run setup-introductions-container
```

Issue a credential for an agent owner:

```bash
npm run create-agent-key -- --id=engineering-agent --name="Engineering Agent" --owner="Example Org"
```

Give the generated token to the agent owner once. Add the generated object to the server environment as a JSON array:

```env
DEVGLOBE_AGENT_KEYS=[{"id":"engineering-agent","name":"Engineering Agent","owner":"Example Org","tokenHash":"sha256-hash"}]
COSMOS_INTRODUCTIONS_CONTAINER=agent-introductions
DEVGLOBE_AGENT_RATE_LIMIT=10
```

Restart the application after changing credentials. Never store raw agent tokens in the application environment or repository.

## Local Stdio Setup

For clients without remote MCP support, install dependencies in this repository and configure the included stdio bridge:

```json
{
  "servers": {
    "devglobe": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/absolute/path/to/devglobe/scripts/devglobe-mcp-server.js"],
      "env": {
        "DEVGLOBE_API_URL": "https://www.devglobe.dev",
        "DEVGLOBE_AGENT_TOKEN": "issued-token"
      }
    }
  }
}
```

The token is required only for introduction tools. Public search and profile lookup work without one.

## Hosted Endpoint Configuration

The hosted application accepts stateless MCP requests at `/mcp`. Browser-based MCP clients must send an allowed `Origin`. The canonical site is allowed by default; additional trusted origins can be configured as a comma-separated list:

```env
DEVGLOBE_MCP_ALLOWED_ORIGINS=https://trusted-agent-console.example
```

The endpoint does not create server-side MCP sessions. `GET` and `DELETE` session operations are intentionally unsupported, while tool calls use `POST` requests.

## Errors & Retry Guidance

Every MCP tool error returns a structured envelope instead of a bare string:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Agent introduction rate limit exceeded",
    "retryable": true,
    "retryAfterSeconds": 1800
  }
}
```

| Code | Meaning | Retryable | Guidance |
| --- | --- | --- | --- |
| `authentication_required` | Missing or invalid `DEVGLOBE_AGENT_TOKEN` / bearer credential | No | Fix credentials before retrying; retrying without changing the token will always fail the same way. |
| `invalid_request` | Input failed validation (bad login, reason too short, etc.) | No | Correct the input; retrying unchanged input will always fail. |
| `not_found` | Referenced developer or request id does not exist | No | Do not retry; re-check the id or login. |
| `conflict` | The developer is not accepting verified agent requests | No | Do not retry; the developer's consent settings, not a transient condition, caused this. |
| `rate_limited` | The per-agent introduction rate limit was exceeded | Yes | Wait at least `retryAfterSeconds` (also echoed in the HTTP `Retry-After` header on the underlying API response) before retrying the same call. |
| `unavailable` | A required backend dependency isn't configured | Yes | Safe to retry with backoff; this reflects a temporary deployment/config issue, not the request itself. |
| `upstream_error` | An unexpected failure calling DevGlobe's API | Yes | Retry with exponential backoff (e.g. 1s, 2s, 4s, capped, up to 3 attempts) before surfacing the failure. |

Only `error.retryable === true` responses include `retryAfterSeconds`, and only when DevGlobe can compute a concrete wait time (currently: rate limiting on `request_introduction`). When `retryAfterSeconds` is absent on a retryable error, use exponential backoff instead of retrying immediately. Never retry a non-retryable error without changing the input or credentials first — repeating it will not change the outcome and wastes the agent's rate-limit budget.

## Consent Lifecycle

1. An authenticated agent requests an introduction to a public, opted-in profile.
2. DevGlobe rate-limits the agent and stores a pending request with a 14-day response window.
3. The developer reviews the request from **Agent requests** in their user menu.
4. The developer accepts or declines. Decisions cannot be changed.
5. The agent polls `get_introduction_status`.
6. Acceptance returns the developer's already-public GitHub URL. Declined and expired requests disclose nothing further.
