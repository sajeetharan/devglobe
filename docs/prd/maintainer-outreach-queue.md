# Maintainer Outreach Review Queue

## Issue

GitHub issue #384: Growth: automate maintainer outreach review queue.

## Problem

DevGlobe can generate activation copy, but candidate selection, deduplication, review state, follow-up timing, and outcome reporting are manual. Repeating that work daily is costly and makes growth experiments inconsistent.

## Goals

- Select up to ten high-signal unclaimed public profiles each day.
- Create personalized campaign-attributed drafts without duplicating queued people.
- Require explicit operator approval and manual delivery.
- Prepare at most one follow-up, four days after a recorded send.
- Report selected, approved, contacted, profile-viewed, and claimed counts.

## Non-goals

- Sending email, direct messages, GitHub comments, or social posts.
- Discovering or storing private contact details.
- More than two outreach attempts per person.
- Bypassing platform anti-spam or moderation controls.

## Workflow

1. The daily timer calls the protected queue endpoint at 13:30 UTC.
2. The scheduler selects public, unclaimed profiles and creates pending drafts.
3. An operator lists drafts and records approval, rejection, and manual sends through the CLI.
4. A sent first attempt becomes eligible for one follow-up after four days.
5. The report command joins bounded campaign engagement into aggregate funnel counts.
6. A weekly timer emails the aggregate report to `GROWTH_REPORT_EMAIL`.

## Commands

```powershell
npm run setup-maintainer-outreach-container
npm run outreach:queue
npm run outreach:review -- list pending
npm run outreach:review -- approve octocat operator
npm run outreach:review -- sent octocat operator
npm run outreach:review -- report
```

## Acceptance Criteria

- Repeated daily runs do not duplicate pending or rejected profiles.
- Every generated link uses the bounded `manual_outreach` and `developer_activation` attribution.
- Sending requires an explicit out-of-band operator action; application code cannot deliver drafts.
- A profile receives no more than one follow-up draft.
- State transitions and aggregate reporting are covered by focused tests.