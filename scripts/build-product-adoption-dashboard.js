#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(directory, '..', 'dashboards', 'devglobe-product-adoption-dashboard.json');
const clusterUri = process.env.ADX_CLUSTER_URI || 'https://devlglobe.eastus2.kusto.windows.net';
const database = process.env.ADX_DATABASE || 'devglobe-analytics';

const dataSourceId = crypto.randomUUID();
const dataSources = [{
  id: dataSourceId,
  kind: 'manual-kusto',
  name: 'DevGlobe Product Analytics',
  clusterUri,
  database,
}];

const overviewPageId = crypto.randomUUID();
const usagePageId = crypto.randomUUID();
const funnelsPageId = crypto.randomUUID();
const pages = [
  { name: 'Adoption Overview', id: overviewPageId },
  { name: 'Usage & Acquisition', id: usagePageId },
  { name: 'Funnels & Retention', id: funnelsPageId },
];

const tiles = [];
const queries = [];
function uuid() { return crypto.randomUUID(); }
function addQuery(text, dsId = dataSourceId) {
  const id = uuid();
  queries.push({ dataSource: { kind: 'inline', dataSourceId: dsId }, text, id, usedVariables: [] });
  return id;
}
function addMarkdown(pageId, title, markdownText, y, height = 2) {
  tiles.push({ id: uuid(), title, visualType: 'markdownCard', pageId, layout: { x: 0, y, width: 18, height }, markdownText, visualOptions: {} });
}
function addTile(pageId, title, type, queryId, layout, visualOptions = {}) {
  tiles.push({ id: uuid(), title, visualType: type, pageId, layout, queryRef: { kind: 'query', queryId }, visualOptions });
}
function multistat(width, height = 4) {
  return { multiStat__textSize: 'auto', multiStat__valueColumn: null, colorRulesDisabled: false, multiStat__displayOrientation: 'horizontal', multiStat__labelColumn: null, multiStat__slot: { width, height }, colorRules: [] };
}
function pie(kind = 'donut', location = 'bottom') {
  return { hideLegend: false, legendLocation: location, xColumn: null, yColumns: null, seriesColumns: null, crossFilterDisabled: false, drillthroughDisabled: false, labelDisabled: false, pie__label: ['name', 'percentage'], tooltipDisabled: false, pie__tooltip: ['name', 'percentage', 'value'], pie__orderBy: 'size', pie__kind: kind, pie__topNSlices: null, seriesColors: {}, crossFilter: [], drillthrough: [] };
}
function chart(xColumn, yColumns, options = {}) {
  return { multipleYAxes: { base: { id: '-1', label: options.yLabel || '', columns: [], yAxisMaximumValue: null, yAxisMinimumValue: null, yAxisScale: 'linear', horizontalLines: [] }, additional: [], showMultiplePanels: false }, hideLegend: options.hideLegend ?? yColumns.length === 1, legendLocation: options.legend || 'right', xColumnTitle: '', xColumn, yColumns, seriesColumns: options.series || null, xAxisScale: 'linear', verticalLine: '', crossFilterDisabled: false, drillthroughDisabled: false, forceAxisTicks: false, seriesColors: {}, crossFilter: [], drillthrough: [] };
}
function table() {
  return { table__enableRenderLinks: false, colorRulesDisabled: true, crossFilterDisabled: false, drillthroughDisabled: false, crossFilter: [], drillthrough: [], table__renderLinks: [], colorRules: [] };
}

const events = `let Events = () {
  DevGlobeEngagementRaw
  | extend EventId=tostring(Document.id), IngestedAt=coalesce(CosmosTimestamp, unixtime_seconds_todatetime(tolong(Document._ts)))
  | where isnotempty(EventId)
  | summarize arg_max(IngestedAt, *) by EventId
  | extend
      EventTime=todatetime(Document.createdAt),
      EventName=tostring(Document.eventName),
      SessionHash=tostring(Document.sessionHash),
      PrivacyHash=tostring(Document.privacyHash),
      TargetLogin=tostring(Document.targetLogin),
      Source=tostring(Document.properties.source),
      Journey=tostring(Document.properties.journey),
      Action=tostring(Document.properties.action),
        Channel=tostring(Document.properties.channel),
        SchemaVersion=toint(Document.schemaVersion),
        InstrumentationVersion=toint(Document.instrumentationVersion),
        ActorType=tostring(Document.actorType)
      | where isnotnull(EventTime) and isnotempty(EventName) and isnotempty(SessionHash)
      | where ActorType == "human" and Source !in ("local", "synthetic", "test");
};`;

let y = 0;
addMarkdown(overviewPageId, 'Product Adoption Overview', '## Product adoption\nA product-owner view of reach, meaningful use, and repeat adoption. All metrics use privacy-safe browser session hashes and intentional product events.', y);
y += 2;
const overviewKpis = addQuery(`${events}
let E=Events | where EventTime between (ago(30d) .. now());
let S=E | summarize EventTypes=dcount(EventName), HasValue=countif(EventName in ("card_generated", "profile_shared", "profile_claimed", "mission_completed", "next_action_selected")) > 0 by SessionHash;
union
  (S | summarize Value=count() | extend Metric="Active sessions"),
  (S | where EventTypes >= 2 | summarize Value=count() | extend Metric="Engaged sessions"),
  (S | where HasValue | summarize Value=count() | extend Metric="Value sessions"),
  (E | where EventName == "profile_viewed" | summarize Value=count() | extend Metric="Profile views"),
  (E | summarize Value=dcount(TargetLogin) | extend Metric="Profiles reached")
| project Metric, Value`);
addTile(overviewPageId, 'Last 30 Days', 'multistat', overviewKpis, { x: 0, y, width: 18, height: 4 }, multistat(18));
y += 4;
const dailyAdoption = addQuery(`${events}
Events
| where EventTime between (ago(90d) .. now())
| summarize Events=count(), EventTypes=dcount(EventName) by Day=startofday(EventTime), SessionHash
| summarize ActiveSessions=count(), EngagedSessions=countif(EventTypes >= 2), Events=sum(Events) by Day
| order by Day asc`);
addTile(overviewPageId, 'Daily Active and Engaged Sessions', 'line', dailyAdoption, { x: 0, y, width: 12, height: 6 }, chart('Day', ['ActiveSessions', 'EngagedSessions'], { hideLegend: false }));
const engagementHealth = addQuery(`${events}
let E=Events | where EventTime between (ago(30d) .. now());
let S=E | summarize EventTypes=dcount(EventName), Events=count(), HasValue=countif(EventName in ("card_generated", "profile_shared", "profile_claimed", "mission_completed", "next_action_selected")) > 0 by SessionHash;
let Totals=S | summarize Active=count(), Engaged=countif(EventTypes >= 2), ValueSessions=countif(HasValue), AvgEvents=round(avg(Events), 2);
Totals
| extend EngagementRate=iff(Active == 0, 0.0, round(100.0 * Engaged / Active, 1)), ValueRate=iff(Active == 0, 0.0, round(100.0 * ValueSessions / Active, 1))
| project Metric=pack_array("Engagement rate", "Value-session rate", "Events per session"), Value=pack_array(EngagementRate, ValueRate, AvgEvents)
| mv-expand Metric to typeof(string), Value to typeof(real)`);
addTile(overviewPageId, 'Adoption Health', 'multistat', engagementHealth, { x: 12, y, width: 6, height: 6 }, multistat(6, 6));
y += 6;
const weeklyAdoption = addQuery(`${events}
Events
| where EventTime between (ago(180d) .. now())
| summarize ActiveSessions=dcount(SessionHash), ValueSessions=dcountif(SessionHash, EventName in ("card_generated", "profile_shared", "profile_claimed", "mission_completed", "next_action_selected")) by Week=startofweek(EventTime)
| where Week < startofweek(now())
| order by Week asc`);
addTile(overviewPageId, 'Completed Weekly Adoption', 'column', weeklyAdoption, { x: 0, y, width: 12, height: 6 }, chart('Week', ['ActiveSessions', 'ValueSessions'], { hideLegend: false }));
const topValueActions = addQuery(`${events}
Events
| where EventTime between (ago(30d) .. now())
| where EventName in ("card_generated", "profile_shared", "profile_claimed", "mission_completed", "next_action_selected")
| summarize Events=count(), Sessions=dcount(SessionHash) by EventName
| extend Event=strcat_array(split(EventName, "_"), " ")
| project Event, Events, Sessions
| order by Sessions desc`);
addTile(overviewPageId, 'Value Actions', 'table', topValueActions, { x: 12, y, width: 6, height: 6 }, table());

y = 0;
addMarkdown(usagePageId, 'Usage and Acquisition', '## Usage and acquisition\nUnderstand which experiences users adopt and which attributed sources, journeys, and channels produce meaningful sessions.', y);
y += 2;
const usageKpis = addQuery(`${events}
let E=Events | where EventTime between (ago(30d) .. now());
union
  (E | summarize Value=count() | extend Metric="Tracked actions"),
  (E | summarize Value=dcount(SessionHash) | extend Metric="Active sessions"),
  (E | where EventName == "profile_viewed" | summarize Value=dcount(TargetLogin) | extend Metric="Profiles viewed"),
  (E | where isnotempty(Source) | summarize Value=dcount(SessionHash) | extend Metric="Attributed sessions")
| project Metric, Value`);
addTile(usagePageId, 'Usage KPIs - Last 30 Days', 'multistat', usageKpis, { x: 0, y, width: 18, height: 4 }, multistat(18));
y += 4;
const dailyUsage = addQuery(`${events}
Events
| where EventTime between (ago(60d) .. now())
| extend EventGroup=case(
    EventName in ("search_appearance", "profile_viewed"), "Discovery",
    EventName in ("card_generated", "profile_shared", "profile_claimed"), "Identity & sharing",
    EventName startswith "mission_", "Missions",
    EventName in ("recommendation_opened", "next_action_selected", "comparison_started"), "Exploration",
    "Other")
| summarize Actions=count() by Day=startofday(EventTime), EventGroup
| order by Day asc`);
addTile(usagePageId, 'Daily Usage by Product Area', 'column', dailyUsage, { x: 0, y, width: 12, height: 6 }, chart('Day', ['Actions'], { series: ['EventGroup'], hideLegend: false }));
const sources = addQuery(`${events}
Events
| where EventTime between (ago(30d) .. now())
| extend AcquisitionSource=iff(isempty(Source), "Unattributed", Source)
| summarize Value=dcount(SessionHash) by AcquisitionSource
| top 10 by Value desc`);
addTile(usagePageId, 'Acquisition Sources', 'pie', sources, { x: 12, y, width: 6, height: 6 }, pie('donut', 'bottom'));
y += 6;
const featureAdoption = addQuery(`${events}
Events
| where EventTime between (ago(30d) .. now())
| summarize Sessions=dcount(SessionHash), Actions=count() by EventName
| extend Feature=strcat_array(split(EventName, "_"), " ")
| project Feature, Sessions, Actions
| top 15 by Sessions desc`);
addTile(usagePageId, 'Feature Adoption', 'bar', featureAdoption, { x: 0, y, width: 12, height: 7 }, chart('Feature', ['Sessions'], { hideLegend: true }));
const journeys = addQuery(`${events}
Events
| where EventTime between (ago(30d) .. now())
| where isnotempty(Journey)
| summarize Sessions=dcount(SessionHash), Actions=count(), ValueSessions=dcountif(SessionHash, EventName in ("mission_completed", "next_action_selected", "profile_shared")) by Journey
| extend ValueRate=round(100.0 * ValueSessions / Sessions, 1)
| project Journey, Sessions, Actions, ValueSessions, ValueRate
| order by Sessions desc`);
addTile(usagePageId, 'Journey Performance', 'table', journeys, { x: 12, y, width: 6, height: 7 }, table());
y += 7;
const channels = addQuery(`${events}
Events
| where EventTime between (ago(30d) .. now()) and EventName == "profile_shared"
| extend ShareChannel=iff(isempty(Channel), "Unspecified", Channel)
| summarize Shares=count(), Sharers=dcount(SessionHash) by ShareChannel
| order by Shares desc`);
addTile(usagePageId, 'Sharing Channels', 'table', channels, { x: 0, y, width: 9, height: 5 }, table());
const topProfiles = addQuery(`${events}
Events
| where EventTime between (ago(30d) .. now()) and isnotempty(TargetLogin)
| summarize Views=countif(EventName == "profile_viewed"), Cards=countif(EventName == "card_generated"), Shares=countif(EventName == "profile_shared") by TargetLogin
| where Views + Cards + Shares > 0
| top 20 by Views desc`);
addTile(usagePageId, 'Most Viewed Profiles', 'table', topProfiles, { x: 9, y, width: 9, height: 5 }, table());

y = 0;
addMarkdown(funnelsPageId, 'Funnels and Retention', '## Adoption and retention scorecard\nCurrent seven-day metrics compare with the immediately preceding seven days. Counts below three privacy cohorts are suppressed. Targets are weekly product goals, not historical guarantees. `site_visited` and `search_submitted` begin with instrumentation version 2; earlier periods are incomplete.', y, 3);
y += 3;
const productScorecard = addQuery(`${events}
let MinimumCohort=3;
let Boundary=ago(7d);
let CurrentEnd=now();
let PreviousStart=Boundary-7d;
let Cohorts=(Start:datetime, End:datetime) {
  let Period=Events | where EventTime >= Start and EventTime < End;
  let Visits=Period | where EventName == "site_visited" | summarize Visit=min(EventTime), Privacy=take_any(PrivacyHash) by SessionHash;
  let Searches=Visits | join kind=leftouter (Period | where EventName == "search_submitted" | project SessionHash, SearchEvent=EventTime) on SessionHash | summarize Visit=take_any(Visit), Privacy=take_any(Privacy), Search=minif(SearchEvent, SearchEvent >= Visit) by SessionHash;
  let Profiles=Searches | join kind=leftouter (Period | where EventName == "profile_viewed" | project SessionHash, ProfileEvent=EventTime) on SessionHash | summarize Visit=take_any(Visit), Privacy=take_any(Privacy), Search=take_any(Search), Profile=minif(ProfileEvent, ProfileEvent >= Search) by SessionHash;
  Profiles | join kind=leftouter (Period | where EventName == "next_action_selected" and Journey == "profile_primary_action" | project SessionHash, ActionEvent=EventTime) on SessionHash | summarize Visit=take_any(Visit), Privacy=take_any(Privacy), Search=take_any(Search), Profile=take_any(Profile), Action=minif(ActionEvent, ActionEvent >= Profile) by SessionHash
};
let C=Cohorts(Boundary,CurrentEnd);
let P=Cohorts(PreviousStart,Boundary);
let CV=todouble(toscalar(C | summarize dcountif(SessionHash,isnotnull(Visit)))); let CVP=toscalar(C | where isnotnull(Visit) | summarize dcount(Privacy));
let PV=todouble(toscalar(P | summarize dcountif(SessionHash,isnotnull(Visit)))); let PVP=toscalar(P | where isnotnull(Visit) | summarize dcount(Privacy));
let CS=todouble(toscalar(C | summarize dcountif(SessionHash,isnotnull(Visit) and Search>=Visit))); let CSP=toscalar(C | where isnotnull(Visit) and Search>=Visit | summarize dcount(Privacy));
let PS=todouble(toscalar(P | summarize dcountif(SessionHash,isnotnull(Visit) and Search>=Visit))); let PSP=toscalar(P | where isnotnull(Visit) and Search>=Visit | summarize dcount(Privacy));
let CP=todouble(toscalar(C | summarize dcountif(SessionHash,isnotnull(Visit) and Search>=Visit and Profile>=Search))); let CPP=toscalar(C | where isnotnull(Visit) and Search>=Visit and Profile>=Search | summarize dcount(Privacy));
let PP=todouble(toscalar(P | summarize dcountif(SessionHash,isnotnull(Visit) and Search>=Visit and Profile>=Search))); let PPP=toscalar(P | where isnotnull(Visit) and Search>=Visit and Profile>=Search | summarize dcount(Privacy));
let CA=todouble(toscalar(C | summarize dcountif(SessionHash,isnotnull(Visit) and Search>=Visit and Profile>=Search and Action>=Profile))); let CAP=toscalar(C | where isnotnull(Visit) and Search>=Visit and Profile>=Search and Action>=Profile | summarize dcount(Privacy));
let PA=todouble(toscalar(P | summarize dcountif(SessionHash,isnotnull(Visit) and Search>=Visit and Profile>=Search and Action>=Profile))); let PAP=toscalar(P | where isnotnull(Visit) and Search>=Visit and Profile>=Search and Action>=Profile | summarize dcount(Privacy));
union
  (print Metric="Visitors", Current7d=iff(CVP<MinimumCohort,real(null),CV), Previous7d=iff(PVP<MinimumCohort,real(null),PV), WeeklyTarget=100.0),
  (print Metric="Search submissions", Current7d=iff(CSP<MinimumCohort,real(null),CS), Previous7d=iff(PSP<MinimumCohort,real(null),PS), WeeklyTarget=30.0),
  (print Metric="Profile opens", Current7d=iff(CPP<MinimumCohort,real(null),CP), Previous7d=iff(PPP<MinimumCohort,real(null),PP), WeeklyTarget=20.0),
  (print Metric="Primary actions", Current7d=iff(CAP<MinimumCohort,real(null),CA), Previous7d=iff(PAP<MinimumCohort,real(null),PA), WeeklyTarget=10.0),
  (print Metric="Visitor to search %", Current7d=iff(CVP<MinimumCohort,real(null),round(100.0*CS/CV,1)), Previous7d=iff(PVP<MinimumCohort,real(null),round(100.0*PS/PV,1)), WeeklyTarget=25.0),
  (print Metric="Search to profile %", Current7d=iff(CSP<MinimumCohort,real(null),round(100.0*CP/CS,1)), Previous7d=iff(PSP<MinimumCohort,real(null),round(100.0*PP/PS,1)), WeeklyTarget=50.0),
  (print Metric="Profile to action %", Current7d=iff(CPP<MinimumCohort,real(null),round(100.0*CA/CP,1)), Previous7d=iff(PPP<MinimumCohort,real(null),round(100.0*PA/PP,1)), WeeklyTarget=15.0)
| extend Change=round(Current7d-Previous7d,1), Status=case(isnull(Current7d),"Privacy suppressed",Current7d>=WeeklyTarget,"On target","Below target")`);
addTile(funnelsPageId, 'Weekly Product Scorecard', 'table', productScorecard, { x: 0, y, width: 18, height: 7 }, table());
y += 7;
const adoptionFunnel = addQuery(`${events}
let MinimumCohort=3;
let E=Events | where EventTime >= ago(7d) and EventTime < now();
let Visits=E | where EventName == "site_visited" | summarize Visit=min(EventTime), Privacy=take_any(PrivacyHash) by SessionHash;
let Searches=Visits | join kind=leftouter (E | where EventName == "search_submitted" | project SessionHash, SearchEvent=EventTime) on SessionHash | summarize Visit=take_any(Visit), Privacy=take_any(Privacy), Search=minif(SearchEvent, SearchEvent >= Visit) by SessionHash;
let Profiles=Searches | join kind=leftouter (E | where EventName == "profile_viewed" | project SessionHash, ProfileEvent=EventTime) on SessionHash | summarize Visit=take_any(Visit), Privacy=take_any(Privacy), Search=take_any(Search), Profile=minif(ProfileEvent, ProfileEvent >= Search) by SessionHash;
let S=Profiles | join kind=leftouter (E | where EventName == "next_action_selected" and Journey == "profile_primary_action" | project SessionHash, ActionEvent=EventTime) on SessionHash | summarize Visit=take_any(Visit), Privacy=take_any(Privacy), Search=take_any(Search), Profile=take_any(Profile), Action=minif(ActionEvent, ActionEvent >= Profile) by SessionHash;
union
  (S | summarize Browsers=countif(isnotnull(Visit)), PrivacyCohorts=dcountif(Privacy,isnotnull(Visit)) | extend StepOrder=1, Stage="Visitors"),
  (S | summarize Browsers=countif(isnotnull(Visit) and Search >= Visit), PrivacyCohorts=dcountif(Privacy,isnotnull(Visit) and Search >= Visit) | extend StepOrder=2, Stage="Search submitted"),
  (S | summarize Browsers=countif(isnotnull(Visit) and Search >= Visit and Profile >= Search), PrivacyCohorts=dcountif(Privacy,isnotnull(Visit) and Search >= Visit and Profile >= Search) | extend StepOrder=3, Stage="Profile opened"),
  (S | summarize Browsers=countif(isnotnull(Visit) and Search >= Visit and Profile >= Search and Action >= Profile), PrivacyCohorts=dcountif(Privacy,isnotnull(Visit) and Search >= Visit and Profile >= Search and Action >= Profile) | extend StepOrder=4, Stage="Primary action completed")
| extend Browsers=iff(PrivacyCohorts < MinimumCohort, long(null), Browsers)
| order by StepOrder asc
| project Stage, Browsers`);
addTile(funnelsPageId, 'Visitor to Value Funnel - Last 7 Days', 'bar', adoptionFunnel, { x: 0, y, width: 12, height: 6 }, chart('Stage', ['Browsers'], { hideLegend: true }));
const telemetryHealth = addQuery(`${events}
let Required=datatable(EventName:string)["site_visited", "search_submitted", "profile_viewed", "next_action_selected"];
let Recent=Events | where EventTime >= ago(7d) | where EventName != "next_action_selected" or Journey == "profile_primary_action";
Required
| join kind=leftouter (Recent | summarize Events=count(), LastSeen=max(EventTime), Versions=make_set(InstrumentationVersion) by EventName) on EventName
| extend Events=toint(coalesce(Events, 0))
| extend Status=case(isnull(LastSeen) or Events == 0, "ALERT: missing", LastSeen < ago(24h), "ALERT: stale", "Healthy")
| project EventName, Events, LastSeen, Versions, Status`);
addTile(funnelsPageId, 'Telemetry Health and Gaps', 'table', telemetryHealth, { x: 12, y, width: 6, height: 6 }, table());
y += 6;
const funnelKpis = addQuery(`${events}
let E=Events | where EventTime between (ago(30d) .. now());
let Discovery=E | summarize Impression=minif(EventTime, EventName == "search_appearance"), View=minif(EventTime, EventName == "profile_viewed"), Card=minif(EventTime, EventName == "card_generated"), Share=minif(EventTime, EventName == "profile_shared") by SessionHash, TargetLogin;
let D=Discovery | summarize Impressions=countif(isnotnull(Impression)), Views=countif(isnotnull(Impression) and View >= Impression), Cards=countif(isnotnull(Impression) and View >= Impression and Card >= View), Shares=countif(isnotnull(Impression) and View >= Impression and Card >= View and Share >= Card);
D
| extend ViewRate=iff(Impressions == 0, 0.0, round(100.0 * Views / Impressions, 1)), CardRate=iff(Impressions == 0, 0.0, round(100.0 * Cards / Impressions, 1)), ShareRate=iff(Impressions == 0, 0.0, round(100.0 * Shares / Impressions, 1))
| project Metric=pack_array("Search-to-view %", "Search-to-card %", "Search-to-share %"), Value=pack_array(ViewRate, CardRate, ShareRate)
| mv-expand Metric to typeof(string), Value to typeof(real)`);
addTile(funnelsPageId, 'Discovery Conversion - Last 30 Days', 'multistat', funnelKpis, { x: 0, y, width: 18, height: 4 }, multistat(18));
y += 4;
const discoveryFunnel = addQuery(`${events}
let E=Events | where EventTime between (ago(30d) .. now());
let T=E | summarize Impression=minif(EventTime, EventName == "search_appearance"), View=minif(EventTime, EventName == "profile_viewed"), Card=minif(EventTime, EventName == "card_generated"), Share=minif(EventTime, EventName == "profile_shared") by SessionHash, TargetLogin;
union
  (T | summarize Sessions=countif(isnotnull(Impression)) | extend StepOrder=1, Step="Search appearance"),
  (T | summarize Sessions=countif(isnotnull(Impression) and View >= Impression) | extend StepOrder=2, Step="Profile viewed"),
  (T | summarize Sessions=countif(isnotnull(Impression) and View >= Impression and Card >= View) | extend StepOrder=3, Step="Card generated"),
  (T | summarize Sessions=countif(isnotnull(Impression) and View >= Impression and Card >= View and Share >= Card) | extend StepOrder=4, Step="Profile shared")
| order by StepOrder asc
| project Step, Sessions`);
addTile(funnelsPageId, 'Discovery to Sharing Funnel', 'bar', discoveryFunnel, { x: 0, y, width: 9, height: 6 }, chart('Step', ['Sessions'], { hideLegend: true }));
const explorationFunnel = addQuery(`${events}
let E=Events | where EventTime between (ago(30d) .. now());
let T=E | summarize Profile=minif(EventTime, EventName == "profile_viewed"), Recommendation=minif(EventTime, EventName == "recommendation_opened"), Action=minif(EventTime, EventName == "next_action_selected") by SessionHash;
union
  (T | summarize Sessions=countif(isnotnull(Profile)) | extend StepOrder=1, Step="Profile viewed"),
  (T | summarize Sessions=countif(isnotnull(Profile) and Recommendation >= Profile) | extend StepOrder=2, Step="Recommendation opened"),
  (T | summarize Sessions=countif(isnotnull(Profile) and Recommendation >= Profile and Action >= Recommendation) | extend StepOrder=3, Step="Next action selected")
| order by StepOrder asc
| project Step, Sessions`);
addTile(funnelsPageId, 'Exploration Funnel', 'bar', explorationFunnel, { x: 9, y, width: 9, height: 6 }, chart('Step', ['Sessions'], { hideLegend: true }));
y += 6;
const missionFunnel = addQuery(`${events}
let E=Events | where EventTime between (ago(30d) .. now());
let T=E | summarize Viewed=minif(EventTime, EventName == "mission_viewed"), Accepted=minif(EventTime, EventName == "mission_accepted"), Completed=minif(EventTime, EventName == "mission_completed") by SessionHash;
union
  (T | summarize Sessions=countif(isnotnull(Viewed)) | extend StepOrder=1, Step="Mission viewed"),
  (T | summarize Sessions=countif(isnotnull(Viewed) and Accepted >= Viewed) | extend StepOrder=2, Step="Mission accepted"),
  (T | summarize Sessions=countif(isnotnull(Viewed) and Accepted >= Viewed and Completed >= Accepted) | extend StepOrder=3, Step="Mission completed")
| order by StepOrder asc
| project Step, Sessions`);
addTile(funnelsPageId, 'Daily Mission Funnel', 'bar', missionFunnel, { x: 0, y, width: 9, height: 6 }, chart('Step', ['Sessions'], { hideLegend: true }));
const returningTrend = addQuery(`${events}
let E=Events | where EventTime between (ago(180d) .. now());
let FirstSeen=E | summarize FirstSeen=min(EventTime) by SessionHash;
E
| where EventTime between (ago(60d) .. now())
| extend Day=startofday(EventTime)
| join kind=leftouter FirstSeen on SessionHash
| summarize ActiveBrowsers=dcount(SessionHash), NewBrowsers=dcountif(SessionHash, FirstSeen >= Day and FirstSeen < Day + 1d), ReturningBrowsers=dcountif(SessionHash, FirstSeen < Day) by Day
| order by Day asc`);
addTile(funnelsPageId, 'New vs Returning Browsers', 'line', returningTrend, { x: 9, y, width: 9, height: 6 }, chart('Day', ['NewBrowsers', 'ReturningBrowsers'], { hideLegend: false }));
y += 6;
const retentionScorecard = addQuery(`${events}
let MinimumCohort=3;
let Visits=Events | where EventName == "site_visited" and EventTime >= ago(180d) | summarize FirstSeen=min(EventTime), LastSeen=max(EventTime) by SessionHash;
union
  (Visits | summarize Eligible=countif(FirstSeen < ago(7d)), Returned=countif(FirstSeen < ago(7d) and LastSeen >= ago(7d)) | extend Window="7-day"),
  (Visits | summarize Eligible=countif(FirstSeen < ago(30d)), Returned=countif(FirstSeen < ago(30d) and LastSeen >= ago(30d)) | extend Window="30-day")
| extend ReturnRate=iff(Eligible < MinimumCohort or Returned < MinimumCohort, real(null), round(100.0 * Returned / Eligible, 1)), Target=case(Window == "7-day", 20.0, 10.0)
| project Window, Eligible=iff(Eligible < MinimumCohort, long(null), Eligible), Returned=iff(Returned < MinimumCohort, long(null), Returned), ReturnRate, Target, Status=case(isnull(ReturnRate), "Privacy suppressed", ReturnRate >= Target, "On target", "Below target")`);
addTile(funnelsPageId, '7/30-Day Browser Retention', 'table', retentionScorecard, { x: 0, y, width: 9, height: 5 }, table());
const routeSourceBreakdown = addQuery(`${events}
Events
| where EventTime >= ago(30d) and EventName == "site_visited"
| extend Route=iff(isempty(Journey), "unknown", Journey), AcquisitionSource=iff(isempty(Source), "unattributed", Source)
| summarize Visitors=dcount(SessionHash) by Route, AcquisitionSource
| where Visitors >= 3
| order by Visitors desc`);
addTile(funnelsPageId, 'Route and Source Breakdown', 'table', routeSourceBreakdown, { x: 9, y, width: 9, height: 5 }, table());
y += 5;
const depth = addQuery(`${events}
Events
| where EventTime between (ago(30d) .. now())
| summarize EventTypes=dcount(EventName) by SessionHash
| extend Depth=case(EventTypes == 1, "1 event type", EventTypes between (2 .. 3), "2-3 event types", "4+ event types")
| summarize Value=count() by Depth`);
addTile(funnelsPageId, 'Session Engagement Depth', 'pie', depth, { x: 0, y, width: 6, height: 5 }, pie('donut', 'bottom'));
const journeyConversion = addQuery(`${events}
Events
| where EventTime between (ago(30d) .. now()) and isnotempty(Journey)
| summarize Sessions=dcount(SessionHash), Completed=dcountif(SessionHash, EventName in ("mission_completed", "next_action_selected", "profile_shared")) by Journey
| extend ConversionRate=round(100.0 * Completed / Sessions, 1)
| project Journey, Sessions, Completed, ConversionRate
| order by Sessions desc`);
addTile(funnelsPageId, 'Journey Conversion', 'table', journeyConversion, { x: 6, y, width: 12, height: 5 }, table());

const dashboard = {
  $schema: 'https://dataexplorer.azure.com/static/d/schema/75/dashboard.json',
  id: uuid(),
  eTag: uuid(),
  title: 'DevGlobe Product Adoption',
  schema_version: 75,
  tiles,
  pages,
  dataSources,
  queries,
  parameters: [],
};

let errors = 0;
const pageIdSet = new Set(pages.map(page => page.id));
const dataSourceIdSet = new Set(dataSources.map(dataSource => dataSource.id));
const queryIdSet = new Set(queries.map(query => query.id));
for (const tile of tiles) {
  if (!pageIdSet.has(tile.pageId)) { console.error(`ERROR: Tile "${tile.title}" bad pageId`); errors++; }
  if (tile.queryRef && !queryIdSet.has(tile.queryRef.queryId)) { console.error(`ERROR: Tile "${tile.title}" bad queryId`); errors++; }
}
for (const query of queries) {
  if (!dataSourceIdSet.has(query.dataSource.dataSourceId)) { console.error(`ERROR: Query ${query.id} bad dataSourceId`); errors++; }
}
const tileIdSet = new Set();
for (const tile of tiles) { if (tileIdSet.has(tile.id)) { console.error(`ERROR: Dup tile ${tile.id}`); errors++; } tileIdSet.add(tile.id); }
const queryIdSetSeen = new Set();
for (const query of queries) { if (queryIdSetSeen.has(query.id)) { console.error(`ERROR: Dup query ${query.id}`); errors++; } queryIdSetSeen.add(query.id); }
for (const tile of tiles) { if (tile.visualType === 'multistat' && !tile.visualOptions?.multiStat__slot?.height) { console.error(`ERROR: Multistat "${tile.title}" missing slot.height`); errors++; } }

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(dashboard, null, 2)}\n`);
console.log(`Generated ${path.relative(process.cwd(), outputPath)} with ${pages.length} pages, ${tiles.length} tiles, and ${queries.length} queries.`);
console.log(errors === 0 ? 'Validation: PASSED' : `Validation: ${errors} error(s)`);
if (errors > 0) process.exit(1);