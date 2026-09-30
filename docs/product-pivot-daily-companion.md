# Product pivot: Daily Companion

## Direction

DevGlobe is moving from an episodic developer directory toward a daily open-source companion. Search remains useful, but the recurring product promise becomes:

1. **Today:** choose one achievable contribution mission.
2. **Progress:** verify completed work and understand impact over time.
3. **Community:** see meaningful activity and collaborate around real work.

The globe remains the distinctive spatial interface. Today is the primary return loop; Find people and Live coding support it.

## First shipped slice

This branch uses existing production capabilities only:

- Rename the primary Mission mode to **Today**.
- Reframe the existing activity drawer as **Daily Companion**.
- Organize it into **Today**, **Progress**, and **Community**.
- Open Today once per UTC day for direct signed-in homepage visits.
- Never replace profile, country, setup, contribution, or other explicit deep links.
- Keep GitHub authentication contextual: signed-out users choose Today before authentication.

## Backlog

### Reuse existing work

- [#46](https://github.com/sajeetharan/devglobe/issues/46): meaningful streaks and achievements. Revise away from coding-presence vanity toward verified useful actions.
- [#126](https://github.com/sajeetharan/devglobe/issues/126): skill quests and recurring contribution challenges.
- [#165](https://github.com/sajeetharan/devglobe/issues/165): personalized developer radar and digest.
- [#210](https://github.com/sajeetharan/devglobe/issues/210): watched missions and meaningful-change briefings.

### New work

- [#457](https://github.com/sajeetharan/devglobe/issues/457): contribution rooms around active missions.
- [#458](https://github.com/sajeetharan/devglobe/issues/458): open-source office hours on the live globe.
- [#459](https://github.com/sajeetharan/devglobe/issues/459): verified contribution passport.
- [#460](https://github.com/sajeetharan/devglobe/issues/460): small accountability circles.

## Sequencing

### Phase 1: establish the habit

- Daily Companion UI and once-daily return behavior.
- Improve mission availability and accepted-to-completed conversion.
- Add useful empty states and reliable impact updates.

### Phase 2: make progress portable

- Contribution passport.
- Skill quests based on verifiable outcomes.
- Personalized radar and watched-mission briefings.

### Phase 3: add purposeful collaboration

- Contribution rooms.
- Office hours.
- Accountability circles.

## Metrics

North star: **weekly developers completing a meaningful contribution action**.

Supporting measures:

- D1 and D7 signed-in return rate.
- Today view to mission acceptance rate.
- Accepted mission to verified contribution rate.
- Progress view return rate after completion.
- Maintainer response rate and time.
- Four-week retained contributors.

## Guardrails

- Do not force authentication before demonstrating value.
- Do not rank people by streak length or missed days.
- Do not reward raw contribution volume without quality evidence.
- Do not infer private availability, intent, or relationships.
- Do not expose source code, filenames, or private contact information.
- Do not add social surfaces without blocking, reporting, expiry, and safe-exit controls.
