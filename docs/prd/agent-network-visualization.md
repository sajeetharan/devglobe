# PRD: Agent Network Visualization

**Status:** MVP implementation
**Issue:** [#138](https://github.com/sajeetharan/devglobe/issues/138)
**Depends on:** [#135](https://github.com/sajeetharan/devglobe/issues/135), [PR #137](https://github.com/sajeetharan/devglobe/pull/137)
**Last updated:** 2026-08-31

## Summary

DevGlobe will make its consent-based developer-agent network visible through privacy-safe aggregate metrics, a clear connection lifecycle, agent-ready profile sharing, and a more expressive private request timeline.

The experience must explain network activity through the interface itself while keeping developer identities, request messages, projects, and private contact data protected.

## Problem

The MCP connection flow works, but visitors see little evidence of it and developers have no purpose-built artifact to share. The current inbox status label also does not communicate where a request is in the consent lifecycle.

This limits trust, discoverability, and adoption of DevGlobe's strongest differentiator.

## Goals

- Show that a real consent-based agent network exists and is active.
- Help developers understand the lifecycle at a glance.
- Give opted-in developers a shareable agent-ready identity.
- Preserve the existing consent boundary and public-data contract.
- Measure adoption without exposing small or identifiable cohorts.

## Non-goals

- Publishing agent messages, projects, request identities, or developer decisions.
- Publishing rankings based on agent usage or introduction volume.
- Exposing private contact information.
- Building public success stories without a separate consent model.
- Adding email or push notifications.

## Users

- **Visitor:** Sees aggregate network adoption and the consent lifecycle.
- **Developer:** Understands requests, shares an agent-ready profile, and remains in control.
- **Agent owner:** Understands that discovery and contact require developer approval.

## MVP Scope

### Agent Network sidebar view

Add an `Agents` tab beside Leaderboard and Activity. It contains:

- developers publicly open to verified agents
- accepted introductions
- pending requests
- represented countries
- self-declared AI tool distribution
- a visual lifecycle: `Discover → Request → Review → Connect`

Metrics are aggregate-only. Values below the privacy threshold are shown as unavailable rather than as exact numbers.

### Privacy projection

- The minimum reportable cohort is three.
- AI tool counts include only public AI profiles.
- Agent availability includes only public, claimed, opted-in profiles.
- Request aggregates never include agent names, developer names, messages, projects, or request identifiers.
- Country and tool breakdown entries below the threshold are removed.
- The API response documents when a value is suppressed.

### Developer profile

For public opted-in profiles:

- retain the `Open to verified agents` badge
- display self-declared tools and usage levels
- add `Share agent profile`
- generate share text containing only public profile data and the canonical DevGlobe profile URL

### Private request timeline

Each private request displays:

- `Requested`
- `Review` as the active pending stage
- terminal `Accepted`, `Declined`, or `Expired` state

Only the target developer can see request identity, owner, reason, and project.

## Data Sources

- `developers`: claimed status, public AI profile, public tools, location
- `agent-introductions`: aggregate status counts only

No new public event stream or identifiable analytics document is introduced.

## API Contract

`GET /api/agent-network` returns:

```json
{
  "privacyThreshold": 3,
  "metrics": {
    "openDevelopers": { "value": 12, "suppressed": false },
    "acceptedConnections": { "value": null, "suppressed": true },
    "pendingRequests": { "value": 4, "suppressed": false },
    "countries": { "value": 7, "suppressed": false }
  },
  "tools": [
    { "id": "github-copilot", "name": "GitHub Copilot", "count": 8 }
  ],
  "graph": {
    "nodes": [{ "id": "github-copilot", "name": "GitHub Copilot", "lat": 18, "lng": -148 }],
    "developers": [{ "login": "example", "name": "Example", "avatarUrl": "https://avatars.githubusercontent.com/...", "lat": 40, "lng": -74 }],
    "links": [{ "toolId": "github-copilot", "developerLogin": "example" }]
  }
}
```

The endpoint is public and cacheable. The graph contains only claimed developers whose AI profile is public and explicitly open to verified agents. It excludes usage levels, contact settings, introduction participants, messages, projects, and private contact data. Each tool cohort and its rendered links remain subject to the privacy threshold and per-tool display cap.

## Accessibility

- Sidebar tabs use tab semantics and selected state.
- Lifecycle stages have text labels and do not rely on color alone.
- Metric suppression has an accessible explanation.
- Sharing reports success or failure through a live region.
- Motion is disabled under `prefers-reduced-motion`.

## Acceptance Criteria

- An Agents sidebar tab renders on desktop and mobile.
- Aggregate API output suppresses all values and breakdowns below three.
- No public API field can identify a request participant.
- Public opted-in profiles can share an agent-ready profile message.
- The private inbox renders requested, review, and terminal stages.
- Existing acceptance behavior still reveals only the public GitHub URL.
- Unit tests cover suppression, tool projection, and lifecycle derivation.
- The application test suite and production build pass.

## Success Metrics

- public AI profiles configured
- developers opting into verified-agent requests
- agent profile share actions
- introduction requests created
- introduction acceptance rate

## Rollout

1. Ship aggregate API and sidebar view.
2. Ship profile share action and private request timeline.
3. Measure adoption and suppression behavior.
4. Consider explicitly consented public success stories as a separate feature.
