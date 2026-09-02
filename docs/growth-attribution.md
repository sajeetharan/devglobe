# Growth attribution

Identity card shares and member invitations use `utm_source`, `utm_medium`, and `utm_campaign`. Review the rolling seven-day funnel in the Application Insights workspace with:

## Campaign URL conventions

Every distributed URL uses lowercase values from this bounded vocabulary. Do not put a login, email address, search phrase, referrer URL, or free-form campaign name in a UTM field.

| Field | Allowed values |
| --- | --- |
| `utm_source` | `copy_link`, `discord`, `facebook`, `github_discussions`, `linkedin`, `manual_outreach`, `native_share`, `reddit`, `share_page`, `weekly_digest`, `weekly_spotlight`, `x` |
| `utm_medium` | `community`, `email`, `referral`, `social` |
| `utm_campaign` | `agents`, `community`, `country_leaderboard`, `developer_activation`, `developer_invite`, `developer_spotlight`, `identity_card`, `india_top_50`, `product`, `rank_movement`, `weekly_impact` |
| `utm_content` | A public GitHub login for profile stories, or `contribution_opportunity`, `introduction_request`, or `rank_movement` for the weekly digest |

Unknown source, medium, and campaign values are recorded as `other`, `other`, and `unknown`. An untagged visit with a browser referrer is recorded as `external_referral` / `referral` / `organic_referral`; the referrer URL itself is never retained.

Review bounded acquisition events by source, channel, and campaign with:

```kusto
AppEvents
| where TimeGenerated >= ago(7d)
| where Name in ("site_visited", "profile_viewed", "shared_profile_link_opened", "claim_completed", "weekly_digest_returned")
| extend Source=tostring(Properties.source), Channel=tostring(Properties.channel), Campaign=tostring(Properties.campaign)
| summarize Events=count(), Users=dcount(UserId), Sessions=dcount(SessionId) by Name, Source, Channel, Campaign
| order by Events desc
```

Use the shared attribution helpers for generated URLs and arrival telemetry. Durable ingestion applies the same finite categories so direct API submissions cannot introduce unbounded dimensions.

## Referral funnel

```kusto
let window = 7d;
let actions = AppEvents
| where TimeGenerated >= ago(window)
| where Name in ("card_generated", "claim_completed", "identity_card_shared", "profile_viewed", "developer_invite_shared")
| extend Source=tostring(Properties.source), Channel=tostring(Properties.channel)
| summarize Events=count(), Users=dcount(UserId), Sessions=dcount(SessionId) by Name, Source, Channel;
let arrivals = AppPageViews
| where TimeGenerated >= ago(window)
| extend Source=extract(@"[?&]utm_source=([^&]+)", 1, Url), Campaign=extract(@"[?&]utm_campaign=([^&]+)", 1, Url)
| summarize Events=count(), Users=dcount(UserId), Sessions=dcount(SessionId) by Name="page_view", Source, Channel=Campaign;
union actions, arrivals
| order by Name asc, Events desc
```

Compare referral arrivals, profile views, card generations, shares, and claims seven days after each distribution change. The weekly spotlight workflow produces a review-only artifact every Monday; publishing remains a human decision.

## Social developer stories

Developer spotlights, country leaderboard stories, and rank-movement stories link to the canonical `/share/<login>` preview with `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content`. Only public profile and ranking fields are used in generated copy. Opening the attributed developer panel records `referral_profile_opened` with the target login, source, and campaign journey; arbitrary query fields are not retained.

Measure the seven-day shared-link landing-to-profile conversion as unique sessions with `referral_profile_opened` divided by unique sessions landing on `/share/` with a sharing campaign. The product target is at least 10%.

## Weekly impact email

Weekly impact emails use `utm_source=weekly_digest`, `utm_medium=email`, and `utm_campaign=weekly_impact`. An arrival records the privacy-safe `weekly_digest_returned` event with only the update type, journey, and source. The product adoption workbook compares seven-day return sessions with provider-accepted messages and reports progress toward the 20% return-rate target.

Only contacts with a verified email and explicit weekly-update consent are eligible. A subscriber's first run records a private comparison baseline without sending email. The job suppresses generic email when an established subscriber has no rank movement, fresh contribution opportunity, or pending introduction request. Delivery logs contain aggregate counts and provider outcomes only; they exclude logins, email addresses, message content, and provider response bodies.

## Community campaigns

Generate a review-only five-channel bundle for a claimed developer:

```powershell
npm run community-campaign -- --login=octocat --type=developer_spotlight --output=artifacts/community-octocat.json
npm run community-campaign -- --login=octocat --type=country_leaderboard --output=artifacts/community-country-octocat.json
```

Each bundle contains tailored copy and one bounded URL for LinkedIn, X, Reddit, Discord, and GitHub Discussions. An operator must review and publish every asset manually. The generator reads public profile/ranking fields only, requires a claimed profile, and never stores contact details in output. The product adoption workbook reports arrivals, profile opens, claims, and conversion rates by source, channel, and campaign; cohorts below three arrival sessions are suppressed.