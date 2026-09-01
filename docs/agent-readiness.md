# Agent readiness

DevGlobe publishes machine-readable discovery without claiming authentication capabilities it does not operate.

## Repository-managed discovery

- The homepage advertises the API catalog, OpenAPI document, MCP documentation, MCP server card, Agent Skills index, and authentication guide through RFC 8288 `Link` headers.
- `Accept: text/markdown` on the homepage returns a concise Markdown representation with `Vary: Accept` and `x-markdown-tokens` headers.
- `/.well-known/api-catalog` returns an RFC 9727 linkset.
- `/.well-known/mcp/server-card.json` describes the hosted Streamable HTTP MCP endpoint.
- `/.well-known/oauth-protected-resource` publishes RFC 9728 resource metadata and the `developers:read`, `introductions:read`, and `introductions:write` permission names.
- `/.well-known/agent-skills/index.json` advertises the DevGlobe skill with a SHA-256 digest of its served `SKILL.md`.
- `/auth.md` documents anonymous discovery and pre-issued bearer credentials for introduction tools.
- `/robots.txt` includes Content Signals while retaining crawler access rules.
- Supported early-preview browsers receive guarded, read-only WebMCP search and profile tools.

## Repository agent evidence

DevGlobe periodically scans filenames in a bounded set of recent public owner repositories for recognized agent configuration conventions. Detected tools can appear on the globe as repository evidence after the privacy threshold is met. The scan excludes private, forked, and archived repositories and does not read file contents.

Repository detection does not prove personal tool usage and does not grant contact permission. Agent introductions remain available only for claimed developers who publish an AI profile and explicitly accept verified-agent requests.

DevGlobe publishes protected-resource metadata without listing an authorization server. The current agent credentials are static bearer tokens, not OAuth grants. Adding RFC 8414 authorization-server metadata requires an OAuth 2.1 issuer with authorization and token endpoints; those endpoints must not be advertised until DevGlobe can issue and validate scoped grants.

## DNS-AID deployment

DNS-AID cannot be enabled by this repository. Publish the DNS-AID HTTPS or SVCB records under `_agents.www.devglobe.dev` through the authoritative DNS provider, using numeric `keyNNNNN` parameters for experimental values. Point discovery at the canonical HTTPS metadata or MCP endpoint selected by the DNS-AID implementation.

Enable DNSSEC for authenticated DNS discovery, verify the signed chain from the root through `devglobe.dev`, and test records from multiple public resolvers before marking DNS-AID as available. Keep the record TTL low during rollout, then raise it after validation.