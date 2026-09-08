# Azure Backend

## Production OAuth verification

Before measuring claim or retention funnels, verify that the deployed GitHub OAuth client ID and secret are still recognized. Supply the production values through your shell or secret manager, then run:

```powershell
npm run verify:github-oauth
```

The check exchanges a deliberately invalid authorization code. `bad_verification_code` confirms that GitHub recognized the client credentials; `incorrect_client_credentials` fails the command. The command never prints either credential. After rotating the Azure Container Apps secret, create a new revision and repeat this check before testing an interactive sign-in.

DevGlobe runs the Next.js application on Azure Container Apps, with Azure Functions handling high-volume public reads and scheduled work.

## Traffic split

Azure Functions serves:

- `GET /api/developers`
- `GET /api/developers/count`
- `GET /api/developer`
- `GET /api/search`
- `GET /api/activities`
- `GET /api/activities/live`
- GitHub activity ingestion every five minutes
- Repository agent-signal ingestion every fifteen minutes
- Hourly generation of the compressed developer snapshot

Azure Blob Storage serves `developers.json` directly to browsers. Azure Container Apps serves the frontend, OAuth, private account mutations, nominations, cards, share metadata, and MCP endpoint.

## Live developer presence

The `/space` globe shows only developers who explicitly enable presence in the DevGlobe VS Code extension. The extension exchanges its GitHub authentication for a scoped DevGlobe token and sends a bounded heartbeat every 30 seconds. Heartbeats include active language when enabled, editor, platform, session start, and last-seen time. They never include source code, file paths, repository names, branches, or keystrokes. Coordinates are copied from the developer's existing public profile rather than collected from the device.

Provision the TTL-enabled Cosmos container before deployment:

```powershell
npm run setup-live-presence-container
npm run setup-coding-stats-container
```

Set `COSMOS_LIVE_PRESENCE_CONTAINER` only when using a name other than `live-presence`. Each heartbeat has a 90-second item TTL. `GET /api/sse/developers` sends an `init` snapshot, `update` events with `upsert` or `delete`, and 20-second connection heartbeats. Container Apps ingress and any intermediary proxy must leave streaming responses unbuffered and allow connections longer than 20 seconds.

Set `COSMOS_CODING_STATS_CONTAINER` only when using a name other than `coding-stats`. The server derives owner-only daily totals from consecutive heartbeats, caps each interval at the presence TTL, and retains aggregate documents for 400 days. Aggregate writes are best-effort and never make live presence unavailable. The `/api/coding-stats` route requires the signed-in browser session and does not expose another developer's totals.

## Azure resources

The deployment uses these resources in `devglobe-rg`:

- Container App: `devglobe-web`
- Container Apps environment: `devglobe-env`
- Container registry: `devglobewebacr`
- Function App: `devglobe-public-api`
- Storage account: `devglobeactivityfn`
- Static website endpoint: `https://devglobeactivityfn.z13.web.core.windows.net/`

The Container App and Function App require their existing Cosmos, GitHub, and Azure OpenAI application settings. Never place secrets in public frontend variables or image build arguments.

The `repository-agent-ingest` timer uses the Function App's `GITHUB_TOKEN` to scan a bounded batch of stale developer profiles. It examines filenames from up to eight recent public, non-fork, non-archived owner repositories and stores the resulting tool IDs and evidence on the existing developer document. It never reads or stores repository file contents. Each profile is refreshed after seven days, and GitHub rate-limit responses stop the current batch.

The `maintainer-outreach` timer creates up to ten deduplicated review-only drafts each day through the protected Container App endpoint. It never sends outreach. Operators explicitly approve and record manual sends with `npm run outreach:review`. The `maintainer-outreach-report` timer emails aggregate weekly outcomes to `GROWTH_REPORT_EMAIL`; its Function App settings are `MAINTAINER_OUTREACH_URL`, `MAINTAINER_OUTREACH_REPORT_URL`, and the shared `CRON_SECRET`.

Repository evidence is observational. It does not imply that a developer personally uses a tool or consents to agent contact; only a public, self-declared AI profile controls contact availability.

## Frontend configuration

The Container Apps deployment workflow supplies these public values while building the Next.js image:

```env
NEXT_PUBLIC_API_URL=https://devglobe-public-api.azurewebsites.net
NEXT_PUBLIC_DEVELOPER_SNAPSHOT_URL=https://devglobeactivityfn.z13.web.core.windows.net/developers.json
```

The browser calls Azure Functions and Blob Storage directly. Their CORS rules must allow the production application origin.

## Custom domain

The `www.devglobe.dev` CNAME targets the Container App ingress hostname. The `asuid.www` TXT record proves ownership to Azure, and the Container Apps environment manages the TLS certificate. Azure does not host the `devglobe.dev` DNS zone, so DNS changes remain external to the resource group.

## Deployment

Pushes to `main` build the standalone Next.js image in Azure Container Registry and update the Container App through `.github/workflows/deploy.yml`. GitHub Actions authenticates with Azure through OIDC.

Changes under `functions/` deploy separately through `.github/workflows/deploy-azure-functions.yml`. For manual Function deployment, install production dependencies and deploy the contents of `functions/`; the ZIP root must contain `host.json`, not a wrapping `functions` directory.

```powershell
Set-Location functions
npm install --omit=dev
func azure functionapp publish devglobe-public-api --javascript
```

For a CLI-only deployment, create a ZIP containing the contents of `functions/`, including production `node_modules`, and use `az functionapp deploy --type zip`.

## Validation

Confirm all of the following after deployment:

- `/api/developers/count` returns the production count and the expected CORS origin.
- `/api/developer?id=sajeetharan` returns the public profile.
- `/api/search?q=typescript&mode=text` returns bounded results.
- Blob `developers.json` returns `Content-Encoding: gzip` and a long-lived cache header.
- `/api/sse/developers` returns `text/event-stream`, an `init` event, and periodic heartbeat events.
- The activity timer writes directly to the activity container.
- `repository-agent-ingest` logs bounded updates and persists `repositoryAgentSignals.scannedAt`, `toolIds`, and filename evidence without repository contents.