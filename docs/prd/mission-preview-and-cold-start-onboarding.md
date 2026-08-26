# Mission Preview and Cold-Start Onboarding

## Status

- Owner: DevGlobe
- Phase: MVP
- Tracking issue: #288
- Surfaces: Home discovery, Activity / Today’s Mission, contribution preferences

## Problem

Today’s Mission removes choice paralysis after a developer signs in and claims a profile, but new visitors cannot experience that value before authentication. Developers with sparse GitHub profiles also provide weak language signals, making the first match less personal and reducing trust in the recommendation.

DevGlobe needs a low-friction preview that demonstrates one safe, relevant mission before sign-in and a short onboarding flow that captures better matching signals without turning setup into a form-heavy prerequisite.

## Product decision

Add a public, read-only **Preview your mission** flow that accepts a valid public GitHub login and returns one contribution-ready issue using the existing eligibility and ranking pipeline. The preview explains why the issue matched and directs the visitor to sign in and claim their profile before it can become an accepted daily mission.

For authenticated claimed developers, collect three matching inputs: preferred languages, contribution type, and available time. Persist them in the existing contribution preferences and use them for both contribution recommendations and daily missions.

## Goals

- Demonstrate Today’s Mission value before authentication.
- Improve first-match relevance for sparse developer profiles.
- Convert preview users into signed-in, claimed developers.
- Preserve the existing contribution safety, privacy, and GitHub quota controls.
- Explain matching inputs without claiming certainty about effort or issue quality.

## Non-goals

- Reserving, assigning, or accepting an issue for a signed-out visitor.
- Reading or storing a visitor’s starred repositories, OAuth data, email, or private activity.
- Guaranteeing that an issue can be completed within the selected time.
- Fetching arbitrary GitHub profiles that are not already public in DevGlobe for the MVP.
- Replacing the existing contribution-opportunities modal.
- Adding AI-generated issue summaries or estimates.

## Audience

The primary audience is a developer who is curious about open source but has not yet signed in to DevGlobe. The secondary audience is a claimed developer whose profile has few supported language signals or who wants to tune future missions.

## MVP journeys

### Public mission preview

1. A visitor sees **Preview your mission** in the primary discovery surface.
2. The visitor enters a GitHub username and submits.
3. DevGlobe validates the login and looks up the existing public DevGlobe profile.
4. DevGlobe derives supported profile languages and applies safe beginner defaults when none exist.
5. DevGlobe returns one contribution-ready issue, repository, coarse time fit, and up to three match reasons.
6. The visitor can open the public issue or choose **Sign in to accept missions**.
7. The preview does not create mission state, reserve the issue, or survive as an accepted mission.

### Cold-start onboarding

1. A signed-in claimed developer opens Today’s Mission or contribution preferences.
2. When saved onboarding preferences are absent, DevGlobe presents three compact inputs:
   - preferred languages, up to five;
   - contribution types: documentation, bug fixes, testing, features, developer tooling, or accessibility;
   - available time: 15, 30, or 60 minutes.
3. Profile languages are preselected when supported; beginner difficulty remains the default.
4. The developer can update matches with one action.
5. DevGlobe persists the preferences and refreshes future recommendation and mission pools.

## Matching rules

### Cold-start fallback

Use matching inputs in this order:

1. Explicit saved languages and contribution types.
2. Supported languages detected on the public DevGlobe profile.
3. Safe defaults: no language restriction, beginner difficulty, no contribution-type restriction, and 30 available minutes.

No random issue selection is used. Ordering remains deterministic by match score, freshness, and issue ID.

### Time fit

GitHub does not provide trustworthy effort estimates. DevGlobe derives a coarse `estimatedMinutes` value from public labels and title terms:

- documentation, README, typo, or reproduction work: 15 minutes;
- tests, bug fixes, accessibility, or developer tooling: 30 minutes;
- feature or enhancement work: 60 minutes;
- other eligible beginner work: 30 minutes.

Available time filters out candidates whose coarse estimate exceeds the selected budget. The UI labels this value **Suggested scope**, not an estimate or guarantee, and states that actual effort depends on repository context and maintainer feedback.

### Existing eligibility

Every preview and authenticated recommendation must retain the existing requirements: public active repository, open unlocked unassigned issue, recent activity, meaningful non-promotional title, matching difficulty label, and a visible contribution guide.

## Experience requirements

- Place the preview near the existing developer search without replacing the globe or creating a marketing landing page.
- Use a GitHub username input, one clear preview command, and a single result; do not show a result grid.
- Keep the username visible when validation or availability errors occur.
- Show loading, invalid-login, profile-not-found, unavailable, no-match, and result states.
- Explain each result with public, human-readable reasons.
- State that opening or previewing an issue does not reserve it.
- Use native inputs and buttons, visible labels, keyboard focus, and minimum 44px action targets.
- Keep the flow usable at 390px without horizontal overflow.
- Do not display an empty onboarding history or preferences panel solely to advertise the feature.

## API contracts

### `POST /api/mission-preview`

Public, same-origin JSON endpoint.

Request:

```json
{
  "login": "octocat"
}
```

Success:

```json
{
  "profile": {
    "login": "octocat",
    "name": "The Octocat",
    "avatarUrl": "https://..."
  },
  "mission": {
    "type": "Improve documentation",
    "durationMinutes": 15,
    "opportunity": {
      "id": "123",
      "title": "Improve setup instructions",
      "url": "https://github.com/owner/repo/issues/123",
      "repository": "owner/repo",
      "language": "JavaScript",
      "reasons": ["Uses JavaScript", "Beginner friendly"]
    }
  }
}
```

The endpoint returns `400` for invalid login syntax, `404` for an unavailable public DevGlobe profile, `429` for preview quota pressure, and `503` when GitHub matching is unavailable. Responses are non-cacheable and never include private or claimed-profile fields.

The endpoint permits no mutation and stores no per-visitor recommendation. It shares the existing global GitHub refresh budget and adds a bounded, hashed-client preview allowance. Raw IP addresses are never stored or logged by application code.

### `PUT /api/contribution-opportunities`

Extend the existing same-origin authenticated contract:

```json
{
  "preferences": {
    "languages": ["javascript"],
    "interests": ["documentation"],
    "difficulty": "beginner",
    "campaign": "all",
    "availableMinutes": 30
  }
}
```

Only `15`, `30`, and `60` are valid time values.

## Data model

No new container is required.

The claimed developer’s existing `contributionOpportunity.preferences` object gains:

- `availableMinutes`: integer enum `15 | 30 | 60`, default `30`.

Existing `languages`, `interests`, `difficulty`, and `campaign` fields remain unchanged. The field is embedded because it is read and written with the existing preference object. Existing documents require no migration; normalization supplies the default until the next write.

Public preview throttling uses the existing contribution-opportunity state container with a one-way hash of a bounded client identifier and a short TTL. It must not create developer-document writes or cross-partition scans. State updates use point-addressable IDs and atomic/optimistic concurrency consistent with the existing global refresh budget.

## Analytics and success metrics

Add allow-listed durable events:

- `mission_preview_requested`
- `mission_preview_shown`
- `mission_preview_signin_selected`
- `mission_onboarding_completed`

All use journey `mission_preview` or `daily_mission`. Do not include login, issue ID, title, repository, language, or raw preference values in analytics properties.

Primary metrics:

- Preview success rate: shown / requested.
- Preview-to-sign-in intent: sign-in selected / shown.
- Onboarding completion rate: completed / claimed developers shown onboarding.
- First mission acceptance after onboarding compared with profile-only matching.
- Preview availability and no-match rates.

## Reliability, privacy, and abuse controls

- Validate GitHub logins before any data access.
- Query only the fields needed for the public profile projection.
- Reuse the singleton Cosmos client and parameterized queries already provided by the repository.
- Prefer cached GitHub candidate data and preserve the shared refresh budget.
- Bound preview requests per hashed client and return `Retry-After` on `429`.
- Never persist raw IP addresses, previewed issue IDs by visitor, or public-form input beyond request processing.
- Render GitHub titles, labels, and repository names as untrusted text.
- Do not expose whether a profile is claimed, authenticated, or configured with private preferences.
- Fail closed when repository verification or GitHub search is unavailable.

## Rollout

1. Ship behind the existing home experience without changing the default sidebar view.
2. Monitor preview availability, GitHub quota usage, and preview-to-sign-in intent.
3. Compare first mission acceptance for explicit onboarding versus profile-only fallback.
4. Tune coarse time categories only from aggregate completion and pass behavior.
5. Consider starred repositories only as an explicit, separately consented future input.

## Test plan

- Valid and invalid GitHub login syntax.
- Public profile projection excludes claimed and private preference fields.
- Missing DevGlobe profile returns `404` without an external GitHub profile lookup.
- Sparse profiles use beginner, unrestricted-language, 30-minute defaults.
- Supported profile languages are normalized and used when explicit preferences are absent.
- Time fit includes candidates at or below the selected budget and excludes larger coarse scopes.
- Ranking remains deterministic and retains all existing safety filters.
- Preview does not mutate developer or mission state.
- Preview quota and global GitHub budget return bounded retry responses.
- Preference normalization accepts only 15, 30, and 60 minutes and defaults legacy documents to 30.
- Saving preferences invalidates or bypasses incompatible cached recommendations.
- Analytics reject login and issue metadata.
- Keyboard, focus, loading, error, desktop, and 390px layout behavior pass browser checks.

## Open questions after MVP

- Should an authenticated preview be transferable into the next daily mission when it remains eligible?
- Should maintainers be able to mark an issue’s suggested scope directly?
- Can aggregate completion evidence improve scope categories without presenting false precision?
- Should repository familiarity use public contribution history before considering explicitly consented starred repositories?
