# PRD: Personalized Return Experience

**Status:** MVP implementation
**Issue:** [#360](https://github.com/sajeetharan/devglobe/issues/360)
**Priority:** P0
**Depends on:** [#111](https://github.com/sajeetharan/devglobe/issues/111), [#113](https://github.com/sajeetharan/devglobe/issues/113), [#127](https://github.com/sajeetharan/devglobe/issues/127), [#165](https://github.com/sajeetharan/devglobe/issues/165)
**Last updated:** 2026-09-02

## Summary

DevGlobe will give signed-in, claimed developers a compact return briefing on the home page. The briefing combines meaningful updates from explicitly followed developers with direct paths to contribution recommendations, personal impact history, and weekly impact preferences. It turns existing retention capabilities into one understandable reason to return without adding another feed or notification system.

## Problem

DevGlobe already stores developer follows, builds a personalized activity feed, captures impact history, recommends contribution opportunities, and sends opt-in weekly impact email. These capabilities live in separate panels and menus, so a returning developer cannot quickly answer “what changed, and what should I do next?” Overall traffic has declined while profile exploration has increased, making repeat utility more important than adding another broad discovery feature.

## Goals

- Show a claimed developer whether followed-developer updates are waiting.
- Preview the most recent meaningful update using the existing personalized feed.
- Provide direct actions for reviewing updates, finding a contribution, and opening personal impact history.
- Explain the weekly impact return loop without changing email consent or verification rules.
- Measure briefing views and selected actions with bounded, privacy-safe telemetry.
- Improve seven-day retention from 7.7% toward the issue target of 15%.

## Non-goals

- A new recommendation algorithm, ranking formula, follow model, or notification pipeline.
- Public follower counts, inferred interests, or personalized content for signed-out visitors.
- Exposing watchlists, email addresses, raw activity payloads, or opaque browser identifiers.
- Automatically enabling weekly email or changing existing consent preferences.
- Replacing the activity drawer, impact history, or contribution opportunity surfaces.

## User experience

- The briefing appears only after a signed-in developer's profile is confirmed as claimed.
- It requests at most three personalized feed items and presents the newest item as a concise preview.
- The unread count is descriptive, not a notification badge that implies real-time delivery.
- **Review updates** expands the briefing to show up to three personalized feed items and marks those items read.
- **Find a contribution** opens the existing contribution recommendations.
- **View my impact** opens the developer's own profile and impact history.
- **Weekly updates** opens the existing profile menu where email verification and weekly impact consent are managed.
- If the feed is empty, the briefing explains that following developers creates personalized updates and still offers the contribution and impact actions.
- If feed data is temporarily unavailable, the briefing keeps the durable actions available and does not expose an error stack or retry loop.

## Data and privacy

The briefing reads `GET /api/feed?limit=3`, which is authenticated, private, and already filters events through explicit follows and claimed-profile visibility. It receives only normalized public summaries. The component does not persist feed data or request contact information.

Telemetry uses existing engagement ingestion with bounded values only:

- `return_briefing_viewed` with `journey=personalized_return`
- `return_briefing_action_selected` with an action from `review_updates`, `find_contribution`, `view_impact`, or `weekly_updates`

No login, event summary, project name, URL, email state, or watchlist content is attached to these events.

## Success metrics

- Seven-day retention for claimed developers, with a target of 15%.
- Percentage of eligible sessions that see the return briefing.
- Briefing-to-action conversion by bounded action.
- Personalized-feed opens and contribution-opportunity opens from the briefing.
- Weekly impact return sessions, measured by the existing `weekly_digest_returned` event.

Metrics are directional until four complete post-launch weeks are available. Cohorts below the existing privacy threshold remain suppressed in reporting.

## Acceptance criteria

- Claimed signed-in developers see a compact return briefing on the home page.
- The briefing shows an unread count and newest personalized update when feed data exists.
- Empty and unavailable feed states remain useful and do not block the page.
- Actions reuse the existing activity, contribution, and own-profile experiences.
- Briefing telemetry contains only bounded journey and action values.
- Signed-out and unclaimed visitors do not see the personalized briefing.
- Existing email verification and weekly digest consent behavior is unchanged.
- Focused tests, the full test suite, and the production build pass.