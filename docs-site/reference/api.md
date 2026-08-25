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
