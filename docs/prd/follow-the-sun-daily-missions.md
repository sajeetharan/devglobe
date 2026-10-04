# Follow the Sun: Daily Open-Source Missions

## Status

- Owner: DevGlobe
- Phase: Small MVP
- Surface: Activity feed
- Working title: Follow the Sun

## Problem

An activity feed can explain what happened, but it does not give a developer a reason to act today or return tomorrow. Open-source discovery also asks users to evaluate too many issues before they can contribute.

DevGlobe needs a small, repeatable daily loop that turns known skills into one bounded action without claiming to reserve GitHub work or judge contribution quality.

## Product decision

Add **Today’s Mission** above the existing activity feed. Each UTC day, a claimed developer without an unfinished accepted mission receives one contribution-ready GitHub issue matched with the existing language, interest, difficulty, safety, and contribution-guide rules. Duration is a suggested scope, not a completion-time promise.

The developer can accept, pass, open, and verify completion of the mission. Completion requires a merged pull request authored by the signed-in GitHub login, linked from the mission issue, and merged after mission acceptance.

## Goals

- Reduce contribution discovery to one clear daily choice.
- Create a receive, act, resolve, return loop inside the existing activity surface.
- Measure mission views, acceptance, passes, completion, and seven-day return behavior.
- Reuse current recommendation eligibility, quota, authentication, and privacy controls.
- Establish a persisted mission object that a future timezone relay can build on.

## Non-goals

- Reserving or assigning GitHub issues.
- Judging contribution quality beyond GitHub's merged state.
- Changing the DevGlobe score or awarding contribution points.
- Direct developer-to-developer handoff in the MVP.
- Drawing relay arcs on the globe in the MVP.
- Sending daily email or push notifications.
- Supporting pull-request review or technical Q&A sources before those sources have their own trusted eligibility rules.

## Audience

The MVP serves signed-in developers who have claimed a DevGlobe profile. Profile languages and saved contribution preferences provide the matching inputs.

Signed-out visitors see a GitHub sign-in action. Signed-in developers without a claimed profile are directed to the existing profile claim flow.

## MVP journey

1. The developer opens the Activity view.
2. DevGlobe returns an unfinished accepted mission even across UTC days, otherwise the current-day mission or a new offer from a bounded recommendation pool.
3. The mission shows a 15-minute scope, repository, match reasons, and canonical GitHub issue link.
4. The developer chooses **Accept** or **Pass**.
5. Pass selects the next item from the already-fetched daily pool and does not consume another GitHub request.
6. After accepting, the developer can record self-reported guide/work checkpoints, save a finite blocker reason, check for a submitted PR, and choose **Verify completion**.
7. DevGlobe checks public GitHub issue timeline and pull-request data. An issue being closed alone is not completion evidence.
8. The completed state and merged pull-request link remain visible for the rest of the UTC day. Verified completions are also retained in a bounded mission history with links to the issue and merged pull request. A new mission can be assigned the following day.

## Functional requirements

### Assignment

- Assign at most one active mission per claimed developer per UTC day.
- Reuse existing contribution preferences and profile-language fallback.
- Reuse contribution-ready issue filtering and deterministic ranking.
- Prefer an existing recommendation cache before requesting GitHub candidates.
- Store no more than eight public issue summaries in the daily pool.
- Exclude issues passed earlier on the same UTC day.
- Return an explicit empty state when the bounded pool is exhausted.

### Mission categories

The MVP derives a concise action from public title and label metadata:

- Documentation or README: **Improve documentation**.
- Test or coverage: **Strengthen a test**.
- Bug, defect, or reproduction: **Reproduce a bug**.
- Other eligible beginner work: **Investigate a good first issue**.

Pull-request review and technical-question missions remain future source integrations.

### Lifecycle

- `offered -> accepted`
- `offered -> passed`
- `accepted -> completed`
- `accepted -> passed`

Completed, passed, stale offered, and invalid transitions are rejected. Accepted missions remain active across days until completed or passed. A client cannot complete a mission before accepting it, and the server cannot complete it without current GitHub evidence.

### Contribution passport

- Public mission previews and Hacktoberfest result cards offer **Save this contribution**. One versioned, bounded public summary is retained locally for up to 30 days; a different save requires explicit replacement confirmation. Invalid/expired saves show a removable error, and storage failures are visible.
- Homepage and matcher show a persistent **Continue your contribution** card. Guest guide/work checkpoints are explicitly self-reported and earn no verified credit. Guest saves do not create profiles, reserve issues, or synchronize across browsers.
- GitHub sign-in returns to the Today destination. After existing authentication and claim checks, the saved URL is re-fetched from GitHub under the existing global quota and contribution-readiness rules. Browser titles, checklists and snapshots cannot establish eligibility or verified proof. Existing accepted missions are never replaced by a saved issue.
- Accepting the restored offer transfers only boolean guide/work checkpoints to the owner-scoped profile state. After the server accepts, the corresponding local copy is removed; failed requests retain it.
- The accepted card is titled **Continue your contribution**, with guide-read and work-started checkpoints, finite blocker choices (`setup`, `instructions`, `issue_taken`, `too_large`), GitHub-verified PR submission, and verified merged completion.
- Submission checking scans public issue cross-references (bounded timeline pagination), verifies the actual PR author and creation after acceptance, and requires an open non-draft PR. Closed-unmerged PRs show a distinct status; merged PRs still require the explicit completion action to award the existing completed milestone.
- PR status is shown with its verification time and a manual refresh; it is not live monitoring. Waiting for maintainer review is not contributor failure.
- A **First verified mission completed** passport badge appears only with server-recorded merged-PR evidence in current mission/history. No points, leaderboard, event credit, developer-score changes, or self-reported completion badges are introduced.

### Optional calendar reminders

Guests and accepted contributors without an open submitted PR can choose tomorrow, next Saturday at 9 AM, or a custom local time and download an `.ics` calendar event. Default is **No reminder**. Times are encoded as UTC; fields are escaped and lines folded to calendar format limits. The event includes the canonical issue and Today return link.

Downloading is not subscribing. The user must import the file into their calendar; that calendar controls delivery, snooze and cancellation. DevGlobe sends no emails or push notifications, cannot remove an imported event after completion, and reminds users to recheck issue availability. The download control is hidden while a verified PR awaits review; existing calendar events must be edited or removed by the user.

### Experience

- Place Today’s Mission before activity-source tabs without hiding feed controls.
- Keep every action keyboard accessible with a minimum 44px target.
- Show loading, signed-out, claim-required, unavailable, exhausted, offered, accepted, completed, and mutation-error states.
- Open only the canonical GitHub URL in a new tab.
- Do not imply that accepting reserves an issue or that a closed issue proves the developer completed it.
- Show a retryable error when GitHub verification is unavailable and actionable feedback when no qualifying merged pull request exists.

## API contract

### `GET /api/daily-mission`

Requires a signed-in claimed profile. Returns `{ mission }`, where `mission` is `null` when no eligible daily match remains. Temporary source or quota pressure returns `{ mission: null, unavailable: true, retryAfterSeconds? }`.

The response is private and non-cacheable.

### `POST /api/daily-mission`

Requires same-origin JSON and a signed-in claimed profile. Body: `{ action: "accept" | "pass" | "complete" | "read_guide" | "started" | "blocked" | "verify_progress", missionId: "<displayed mission id>", blocker?, localProgress? }`. Blockers use only the finite values above; acceptance imports only boolean local checkpoints. The mission ID binds the action to the displayed mission. Verified writes also bind evidence to its acceptance timestamp, preventing optimistic-concurrency retries from applying proof to another acceptance. Verification returns `422` when evidence is absent and `503` when unavailable. Passing a previous-day mission does not rotate through stale previous-day recommendations.

GET optionally accepts `savedIssueUrl`, restricted to canonical public GitHub issues. It restores an eligible saved issue as **offered**, never automatically accepted, and reports `restoredSaved` / `savedRestoreAttempted`. It returns `422` if the saved issue no longer meets readiness checks. The user can remove the save to resume ordinary matching.

## Data model

Mission state lives in the claimed developer’s existing `contributionOpportunity` object:

- `dailyMission`: UTC day, issue ID, category, duration, status, timestamps, bounded public opportunity summary, self-reported `progress.guideReadAt` / `startedAt` / finite `blocker`, GitHub-verified `progress.submittedEvidence`, and bounded merged pull-request evidence after completion verification.
- `dailyMissionPool`: UTC day and up to eight ranked public opportunity summaries.
- `dailyMissionHistory`: UTC day and up to eight passed issue IDs.

The assignment ID is deterministic: `<login>:<UTC-day>:<issue-id>`. Updates use the existing developer document’s optimistic concurrency token.

Completion evidence stores only the public pull-request URL, number, merged timestamp, evidence type, and verification timestamp. No issue body, comment, email, OAuth credential, private repository detail, or raw browser identity is stored.

## Analytics and success metrics

Durable allow-listed events:

- `mission_viewed`
- `mission_accepted`
- `mission_passed`
- `mission_completed`
- `mission_unavailable`
- `mission_exhausted`
- `mission_saved`
- `mission_resumed`
- `mission_progress_updated`
- `mission_blocked`
- `mission_pr_submitted`
- `mission_reminder_downloaded`

Authenticated events use `daily_mission`; local saves and reminder downloads use `contribution_passport`. Progress, blocker and reminder actions are finite categories; exact reminder times, issue IDs, titles, repository names, developer logins and free-text notes are excluded from event properties. Submission telemetry records the first observed transition, not every refresh.

Primary metrics:

- Acceptance rate: unique mission accept sessions / unique mission view sessions.
- Completion rate: unique mission complete sessions / unique mission accept sessions.
- Pass rate: unique mission pass sessions / unique mission view sessions.
- Seven-day returning-user rate: pseudonymous sessions with a `mission_viewed` event on at least two distinct UTC days within a rolling seven-day window / sessions with an initial mission view in that cohort.
- Availability rate and exhausted-pool rate.

Raw engagement events retain the existing 180-day TTL and privacy hashing. Product reporting must use aggregate cohorts and existing suppression thresholds.
The engagement domain exposes a rolling mission-funnel aggregator for acceptance, pass, completion, and distinct-day seven-day return reporting.

## Reliability and safety

- Preserve the global GitHub recommendation refresh budget.
- A pass must rotate within the daily pool without another external request.
- Maintain existing checks for public active repositories, open unlocked unassigned issues, freshness, meaningful titles, contribution guidance, and known promotional spam.
- Treat issue labels and titles as untrusted public text and render them as text only.
- Repository contribution guidance remains authoritative.
- Use the server GitHub token for public timeline and pull-request reads; do not depend on or store a user OAuth token.
- A closed issue, another author's pull request, an unmerged pull request, or work merged before acceptance must not complete a mission.
- Treat GitHub authorization, rate-limit, and upstream failures as unavailable verification without changing mission state.

## Rollout

1. Release to the Activity view for claimed developers.
2. Monitor assignment availability, API errors, passes, and pool exhaustion.
3. Compare seven-day return cohorts with activity viewers who do not receive a mission.
4. Adjust category copy and matching inputs without weakening eligibility checks.
5. Evaluate notifications only after the daily loop demonstrates repeat use.

## Test plan

- One mission is selected for the UTC day with a deterministic ID and 15-minute duration.
- Passed issue IDs are excluded from subsequent selection.
- Accept and complete follow the legal lifecycle; complete-before-accept and stale-day actions fail.
- Completion accepts only an issue-linked pull request authored by the signed-in login and merged after acceptance.
- Closed issues, other authors, old or unmerged pull requests, malformed issue URLs, and GitHub failures do not complete a mission.
- Signed-out and unclaimed users cannot read or mutate missions.
- Cross-origin and non-JSON mutations fail.
- Cached recommendation pools avoid new GitHub requests.
- Mission analytics reject arbitrary issue or identity properties.
- Activity feed behavior remains unchanged below the mission module.
- Desktop and narrow sidebar layouts keep labels and actions visible without horizontal overflow.

## Follow-up: global relay

After the daily loop is validated, add explicit handoff:

1. An accepted mission can be offered for handoff with a short, structured progress note.
2. DevGlobe identifies opted-in developers whose workday is beginning and whose profile skills match the mission.
3. The recipient explicitly accepts; no assignment happens automatically.
4. The globe renders consented, coarse city-to-city or country-to-country relay arcs without exposing precise location.
5. A journey records offered, accepted, handed off, resumed, and completed timestamps.

Relay work requires abuse controls, notification consent, timezone preferences, expiration, duplicate handoff protection, repository eligibility review, and moderation. It should ship only after the single-user mission loop demonstrates retention and useful completion behavior.