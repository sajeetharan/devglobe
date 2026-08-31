# Growth attribution

Identity card shares and member invitations use `utm_source`, `utm_medium`, and `utm_campaign`. Review the rolling seven-day funnel in the Application Insights workspace with:

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

## Weekly impact email

Weekly impact emails use `utm_source=weekly_digest`, `utm_medium=email`, and `utm_campaign=weekly_impact`. An arrival records the privacy-safe `weekly_digest_returned` event with only the update type, journey, and source. The product adoption workbook compares seven-day return sessions with provider-accepted messages and reports progress toward the 20% return-rate target.

Only contacts with a verified email and explicit weekly-update consent are eligible. A subscriber's first run records a private comparison baseline without sending email. The job suppresses generic email when an established subscriber has no rank movement, fresh contribution opportunity, or pending introduction request. Delivery logs contain aggregate counts and provider outcomes only; they exclude logins, email addresses, message content, and provider response bodies.