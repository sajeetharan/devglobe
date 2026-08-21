# Hacktoberfest 2026 Open Source Passport

## Status

- Owner: DevGlobe
- Target: September 2026 readiness, October 2026 campaign
- Tracking issue: [#248](https://github.com/sajeetharan/devglobe/issues/248)
- Related: [#126](https://github.com/sajeetharan/devglobe/issues/126), [#26](https://github.com/sajeetharan/devglobe/issues/26), [#31](https://github.com/sajeetharan/devglobe/issues/31), [#119](https://github.com/sajeetharan/devglobe/issues/119)

## Problem

Hacktoberfest brings developers who are actively looking for open-source work, but DevGlobe's contribution recommendations present only an evergreen discovery journey. A developer cannot isolate event-ready issues or tell whether a result is part of the campaign.

Maintainers also need contributors to choose well-scoped work and follow project guidance. A campaign that rewards raw pull-request volume would increase noise and conflict with DevGlobe's focus on verified, meaningful contributions.

## Product decision

Add an **Open Source Passport** mode to the existing Contribution opportunities experience. It reuses the current matching, eligibility, dismissal, caching, and rate-limit controls while requiring the GitHub issue label `hacktoberfest`.

The MVP is a trustworthy discovery mode, not a contribution ledger. Passport history, stamps, and rewards require a later verified GitHub contribution model.

## Goals

- Help claimed developers find fresh Hacktoberfest issues suited to their languages, interests, and chosen difficulty.
- Make event participation visible without replacing the repository's own contribution workflow.
- Send higher-intent visits to contribution-ready issues.
- Establish a reusable campaign dimension for future community contribution events.
- Favor quality and maintainer guidance over contribution volume.

## Non-goals

- Assigning, reserving, or claiming GitHub issues from DevGlobe.
- Counting self-reported pull requests or merged contributions.
- Awarding points based only on pull-request volume.
- Modifying the core DevGlobe developer score.
- Reproducing GitHub issue bodies, comments, or contributor identities.
- Determining whether a pull request qualifies under official event rules.

## Audience

### Contributor

A claimed DevGlobe developer who wants event-ready work matched to known skills without scanning unrelated repositories.

### Maintainer

An open-source maintainer who has explicitly labeled an issue for Hacktoberfest and published contribution guidance.

## MVP journey

1. A claimed developer opens Contribution opportunities.
2. The developer selects **Hacktoberfest 2026** in the campaign control and updates matches.
3. DevGlobe searches for open, unassigned, recently updated issues carrying both the selected difficulty label and `hacktoberfest`.
4. Existing repository and issue safety checks remove ineligible results.
5. Each result identifies the campaign and explains its skill match.
6. The developer opens the canonical GitHub issue and follows the repository's contribution guide.
7. The selected campaign persists with existing contribution preferences.

## Functional requirements

### Campaign preference

- Support the finite values `all` and `hacktoberfest-2026`.
- Default existing and new preference documents to `all`.
- Reject unknown campaign values at the API boundary.
- Include the campaign in the recommendation cache key.
- Return supported campaigns with existing preference options.

### Discovery and ranking

- Add `label:"hacktoberfest"` to GitHub issue search in campaign mode.
- Require the normalized `hacktoberfest` issue label again during local ranking.
- Preserve language, interest, difficulty, freshness, assignment, repository status, and contribution-guide checks.
- Preserve the eight-result limit and deterministic ordering.
- Do not loosen current per-user or global GitHub refresh budgets.

### Experience

- Present All opportunities and Hacktoberfest 2026 as a keyboard-accessible segmented choice.
- Use Open Source Passport identity and campaign-specific introductory, loading, and empty-state copy.
- Mark matching cards with a Hacktoberfest 2026 badge.
- Keep repository name, match reasons, dismissal, and the canonical GitHub action available.
- Maintain a single-column result layout on narrow viewports.

### Analytics

- Track campaign selection with the campaign key and contribution journey.
- Add the campaign key to issue-open events.
- Do not collect issue bodies, contributor identities, pull-request identities, or GitHub activity through these events.

## Eligibility and safety

Campaign issues must satisfy all existing contribution-readiness rules: public and active repository, open and unlocked issue, no assignee, recent update, meaningful title, and an exposed contribution guide. Known promotional or spam-like titles remain excluded.

The event label is a maintainer signal, not a DevGlobe quality guarantee. The interface must direct contributors to project guidance and must not imply that opening an issue, submitting a pull request, or receiving a merge guarantees official Hacktoberfest credit.

Before campaign launch, maintainers should confirm the published Hacktoberfest 2026 participation rules and update product copy if label or repository participation requirements differ.

## Data and privacy

The existing owner-scoped preference object stores only the campaign key alongside languages, interests, and difficulty. Cached results continue to contain bounded public issue summaries. The feature adds no contributor activity store and no new personal data.

## Success metrics

- Percentage of contribution-opportunity sessions selecting Hacktoberfest mode.
- Campaign result availability rate after eligibility checks.
- Campaign issue open-through rate.
- Return rate to Contribution opportunities during the campaign.
- Upstream-unavailable and empty-result rates by selected language and difficulty.

No success metric should reward raw pull-request volume.

## Rollout

1. Ship preference, query, ranking, and UI support behind the finite campaign value.
2. Validate keyboard navigation and responsive layout in authenticated staging.
3. Confirm official 2026 participation guidance before promoting the mode.
4. Curate DevGlobe's own `hacktoberfest` issues and contribution guidance.
5. Launch the campaign entry point, monitor GitHub quota and empty-result rates, and remove promotional emphasis after the event while retaining saved preferences safely.

## Test plan

- Preference normalization defaults to `all` and rejects unknown campaigns.
- Campaign ranking excludes otherwise eligible issues without `hacktoberfest`.
- GitHub search includes the campaign label only in campaign mode.
- Existing all-opportunities behavior remains unchanged.
- Cached recommendations vary by campaign preference.
- Selector, loading, empty, unavailable, and populated states work by keyboard and at mobile widths.
- Campaign selection and issue-open analytics contain no new personal identifiers.

## Follow-up phase

Verified passport stamps, shareable campaign cards, and aggregate globe activity may be considered after DevGlobe can verify GitHub identity, pull-request state, repository acceptance, and consent. Any recognition model must resist duplicate, spam, late, and low-quality activity and remain separate from the core developer score.