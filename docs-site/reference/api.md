---
title: Public API
description: Public DevGlobe HTTP endpoints, request examples, and privacy guarantees.
---

# Public API

The canonical OpenAPI 3.1 description is [www.devglobe.dev/openapi.json](https://www.devglobe.dev/openapi.json). The API is read-oriented; use the MCP server when your client benefits from structured agent tools.

## Search

```http
GET https://www.devglobe.dev/api/search?q=typescript%20azure&mode=text&limit=10
```

Modes are `text`, `vector`, and `hybrid`. Vector and hybrid availability depends on the production embedding configuration. Keep result limits bounded and URL-encode the query.

## Developer profile

```http
GET https://www.devglobe.dev/api/developer?id=torvalds
```

The response contains indexed public profile and contribution fields. Optional source fields can be absent; clients must distinguish missing data from zero.

## Badges

```http
GET https://www.devglobe.dev/api/badge/torvalds.svg
GET https://www.devglobe.dev/api/badge/torvalds.png?stat=score
```

A cached, embeddable badge for READMEs and personal sites. Wrap it in a link to the profile so viewers can click through:

```md
[![devglobe](https://www.devglobe.dev/api/badge/torvalds.svg)](https://www.devglobe.dev/share/torvalds)
```

**Format** — append `.svg` (default, vector) or `.png` (rasterized at 2x for retina embeds) to the login.

**`stat` query param** — one of `globalRank` (default), `countryRank`, `cityRank`, `score`, `stars`, `language`. Unknown stats or logins return a `400` "invalid" badge rather than an error page, so a bad embed still renders an image.

**Claimed vs. unclaimed** — the badge only ever renders public ranking metadata (see the [privacy boundary](#privacy-boundary) below); it never asserts that the person shown is the one who requested the badge. Profiles the developer has verified through [claiming](../guide/features#identity-cards-and-badges) render in the full brand-blue style. Unclaimed profiles render in a muted slate with a hollow-circle (`○`) mark appended to the value and in the image's `alt`/`title` text, so an embedder or viewer can tell at a glance that the data hasn't been confirmed by the person it names. This is deliberate: link and claim semantics stay visually explicit so a badge can't be used to imply an endorsement or identity that wasn't verified.

**Cache policy and invalidation** — badge responses are `Cache-Control: public, max-age=0, s-maxage=3600, stale-while-revalidate=86400`. The CDN edge serves a cached copy for up to an hour before revalidating against the origin, and keeps serving a stale copy for up to a day if the origin is slow or briefly unavailable, so an embedded badge in a README never shows as a broken image. There is no push-based invalidation — a stat change is reflected on the next edge revalidation, at most ~1 hour later. Error and invalid-input responses are sent with `Cache-Control: no-store` so they never get stuck cached.

**Abuse controls** — the login path is validated against GitHub's username pattern before any lookup, so malformed input can't reach the data layer. The endpoint also applies a soft per-client rate limit at the origin as a secondary guard behind the CDN cache (which absorbs the overwhelming majority of embed/hotlink traffic); clients that exceed it get a `429` with `Retry-After`.

## MCP

```http
POST https://www.devglobe.dev/mcp
Content-Type: application/json
Accept: application/json, text/event-stream
```

Use an MCP SDK rather than constructing protocol payloads by hand. See the [MCP guide](../agents/mcp).

## Errors and rate limits

- Validate HTTP status before decoding a success shape.
- Treat `404` as an unknown or unindexed profile.
- Back off on `429` and do not fan out profile requests unnecessarily.
- Expect optional metrics and source freshness timestamps.
- MCP tool errors (including `429` on `request_introduction`) use a structured `{ error: { code, message, retryable, retryAfterSeconds } }` envelope. See [error codes and retry guidance](../agents/mcp#errors-and-retry-guidance) before implementing retry logic.

## Privacy boundary

Public endpoints do not return private email addresses, watchlists, saved searches, contact preferences, agent credentials, or private AI profile settings. Do not combine public signals to infer protected or private attributes.
