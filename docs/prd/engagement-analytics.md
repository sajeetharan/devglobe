# Engagement analytics and profile visibility

## Event contract

DevGlobe records intentional browser actions only. `profile_viewed`, `card_generated`, `profile_shared`, and `search_appearance` include the public target login needed to build owner insights. `comparison_started`, `recommendation_opened`, `next_action_selected`, and `session_restored` measure the broader engagement funnel. Optional properties are limited to `action`, `channel`, `journey`, and `source`, each capped at 40 characters.

Search text, email addresses, OAuth data, IP addresses, and raw browser session IDs are never stored. Search appearance events contain only the public logins displayed in the result set and the search mode.

## Counting and privacy

Browser Application Insights events use a bounded, in-memory startup queue (100 events) while runtime configuration and the SDK load. Once initialized, pending events are delivered in order and subsequent actions use the same client. Only allow-listed, sanitized analytics properties enter the queue; it is not persisted. Missing configuration or initialization failure clears and disables the queue. Localhost and automated browsers are excluded. Initialization, delivery, and queue-overflow failures emit console warnings without blocking product actions. The existing `/api/engagement` ingestion runs independently and is not replayed when the browser queue drains.

The server rejects missing and known automated user agents, social preview crawlers, and direct image requests. It issues a signed, HTTP-only browser-session cookie and rejects forged session identities; raw session IDs are HMACed before storage. Repeated events for the same session, event name, target profile, action qualifier, and 30-minute window produce the same Cosmos item ID and are idempotent. The minimum-volume threshold counts separately HMACed network cohorts, so deleting or rotating a browser cookie cannot reveal a low-volume metric.

Profile insights show 7, 30, and 90-day event counts with the immediately preceding period. A metric is suppressed unless at least three distinct hashed sessions contributed during that period. Only an authenticated GitHub owner whose matching profile is claimed can read the private panel.

An engaged session contains at least two distinct meaningful event types or a card generation followed by another meaningful action. Returning-user reporting compares a claimed user's first session in a 7 or 30-day period with an earlier session. Funnel reporting uses `card_generated` followed by a different meaningful event in the same hashed session.

## Mission funnel diagnostics

`mission_preview_requested` is followed by `mission_preview_shown`, `mission_preview_no_match`, or `mission_preview_failed` when a request finishes. `mission_action_requested` records `accept`, `pass`, or `complete`; failed requests emit `mission_action_failed`, while successful transitions retain `mission_accepted`, `mission_passed`, and `mission_completed`.

Failures carry only a finite `outcome`: invalid request, signed out, forbidden, missing profile, conflict, verification pending, rate limited, unavailable, generic request failure, network error, or invalid response. No username, issue ID, request body, URL, or raw error message is included in diagnostic events. Durable ingestion bounds outcomes/actions and deduplicates separately by action and failure outcome. Compare users progressing through each stage rather than interpreting deduplicated event counts as all request attempts.

This distinguishes matching/API failures from abandonment after a successful offer. Browser closure or analytics blocking can still interrupt event delivery. Completion continues to require GitHub verification of a linked PR by the mission owner, merged after acceptance; diagnostics do not loosen matching, authentication, claims, or verification rules.

## Retention and deletion

Raw allow-listed events have item-level Cosmos TTL and expire after 180 days, which supports current and prior 90-day comparisons. Aggregate responses are computed on demand and are not persisted. Session hashes cannot be reversed without the server secret and rotate when that secret changes.

When a profile is removed, its event partition should be deleted as part of the same administrative removal workflow. Until that workflow runs, TTL remains the deletion backstop. Rotating `ENGAGEMENT_HASH_SECRET` prevents future sessions from being linked to earlier hashes.