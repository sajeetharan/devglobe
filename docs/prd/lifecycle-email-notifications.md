# PRD: Lifecycle Email Notifications

**Status:** Implemented
**Issue:** [#151](https://github.com/sajeetharan/devglobe/issues/151)
**Owner:** DevGlobe
**Last updated:** 2026-08-14

## Summary

DevGlobe sends a single onboarding email when a developer first claims a profile and a single approval email when a self-nomination becomes public. Each email links directly to the developer profile and introduces the next useful product actions.

Resend provides delivery through its free tier and HTTP API. Email delivery is best-effort: claiming and approval remain successful when the recipient has no usable email, the provider is not configured, or the provider request fails.

## Problem

Claimed and newly approved developers receive no follow-up after the lifecycle action completes. They can miss profile controls, AI collaboration settings, rankings, activity, and the public URL they can share.

## Goals

- Confirm successful claims and nomination approvals outside the browser.
- Link recipients directly to their public developer profile.
- Introduce profile controls and AI collaboration features without a marketing sequence.
- Use email addresses transiently and never add them to developer documents.
- Keep core lifecycle writes independent from provider availability.

## Non-goals

- Marketing campaigns, newsletters, drip sequences, or bulk email.
- Persisting email addresses in Cosmos DB.
- Discovering a nomination email that is private on GitHub.
- Retrying failed delivery or building a durable email outbox in this phase.
- Email preference management beyond these transactional lifecycle messages.

## Users And Triggers

### First profile claim

After the developer document is successfully created or transitions from unclaimed to claimed, DevGlobe sends a welcome email to the verified primary address returned by the authenticated GitHub `user:email` scope. Repeated claims do not trigger another message.

The message confirms ownership and links to the profile, activity, rankings, and AI collaboration settings.

### First nomination approval

After the review command completes fresh GitHub enrichment and atomically transitions a pending nomination to approved, DevGlobe sends an approval email when the GitHub profile exposes a public email address. Refreshing an already approved profile does not trigger another message.

GitHub does not expose another user's private email to an administrative token. A nominee with no public profile email is therefore skipped until a future consent-based collection flow exists.

## Functional Requirements

- Use the Resend email API without adding an SDK dependency.
- Configure delivery with `RESEND_API_KEY` and `EMAIL_FROM`.
- Include both plain-text and escaped HTML bodies.
- Display the hosted DevGlobe logo with fixed email-safe dimensions.
- Use `/developer/{login}` as the primary call to action.
- Invite developer recipients to contribute code, ideas, or documentation on GitHub.
- Apply a deterministic provider idempotency key to each lifecycle event.
- Skip safely when the recipient or provider configuration is absent.
- Log delivery failures without logging addresses, API keys, or response bodies.
- Do not roll back or fail a successful claim or approval because email delivery failed.

## Privacy And Security

- Claim email is read from the signed GitHub OAuth session and used only for immediate delivery.
- Nomination email is read from the freshly fetched public GitHub profile and used only for immediate delivery.
- Developer records, public APIs, activity records, and logs do not contain recipient addresses.
- HTML interpolations are escaped and profile path segments are URL encoded.
- The Resend API key remains server-side.

## Templates

### Claim welcome

- Subject: `Your DevGlobe profile is claimed`
- Confirms that the profile is under the developer's control.
- Prompts exploration of activity, rankings, and AI collaboration preferences.
- CTA: `Explore your profile`

### Nomination approved

- Subject: `Your DevGlobe nomination was approved`
- Confirms that the profile is public.
- Prompts review, sharing, and claiming the profile for additional controls.
- CTA: `View your profile`

## Success Metrics

- Delivery attempts and provider success rate by lifecycle type.
- Profile visits from lifecycle email links.
- AI collaboration profile completion after a claim email.
- Claim conversion after a nomination approval email.

Provider logs supply initial delivery visibility. Product analytics and durable event telemetry are follow-up work.

## Acceptance Criteria

- A first successful claim attempts one welcome email when a verified OAuth email exists.
- Repeating a claim does not attempt another welcome email.
- A first successful nomination approval attempts one approval email when GitHub exposes a public email.
- Refresh and already-approved paths do not send approval emails.
- Missing recipient or provider settings skip delivery without failing the lifecycle action.
- Provider errors are sanitized and do not fail the lifecycle action.
- Templates include plain text, escaped HTML, and an encoded profile URL.
- Unit tests, the full test suite, and the production build pass.

## Rollout

1. Create a Resend account and verify the sending domain.
2. Configure `RESEND_API_KEY` and a verified `EMAIL_FROM` value in Vercel and the review-script environment.
3. Deploy and test with one controlled first claim and one controlled nomination approval.
4. Monitor Resend delivery logs and application errors.
5. Add durable notification events, retries, and preference controls only if delivery volume warrants them.