#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(directory, '..', 'dashboards', 'devglobe-product-adoption-workbook.json');
const thirtyDays = 30 * 24 * 60 * 60 * 1000;
const items = [];

function markdown(name, json) {
  items.push({ type: 1, content: { json }, name });
}

function query(name, title, queryText, visualization, customWidth, options = {}) {
  items.push({
    type: 3,
    content: {
      version: 'KqlItem/1.0',
      query: queryText,
      size: 0,
      title,
      timeContext: { durationMs: thirtyDays },
      queryType: 0,
      resourceType: 'microsoft.insights/components',
      visualization,
      ...options,
    },
    ...(customWidth ? { customWidth } : {}),
    name,
  });
}

markdown('title', '# DevGlobe Product Adoption\nProduct-owner view of reach, usage, acquisition, conversion, and MCP adoption. Metrics use the last 30 days of live Application Insights telemetry from `devglobe-public-api`.');
query('product-health', '30-day product health', "let P=pageViews | where timestamp >= ago(30d); let E=customEvents | where timestamp >= ago(30d); union (P | summarize Value=count() | extend Metric='Page views'), (P | summarize Value=dcount(user_Id) | extend Metric='Active users'), (P | summarize Value=dcount(session_Id) | extend Metric='Sessions'), (E | summarize Value=count() | extend Metric='Product actions') | project Metric, Value", 'tiles', null, {
  size: 4,
  tileSettings: {
    titleContent: { columnMatch: 'Metric', formatter: 1 },
    leftContent: { columnMatch: 'Value', formatter: 12, formatOptions: { palette: 'auto' } },
    showBorder: true,
  },
});
query('daily-traffic', 'Daily traffic and active users', "pageViews | where timestamp >= ago(30d) | summarize PageViews=count(), Users=dcount(user_Id), Sessions=dcount(session_Id) by Day=startofday(timestamp) | order by Day asc", 'timechart', '70');
query('top-pages', 'Top pages', "pageViews | where timestamp >= ago(30d) | extend Page=iff(isempty(name), tostring(parse_url(url).Path), name) | summarize Views=count(), Users=dcount(user_Id), Sessions=dcount(session_Id) by Page | top 15 by Views desc", 'barchart', '30');

markdown('usage-heading', '## Feature adoption\nWhich intentional product actions users take after arriving.');
query('feature-adoption', 'Feature adoption by session', "customEvents | where timestamp >= ago(30d) | summarize Actions=count(), Users=dcount(user_Id), Sessions=dcount(session_Id) by Feature=name | top 15 by Sessions desc", 'barchart', '70');
query('acquisition', 'Acquisition sources', "pageViews | where timestamp >= ago(30d) | extend Source=extract(@'[?&]utm_source=([^&]+)', 1, url), Campaign=extract(@'[?&]utm_campaign=([^&]+)', 1, url) | extend Source=iff(isempty(Source), 'Direct / unattributed', Source), Campaign=iff(isempty(Campaign), 'None', Campaign) | summarize Sessions=dcount(session_Id), Users=dcount(user_Id), Views=count() by Source, Campaign | top 15 by Sessions desc", 'table', '30');

markdown('funnels-heading', '## Conversion funnels\nStages are ordered within the same Application Insights session. Counts are directional product signals, not identity-level attribution.');
query('profile-funnel', 'Profile value funnel', "let E=customEvents | where timestamp >= ago(30d) and isnotempty(session_Id); let S=E | summarize Profile=minif(timestamp, name == 'profile_viewed'), Card=minif(timestamp, name == 'card_generated'), Share=minif(timestamp, name in ('identity_card_shared','agent_profile_shared')), Claim=minif(timestamp, name == 'claim_completed') by session_Id; union (S | summarize Sessions=countif(isnotnull(Profile)) | extend StepOrder=1, Stage='Profile viewed'), (S | summarize Sessions=countif(isnotnull(Profile) and Card >= Profile) | extend StepOrder=2, Stage='Card generated'), (S | summarize Sessions=countif(isnotnull(Profile) and Card >= Profile and Share >= Card) | extend StepOrder=3, Stage='Profile shared'), (S | summarize Sessions=countif(isnotnull(Profile) and Claim >= Profile) | extend StepOrder=4, Stage='Profile claimed') | order by StepOrder asc | project Stage, Sessions", 'barchart', '50');
query('mission-funnel', 'Daily mission funnel', "let E=customEvents | where timestamp >= ago(30d) and isnotempty(session_Id); let S=E | summarize Preview=minif(timestamp, name in ('mission_preview_requested','mission_preview_shown')), Viewed=minif(timestamp, name == 'mission_viewed'), Accepted=minif(timestamp, name == 'mission_accepted'), Completed=minif(timestamp, name == 'mission_completed') by session_Id; union (S | summarize Sessions=countif(isnotnull(Preview)) | extend StepOrder=1, Stage='Preview'), (S | summarize Sessions=countif(isnotnull(Preview) and Viewed >= Preview) | extend StepOrder=2, Stage='Viewed'), (S | summarize Sessions=countif(isnotnull(Viewed) and Accepted >= Viewed) | extend StepOrder=3, Stage='Accepted'), (S | summarize Sessions=countif(isnotnull(Accepted) and Completed >= Accepted) | extend StepOrder=4, Stage='Completed') | order by StepOrder asc | project Stage, Sessions", 'barchart', '50');
query('session-depth', 'Session depth', "let P=pageViews | where timestamp >= ago(30d) and isnotempty(session_Id); let SessionDepth=P | summarize PageViews=count(), DistinctPages=dcount(name) by session_Id; SessionDepth | extend Depth=case(PageViews == 1, '1 view', PageViews between (2 .. 3), '2-3 views', PageViews between (4 .. 7), '4-7 views', '8+ views') | summarize Sessions=count() by Depth", 'piechart');

markdown('mcp-heading', '## MCP adoption and reliability\nPrivacy-safe usage of the public DevGlobe MCP endpoint. Client values are bounded families; prompts, tool arguments, tokens, and raw user agents are never collected.');
const mcpEvents = "let M=workspace('c97b958c-a52f-45b5-bcc1-d7eb355850ff').ContainerAppConsoleLogs_CL | where TimeGenerated >= ago(30d) and Log_s has 'devglobe_mcp' | extend Metric=parse_json(Log_s) | where tostring(Metric.event) == 'devglobe_mcp' | extend Timestamp=TimeGenerated, Method=tostring(Metric.method), Tool=iff(isempty(tostring(Metric.tool)), 'none', tostring(Metric.tool)), Resource=iff(isempty(tostring(Metric.resource)), 'none', tostring(Metric.resource)), Prompt=iff(isempty(tostring(Metric.prompt)), 'none', tostring(Metric.prompt)), Client=iff(isempty(tostring(Metric.client)), 'unknown', tostring(Metric.client)), Outcome=tostring(Metric.outcome), DurationMs=todouble(Metric.durationMs), ResultCount=todouble(Metric.resultCount), CallerHash=tostring(Metric.callerHash), ErrorCode=tostring(Metric.errorCode);";
query('mcp-health', 'MCP health - last 30 days', `${mcpEvents} let T=M | summarize Calls=count(), ToolCalls=countif(Method == 'tools/call'), PromptLists=countif(Method == 'prompts/list'), PromptGets=countif(Method == 'prompts/get'), ProjectReads=countif(Method == 'resources/read' and Resource == 'devglobe://project'), CallerDays=dcountif(CallerHash, isnotempty(CallerHash)), Successful=countif(Outcome == 'success'), P95LatencyMs=percentile(DurationMs, 95); T | extend SuccessRate=iff(Calls == 0, 0.0, round(100.0 * Successful / Calls, 1)) | project Metric=pack_array('Requests', 'Tool calls', 'Prompt lists', 'Prompt opens', 'Project resource reads', 'Correlated caller-days', 'Success rate %', 'P95 latency ms'), Value=pack_array(todouble(Calls), todouble(ToolCalls), todouble(PromptLists), todouble(PromptGets), todouble(ProjectReads), todouble(CallerDays), SuccessRate, P95LatencyMs) | mv-expand Metric to typeof(string), Value to typeof(real)`, 'tiles', null, {
  size: 4,
  tileSettings: {
    titleContent: { columnMatch: 'Metric', formatter: 1 },
    leftContent: { columnMatch: 'Value', formatter: 12, formatOptions: { palette: 'auto' } },
    showBorder: true,
  },
});
query('mcp-daily', 'Daily MCP requests, prompt use, project reads, and errors', `${mcpEvents} M | summarize Requests=count(), PromptLists=countif(Method == 'prompts/list'), PromptOpens=countif(Method == 'prompts/get'), ProjectReads=countif(Method == 'resources/read' and Resource == 'devglobe://project'), Errors=countif(Outcome == 'error') by Day=startofday(Timestamp) | order by Day asc`, 'timechart', '60');
query('mcp-tools', 'Tool adoption', `${mcpEvents} M | where Method == 'tools/call' and Tool != 'none' | summarize Calls=count(), Successful=countif(Outcome == 'success'), Results=sum(ResultCount), P95LatencyMs=round(percentile(DurationMs, 95), 0) by Tool | extend SuccessRate=round(100.0 * Successful / Calls, 1) | project Tool, Calls, SuccessRate, P95LatencyMs, Results | order by Calls desc`, 'barchart', '40');
query('mcp-clients', 'MCP client mix', `${mcpEvents} M | summarize Requests=count(), ToolCalls=countif(Method == 'tools/call'), PromptOpens=countif(Method == 'prompts/get'), ProjectReads=countif(Method == 'resources/read' and Resource == 'devglobe://project') by Client | order by Requests desc`, 'piechart', '50');
query('mcp-reliability', 'Reliability by method and operation', `${mcpEvents} M | extend Operation=case(Prompt != 'none', Prompt, Tool != 'none', Tool, Resource != 'none', Resource, 'none') | summarize Requests=count(), Errors=countif(Outcome == 'error'), P50LatencyMs=round(percentile(DurationMs, 50), 0), P95LatencyMs=round(percentile(DurationMs, 95), 0) by Method, Operation | extend SuccessRate=round(100.0 * (Requests - Errors) / Requests, 1) | project Method, Operation, Requests, SuccessRate, P50LatencyMs, P95LatencyMs | order by Requests desc`, 'table', '50');
query('mcp-conversion', 'MCP caller-day conversion', `${mcpEvents} let C=M | where isnotempty(CallerHash) | summarize Initialized=countif(Method == 'initialize') > 0, Listed=countif(Method == 'tools/list') > 0, ListedPrompts=countif(Method == 'prompts/list') > 0, OpenedPrompt=countif(Method == 'prompts/get') > 0, Called=countif(Method == 'tools/call') > 0, Succeeded=countif(Method == 'tools/call' and Outcome == 'success') > 0 by CallerHash; union (C | summarize CallerDays=countif(Initialized) | extend StepOrder=1, Stage='Initialized'), (C | summarize CallerDays=countif(Initialized and Listed) | extend StepOrder=2, Stage='Listed tools'), (C | summarize CallerDays=countif(Initialized and ListedPrompts) | extend StepOrder=3, Stage='Listed prompts'), (C | summarize CallerDays=countif(Initialized and OpenedPrompt) | extend StepOrder=4, Stage='Opened a prompt'), (C | summarize CallerDays=countif(Initialized and Listed and Called) | extend StepOrder=5, Stage='Called a tool'), (C | summarize CallerDays=countif(Initialized and Listed and Called and Succeeded) | extend StepOrder=6, Stage='Successful tool result') | order by StepOrder asc | project Stage, CallerDays`, 'barchart', '60');
query('mcp-errors', 'MCP errors by code', `${mcpEvents} M | where Outcome == 'error' | extend ErrorCode=iff(isempty(ErrorCode), 'unclassified', ErrorCode) | summarize Errors=count(), CallerDays=dcountif(CallerHash, isnotempty(CallerHash)), LastSeen=max(Timestamp) by ErrorCode, Tool | order by Errors desc`, 'table', '40');

const workbook = { version: 'Notebook/1.0', items, fallbackResourceIds: [], fromTemplateId: null, $schema: 'https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/schema/workbook.json' };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(workbook, null, 2)}\n`);
console.log(`Generated ${path.relative(process.cwd(), outputPath)} with ${items.length} items.`);