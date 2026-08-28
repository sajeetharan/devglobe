# DevGlobe product adoption dashboard

This Azure Data Explorer dashboard gives product owners a privacy-safe view of usage, feature adoption, conversion, and repeat engagement.

## What it answers

- How many browser sessions are active, engaged, and reaching a value action?
- Which product areas, journeys, acquisition sources, and sharing channels are adopted?
- Where do users leave the discovery, exploration, and daily-mission funnels?
- Are new browsers returning on later days?
- How often is the MCP endpoint used, which tools and client families are adopted, and is it reliable?

The dashboard contains three pages:

1. **Adoption Overview** - 30-day KPIs, daily and weekly trends, engagement rate, and value actions.
2. **Usage & Acquisition** - product-area usage, source attribution, feature adoption, journey performance, and popular profiles.
3. **Funnels & Retention** - ordered discovery, exploration, and mission funnels plus new-versus-returning browser trends.

## Data source

The dashboard expects the Cosmos DB `engagement-events` change feed in this ADX table:

```kusto
.create table DevGlobeEngagementRaw (
    Document: dynamic,
    CosmosTimestamp: datetime
)
```

Create the ingestion mapping:

```kusto
.create-or-alter table DevGlobeEngagementRaw ingestion json mapping 'DevGlobeEngagementRawMapping' '[
  {"column":"Document","path":"$","datatype":"dynamic"},
  {"column":"CosmosTimestamp","path":"$._ts","datatype":"datetime","transform":"DateTimeFromUnixSeconds"}
]'
```

In the ADX database **Data connections** page, connect the Cosmos DB `engagement-events` container to `DevGlobeEngagementRaw` with `DevGlobeEngagementRawMapping`. Use the ADX cluster's managed identity and grant it **Cosmos DB Built-in Data Reader** plus management-plane **Reader** at the narrowest practical scope. Do not store account keys in the dashboard or generator.

Verify ingestion before importing:

```kusto
DevGlobeEngagementRaw
| extend EventTime=todatetime(Document.createdAt), EventName=tostring(Document.eventName)
| summarize Rows=count(), Earliest=min(EventTime), Latest=max(EventTime), EventTypes=dcount(EventName)
```

The event documents are retained for 180 days. Set the Cosmos data connection retrieval start date early enough for the desired trend window.

## Generate and import

From the repository root:

```powershell
npm run dashboard:adoption
```

The generator defaults to:

- Cluster: `https://devlglobe.eastus2.kusto.windows.net`
- Database: `devglobe-analytics`

Confirm that this cluster exists in the target subscription before import. If it is not provisioned or uses a different name, set `ADX_CLUSTER_URI` explicitly; the dashboard cannot execute queries against a placeholder or unresolved endpoint.

Override either target when needed:

```powershell
$env:ADX_CLUSTER_URI = 'https://your-cluster.region.kusto.windows.net'
$env:ADX_DATABASE = 'your-database'
npm run dashboard:adoption
```

Import `dashboards/devglobe-product-adoption-dashboard.json` from **Azure Data Explorer > Dashboards > New dashboard > Import dashboard**, then authenticate the `DevGlobe Product Analytics` data source.

## Metric definitions

- **Active session**: a privacy-safe browser session with at least one intentional event in the period.
- **Engaged session**: an active session with at least two distinct event types.
- **Value session**: a session containing card generation, profile sharing, profile claim, mission completion, or a next-action selection.
- **Returning browser**: a session hash observed before the reporting day. This is directional browser retention, not authenticated-user retention.
- **Profiles reached**: distinct public developer logins referenced by tracked events.

Repeated equivalent events are deduplicated by the application in 30-minute windows. The dashboard also deduplicates change-feed rows by event ID.

## Views and attribution limitations

Durable engagement telemetry records intentional product actions. `profile_viewed` and `mission_viewed` are included, but generic route page views are not written to `engagement-events`. For site traffic, bounce rate, and landing-page views, use the Application Insights `AppPageViews` data documented in `docs/growth-attribution.md` or add a privacy-reviewed page-view event to the durable contract.

Source, channel, journey, and action values are optional. The dashboard groups missing source values as **Unattributed** rather than inferring attribution. Session and privacy hashes are pseudonymous and must not be exported or used for individual tracking.

## Azure Monitor Workbook and MCP metrics

The deployed **DevGlobe Product Adoption** Azure Monitor Workbook uses the live `devglobe-public-api` Application Insights component. Rebuild its serialized definition with:

```powershell
npm run workbook:adoption
```

MCP requests emit a structured `devglobe_mcp` console record from Azure Container Apps. The Workbook queries `ContainerAppConsoleLogs_CL` in `workspace-devgloberg7P5B` and reports request and tool-call volume, known client-family count, success rate, p50/p95 latency, result volume, tool adoption, and client mix. Telemetry stores only bounded method, tool, client-family, and outcome dimensions plus numeric duration and result count. It does not store prompts, tool arguments, tokens, authorization data, client IP addresses, or raw user-agent strings.