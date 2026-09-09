# Changelog

## 0.6.0 - 2026-09-09

- Let developers explicitly share a coding agent and optional model while live.
- Show shared agent identities in the activity list, developer details, and filters.
- Keep agent/model sharing off by default and never infer it from installed extensions or editor activity.

## 0.5.0 - 2026-09-09

- Add optional coding statuses and shared 25- or 50-minute focus sessions.
- Notify developers when another signed-in DevGlobe user waves from the live globe.
- Show an end-of-session recap with time, nearby developers, countries, and waves.
- Prevent older editor sessions and legacy duplicate records from creating stale markers.

## 0.4.0 - 2026-09-09

- Let new installers appear immediately with their verified GitHub name, without requiring an existing DevGlobe profile.
- Ask for a city and country inside the editor only when no public location is available.
- Publish a `Ready to code` presence immediately instead of waiting for a source file.
- Offer a clearer consent-first Go Live flow immediately after installation.
- Remember the authenticated GitHub login and resume opted-in presence automatically.
- Show `Ready to code` before a source-code file supplies a language.
- Geocode a public profile location on demand and link to the right setup action when profile data is missing.

## 0.3.0

- Pause presence heartbeats after one minute without editor activity and resume automatically when coding continues.
- Detect Cursor, Windsurf, VSCodium, Positron, Void, Antigravity, and VS Code Insiders.
- Keep a one-click Go Live action visible in the status bar when presence is off.
- Link to private weekly goals, achievements, streaks, and shareable aggregate summaries.

## 0.2.0

- Opt in to the live developer globe using VS Code GitHub authentication.
- Build private daily coding totals and language/editor breakdowns from bounded heartbeats.
- Open the live globe and private coding dashboard from VS Code.

## 0.1.0

- Search public DevGlobe developer profiles from the Command Palette.
- Open and copy attributed profile links.
- Copy identity-card links.
- Copy a VS Code-compatible DevGlobe MCP configuration.
- Open the DevGlobe agent setup hub.