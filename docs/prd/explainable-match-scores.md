# PRD: Explainable Match Scores

## Status

- Owner: DevGlobe
- Stage: MVP implementation
- Surface: Homepage search, public search API, MCP developer search

## Problem

DevGlobe can rank developers through text, semantic, and hybrid search, but a position in a result list does not tell a user why the developer appeared. Raw vector distance and internal rank-fusion values are not meaningful to most people. This makes discovery feel opaque and makes it harder for humans and AI agents to judge whether a result is worth opening.

## Product Promise

Every developer search result includes a concise relevance score and up to three reasons grounded in public profile fields or the retrieval method. The explanation describes why DevGlobe retrieved the profile. It never claims that a person is suitable for employment, predicts performance, or measures personal worth.

## Goals

- Make text, semantic, and hybrid result ordering understandable at a glance.
- Use one explanation contract across browser, API, and MCP consumers.
- Ground reasons in visible public fields and retrieval provenance.
- Keep explanations bounded, deterministic, and inexpensive to compute.
- Preserve existing search order, privacy filtering, and response fields.

## Non-goals

- Predicting job performance, culture fit, availability, or hiring suitability.
- Comparing a developer's personal worth or quality.
- Exposing embeddings, raw reciprocal-rank-fusion values, or private profile data.
- Replacing repository-specific matching or profile-similarity explanations.
- Allowing users to tune scoring weights in the MVP.

## MVP Experience

1. A user searches by username, name, location, language, or natural-language intent.
2. Each visible result shows an ordinal score from 0 to 100 and its strongest reason.
3. API and MCP results include the score, label, up to three reasons, contributing signals, method, and disclaimer.
4. Opening a result continues to use the existing profile workflow.

Example:

```json
{
  "match": {
    "score": 95,
    "label": "Strong match",
    "reasons": [
      "Primary language matches TypeScript",
      "Matched both semantic similarity and public profile text"
    ],
    "signals": ["semantic", "text"],
    "method": "hybrid",
    "disclaimer": "Discovery relevance based on public profile signals; not a probability, suitability rating, or hiring recommendation."
  }
}
```

## Scoring Model

The score is an ordinal discovery signal. It supports comparison within one result set and is not calibrated as a probability.

- Exact GitHub login: 100.
- Exact developer name: 98.
- Partial login or name: 92-94.
- Primary-language evidence: up to 88.
- Location evidence: up to 82.
- Public profile tag evidence: up to 80.
- Text, semantic, and hybrid rank contribute a bounded 62-91 baseline.
- A hybrid result retrieved by both semantic and text search receives a four-point provenance bonus, capped at 98.

Labels are **Strong match** at 85 or above, **Good match** at 72-84, and **Related match** below 72. Score changes must be versioned if later calibration would materially change interpretation.

## Data Contract

`match` is additive to each existing result:

- `score`: integer from 0 to 100.
- `label`: `Strong match`, `Good match`, or `Related match`.
- `reasons`: one to three bounded human-readable strings.
- `signals`: one or both of `text` and `semantic`.
- `method`: `text`, `semantic`, or `hybrid`.
- `disclaimer`: stable methodology warning.

Internal vector and text ranks are removed before serialization. Existing consumers that ignore `match` remain compatible.

## Safety And Privacy

- Reasons use public profile fields or retrieval provenance only.
- Protected or inferred sensitive attributes never contribute.
- The UI and API identify the score as discovery relevance rather than suitability.
- Search explanations do not imply availability or consent to contact.
- Existing nomination visibility filters and consent-gated introduction rules remain unchanged.

## Success Metrics

Primary:

- Search result to profile-open conversion.
- Percentage of searches where a user opens one of the top three results.
- Shortlist or identity-card action rate after an explained result.
- MCP searches followed by a profile or repository-match call.

Guardrails:

- Search latency and payload-size regression.
- Percentage of explanations using only a generic retrieval reason.
- User reports of misleading or sensitive explanations.
- Result ordering changes, with a target of zero for the MVP.

## Rollout

1. Ship the additive contract and homepage result treatment.
2. Monitor profile-open conversion and generic-reason frequency by search mode.
3. Review a sample of text, semantic, and hybrid explanations for misleading claims.
4. Calibrate thresholds only with a versioned offline relevance set.
5. Consider expanded explanation details after users demonstrate demand.

## Acceptance Criteria

- Local text and API search results use the same explanation module.
- Vector results identify semantic rank without exposing embeddings.
- Hybrid results identify whether text, semantic, or both retrieval paths contributed.
- Internal rank metadata is absent from public responses.
- Homepage cards show a score and strongest reason without layout overflow.
- MCP search preserves the API match object after profile hydration.
- OpenAPI documents the additive match schema and search modes.
- Unit tests cover exact fields, semantic rank, hybrid provenance, bounds, and immutability.
- Full tests and the production build pass.