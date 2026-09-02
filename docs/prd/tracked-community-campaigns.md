# Tracked Community Campaigns

## Issue

GitHub issue #362: Growth: run tracked community campaigns.

## Problem

DevGlobe can create individual developer stories, but operators lack one reusable workflow for distributing consistent developer spotlights and country leaderboard stories across community channels. Discord and GitHub Discussions are also absent from the bounded attribution vocabulary, making cross-channel reporting incomplete.

## Goals

- Generate review-only campaign assets for LinkedIn, X, Reddit, Discord, and GitHub Discussions.
- Reuse canonical public developer stories for spotlights and country leaderboard promotion.
- Apply finite source, medium, campaign, and public-login content values to every URL.
- Report privacy-thresholded arrivals, profile opens, claims, and conversion by channel and campaign.

## Non-goals

- Automatic posting, scheduling, community authentication, or moderation bypass.
- Private contact enrichment or inferred demographic targeting.
- Free-form campaign identifiers or unbounded analytics dimensions.

## Experience

An operator runs `npm run community-campaign` with a claimed developer login and a supported campaign type. The command produces a JSON bundle for manual review. Each channel receives tailored text while linking to the same canonical public share page with channel-specific bounded attribution.

Supported campaigns:

- `developer_spotlight`
- `country_leaderboard`

Supported channels:

- `linkedin`
- `x`
- `reddit`
- `discord`
- `github_discussions`

## Privacy And Safety

- Only public profile and rank fields enter generated copy.
- Campaign generation requires a claimed profile.
- Output is manual-review-only and cannot publish content.
- Durable telemetry allowlists every campaign dimension.
- Reporting suppresses campaign cohorts with fewer than three arrival sessions.

## Measurement

- Attributed arrival sessions by source, channel, and campaign.
- Profile-open sessions and profile-open rate.
- Claim sessions and claim rate.
- A minimum 10% shared-link landing-to-profile conversion target after sufficient volume.

## Acceptance Criteria

- One command generates tailored assets for all five required channels.
- Developer spotlight and country leaderboard bundles use canonical share URLs.
- Discord and GitHub Discussions normalize as bounded community sources.
- Unknown sources and campaigns retain existing fallback behavior.
- The adoption workbook exposes campaign and channel performance with privacy suppression.
- Tests prove channel coverage, URL consistency, private-field exclusion, and country-rank validation.