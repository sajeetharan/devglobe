# PRD: OSS Worth

**Status:** Proposed
**Issue:** [#185](https://github.com/sajeetharan/devglobe/issues/185)
**Priority:** P1
**Last updated:** 2026-08-17

## Summary

DevGlobe will add a playful, transparent OSS Worth measure derived from the public GitHub and Stack Overflow contribution metrics it already indexes. A developer profile will show separate GitHub Worth and Stack Overflow Worth cards, while the leaderboard will show the combined OSS Worth and allow sorting by it.

OSS Worth is denominated in fictional **OSS Credits (OSC)**. It is a celebration of visible open-source participation, not compensation, employability, skill, economic output, or a financial valuation.

The combined maximum is 1,000,000 OSC, allocated exactly as follows:

- GitHub: up to 600,000 OSC (60%).
- Stack Overflow: up to 400,000 OSC (40%).

Stack Overflow weight is never redistributed. A profile without linked Stack Overflow data receives zero Stack Overflow credits and clearly shows that the source is unavailable.

## Problem

DevGlobe exposes detailed contribution metrics and a relative 0-100 score, but users do not have a simple, shareable summary of their contribution footprint across both major sources. Existing public worth calculators provide engaging GitHub-only experiences. DevGlobe can provide a more complete version because it already combines GitHub creation signals with Stack Overflow knowledge-sharing signals.

The current DevGlobe score cannot be reused directly as worth because it is normalized against the current dataset. Its value can move when the indexed cohort changes, even if a developer's metrics do not. OSS Worth must be deterministic for the same inputs and formula version.

## Goals

- Produce a deterministic OSS Worth from existing public contribution metrics.
- Preserve an exact 60% GitHub and 40% Stack Overflow maximum allocation.
- Explain every input and contribution to the result.
- Show GitHub and Stack Overflow as two distinct, equally understandable surfaces.
- Show compact OSS Worth in the leaderboard and support sorting by it.
- Keep values stable as the DevGlobe dataset grows.
- Handle absent and partial source data honestly.
- Make the formula independently testable and versioned.

## Non-goals

- Estimating salary, consulting rates, employability, seniority, or commercial value.
- Replacing the existing DevGlobe score or changing existing rankings.
- Scraping private activity or data not already available through public APIs.
- Converting OSC to USD, NGN, BRL, or another real currency.
- Redistributing missing Stack Overflow allocation to GitHub.
- Comparing contribution quality, code correctness, or answer correctness.

## Product principles

1. **Celebratory, not evaluative.** Every surface labels OSC as fictional and avoids language such as net worth, market value, cheap, expensive, or hireable.
2. **Transparent.** Users can inspect source metrics, normalized values, weights, caps, and formula version.
3. **Stable.** Fixed reference caps replace dataset maxima. A result changes only when source metrics or the formula version changes.
4. **Source-aware.** Missing Stack Overflow data is unavailable, not zero participation and not a reason to inflate GitHub weight.
5. **Outlier-resistant.** Log normalization lets early contributions matter without allowing very large accounts to dominate the display.

## Formula v1

### Normalization

Every non-negative metric uses capped log normalization:

```text
normalize(value, cap) = min(log(1 + max(value, 0)) / log(1 + cap), 1)
```

Reference caps are product constants, not values calculated from the indexed dataset. Inputs above a cap remain visible in the breakdown but contribute the capped normalized value of 1.

### GitHub Worth

| Dimension | Source field | Within-platform weight | Reference cap |
|---|---|---:|---:|
| Repository stars | `totalStars` | 30% | 100,000 |
| Commit activity | `totalCommits` | 30% | 10,000 |
| Repository reach | `totalForks + totalWatchers` | 25% | 50,000 |
| Community reach | `followers` | 10% | 25,000 |
| Public projects | `publicRepos` | 5% | 100 |

```text
githubIndex =
  starsNormalized * 0.30 +
  commitsNormalized * 0.30 +
  repoReachNormalized * 0.25 +
  followersNormalized * 0.10 +
  publicReposNormalized * 0.05

githubCredits = round(githubIndex * 600000)
```

### Stack Overflow Worth

Accepted answers are estimated from the aggregate fields DevGlobe currently stores:

```text
acceptedAnswerEstimate = soAnswers * clamp(soAcceptRate, 0, 100) / 100
```

| Dimension | Source field | Within-platform weight | Reference cap |
|---|---|---:|---:|
| Knowledge reputation | `soReputation` | 55% | 100,000 |
| Accepted-answer engagement | `acceptedAnswerEstimate` | 35% | 1,000 |
| Community recognition | `soBadges` | 10% | 100 |

```text
stackoverflowIndex =
  reputationNormalized * 0.55 +
  acceptedAnswersNormalized * 0.35 +
  badgesNormalized * 0.10

stackoverflowCredits = hasStackOverflowData
  ? round(stackoverflowIndex * 400000)
  : 0
```

`hasStackOverflowData` is true when `soUserId` is present or at least one Stack Overflow metric is positive. A linked profile with all-zero public metrics is available with zero credits; an unlinked profile is unavailable with zero credits.

### Combined OSS Worth

```text
ossWorth = githubCredits + stackoverflowCredits
```

This construction guarantees a maximum allocation of 600,000 GitHub credits plus 400,000 Stack Overflow credits. No secondary weighting or redistribution is applied.

### Returned model

The pure calculator returns:

```json
{
  "formulaVersion": "oss-worth-v1",
  "totalCredits": 0,
  "github": {
    "available": true,
    "credits": 0,
    "maxCredits": 600000,
    "index": 0,
    "breakdown": []
  },
  "stackoverflow": {
    "available": false,
    "credits": 0,
    "maxCredits": 400000,
    "index": 0,
    "breakdown": []
  }
}
```

Each breakdown entry contains the source value, reference cap, normalized value, within-platform weight, and resulting credits. Internal calculations retain full precision; only displayed credits and final serialized credits are rounded.

## Data contract

No new external API calls are required. The v1 inputs already exist in developer documents:

- GitHub: `totalStars`, `totalCommits`, `totalForks`, `totalWatchers`, `followers`, `publicRepos`.
- Stack Overflow: `soUserId`, `soReputation`, `soAnswers`, `soAcceptRate`, `soBadges`.

The public developer list currently omits `totalWatchers` and `publicRepos`; its Cosmos projection must include them. The detail projection must include every formula input consistently. Search, cards, MCP, and persisted documents do not need new fields for MVP unless they display OSS Worth.

Worth should be computed through one shared pure module, proposed as `lib/oss-worth.js`. Callers may enrich a developer response with the returned model, but formula logic must not be duplicated in React components or API routes.

Persisting calculated credits is not required for MVP. If later needed for Cosmos sorting or querying, persist `ossWorth`, `githubWorth`, `stackoverflowWorth`, and `ossWorthFormulaVersion` together and refresh them whenever source metrics change.

## User experience

### Developer detail

Add an unframed **OSS Worth** section after the primary contribution statistics and before the existing score breakdown.

The section contains:

- A combined headline value such as `428K OSC` and a short fictional-credit disclaimer.
- A GitHub Worth card showing credits out of 600K, its 60% allocation, and the five source metrics.
- A Stack Overflow Worth card showing credits out of 400K, its 40% allocation, and the three source metrics.
- A compact “How this is calculated” disclosure with formula version and reference caps.

The two cards are siblings, never nested. On desktop they use a two-column grid; on narrow screens they stack. GitHub and Stack Overflow retain their recognizable platform accents without making the page a one-color theme.

When Stack Overflow is unavailable, its card remains visible in an unavailable state with `No linked Stack Overflow profile` and `0 / 400K OSC`. It must not imply poor performance.

### Leaderboard

- Add a compact badge such as `OSC 428K` to each row.
- Add `Worth` to the existing sort menu.
- Sort descending by `totalCredits`, with the existing score and login as deterministic tie-breakers.
- Preserve the row's fixed height and virtualized layout; the new badge must not shift action controls or truncate the developer name.
- The existing score remains visible and remains the default sort.

### Accessibility and formatting

- Screen-reader text expands OSC to “OSS Credits.”
- Values use the existing compact-number formatter; tooltips expose the full integer.
- Platform cards do not rely on color alone.
- The disclaimer is visible text, not tooltip-only content.
- Zero and unavailable are distinct labels.

## Integration plan

1. Add `lib/oss-worth.js` with constants, normalization, platform calculations, and combined calculation.
2. Add fixture-driven unit tests in `tests/oss-worth.test.js`.
3. Include `totalWatchers` and `publicRepos` in the developer list/detail projections.
4. Enrich developers once in the landing-page data pipeline; do not calculate repeatedly during renders or sorting.
5. Add the OSS Worth section and two platform cards to `DetailPanel`.
6. Add the compact value and Worth sort option to `Leaderboard`.
7. Add responsive styles using the existing design tokens.
8. Document the formula and fictional-value disclaimer in public methodology copy.

## Analytics

Track only aggregate interaction events:

- `oss_worth_detail_viewed`
- `oss_worth_breakdown_opened`
- `leaderboard_sorted_by_worth`

Do not include raw contribution metrics, calculated credit values, email, or private profile data in analytics payloads.

## Testing

### Unit tests

- All-zero inputs produce zero credits.
- Values at or above every cap produce exactly 600,000 GitHub credits and 400,000 Stack Overflow credits.
- Missing Stack Overflow data produces `available: false`, zero SO credits, and no redistribution.
- A linked all-zero Stack Overflow profile produces `available: true` and zero SO credits.
- Increasing any one metric while others remain fixed never decreases credits.
- Negative, missing, non-finite, and over-100 acceptance-rate inputs are safely clamped.
- Rounding occurs only at platform-credit output.
- Formula version is always returned.

### UI tests

- Both cards render with complete data.
- The unavailable Stack Overflow state renders without hiding the card.
- Compact and full values are formatted correctly.
- Worth sorting is descending with deterministic ties.
- Leaderboard rows retain stable dimensions at desktop and mobile widths.
- The detail section stacks without overflow on mobile.

### Regression checks

- Existing DevGlobe scores and ranks are unchanged.
- Profiles, search, globe markers, and leaderboard still load when optional metrics are absent.
- `npm test` and `npm run build` pass.

## Rollout

1. Ship the pure calculator and tests behind no UI dependency.
2. Add API projections and compare sampled outputs for low, median, and high-activity profiles.
3. Enable the detail section.
4. Enable leaderboard display and sorting after virtualized-row checks.
5. Monitor UI errors and sort usage; formula changes require a new version and release note.

## Success metrics

- Percentage of profile-detail visitors who open the calculation disclosure.
- Percentage of leaderboard sessions that sort by Worth.
- Share-card generation after viewing OSS Worth, if sharing is added later.
- No measurable regression in leaderboard rendering or initial data-load time.

## Risks and mitigations

- **Misread as financial value:** use OSS Credits, display the disclaimer, and prohibit currency conversion in v1.
- **Metric gaming:** cap and log-normalize inputs; describe the result as playful rather than authoritative.
- **Stale source data:** show the existing metrics freshness timestamp near the methodology.
- **Missing Stack Overflow profiles:** keep the 40% unavailable instead of silently reallocating it.
- **Formula drift:** export constants from one module and include `formulaVersion` in every result.
- **Large payloads:** return the full breakdown only on detail surfaces if list payload size becomes material; leaderboard needs only total credits.

## References

- [GitHub Worth Calculator](https://github.com/enigma-137/github-worth): playful GitHub-only scoring, transparent breakdown, fixed multiplier, sharing, and an explicit entertainment disclaimer.
- [CommitWorth](https://github.com/andreluizdasilvaa/CommitWorth): direct contribution rates, dashboard metrics, achievements, and generated cards.

The references inform product behavior only. DevGlobe will implement its own formula and code against its existing data model.
