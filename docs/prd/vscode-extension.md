# DevGlobe VS Code Extension

**Issue:** [#44](https://github.com/sajeetharan/devglobe/issues/44)  
**Status:** Live presence implementation ready for rollout

## Summary

Publish a lightweight VS Code extension that lets developers opt in to the live globe, builds private coding aggregates, and brings DevGlobe discovery and identity actions into the editor. The extension exchanges VS Code's GitHub authentication for a scoped presence token and never receives a server-side ingestion secret.

## Problem

Developers currently need to leave their editor to discover collaborators, open their DevGlobe profile, share their identity card, or configure an AI agent. This limits repeat usage and removes DevGlobe from the place where developers make collaboration decisions.

## Goals

- Make public developer discovery available from the Command Palette.
- Give developers fast access to their profile and shareable identity card.
- Make the DevGlobe MCP endpoint easy to configure in compatible AI clients.
- Measure the install and activation funnel with privacy-safe, first-party events.
- Establish a marketplace distribution surface that can be expanded safely.

## Non-goals

- Reading source code, file contents, keystrokes, branches, or repository remotes.
- Storing GitHub OAuth cookies or server-side ingestion secrets.
- Recreating the globe or the complete web application inside VS Code.
- Contacting developers automatically.

## User Experience

The extension contributes these commands:

| Command | Behavior |
| --- | --- |
| `DevGlobe: Find a Developer` | Prompts for a query, displays public matches, and offers profile/card actions. |
| `DevGlobe: Open My Profile` | Opens the configured GitHub login on DevGlobe. |
| `DevGlobe: Copy My Identity Card Link` | Copies the configured developer's share page. |
| `DevGlobe: Copy MCP Configuration` | Copies a VS Code-compatible Streamable HTTP server configuration. |
| `DevGlobe: Open Agent Setup` | Opens the DevGlobe agent setup hub. |
| `DevGlobe: Go Live on the Developer Globe` | Authenticates with GitHub and starts the opt-in heartbeat. |
| `DevGlobe: Stop Sharing Coding Presence` | Stops the heartbeat and removes current presence. |
| `DevGlobe: View My Coding Stats` | Opens the authenticated, owner-only stats dashboard. |

`devglobedev.githubLogin` stores the user's public GitHub login in VS Code settings. `devglobedev.baseUrl` defaults to `https://www.devglobe.dev` and supports local or staging environments. The `devglobedev.*` namespace avoids collisions with the unrelated `DevGlobe.devglobe` Marketplace extension.

## Architecture

- The extension is isolated under `extensions/vscode`.
- Search calls `GET /api/search?q=<query>&mode=text&top=10` only after a user submits a query.
- Profiles use `/developer/<login>` and identity cards use `/share/<login>`.
- Links include `utm_source=vscode_extension&utm_medium=marketplace`.
- MCP setup copies a configuration pointing to `/mcp`; it never handles agent credentials.
- URL construction and response normalization are framework-independent and unit tested.
- Presence uses a scoped token in VS Code `SecretStorage` and a 30-second heartbeat. A heartbeat is live for 90 seconds and remains visible as recently coding for up to 15 minutes.
- Daily totals are derived server-side from consecutive valid heartbeats and retained for 400 days.

## Privacy and Security

- Background requests occur only after explicit live-presence opt-in.
- First-party activation events contain bounded event properties and one-way identity hashes, not raw GitHub logins.
- No source, workspace, repository, branch, file, or keystroke access.
- Search responses are treated as untrusted data and normalized before display.
- The configurable base URL must use HTTPS, except for localhost development.
- Authentication uses a narrowly scoped, expiring developer token stored with VS Code `SecretStorage`.

## Acceptance Criteria

- A developer can search by login, name, language, location, or biography from VS Code.
- Selecting a result can open its profile or copy its profile/card link.
- A configured user can open their profile and copy their identity-card link.
- A user can copy a valid VS Code MCP server configuration and open setup documentation.
- Invalid base URLs, empty queries, unavailable APIs, and malformed responses produce actionable errors.
- Unit tests cover URL validation, attribution, MCP configuration, and result normalization.
- The extension package contains marketplace metadata and local development instructions.
- First run offers a clear Go Live action and discloses public location, language, editor, OS, and session timing before authentication.
- Canceling authentication leaves presence disabled.
- After one explicit opt-in, presence resumes automatically on later editor launches.
- A verified GitHub user can appear immediately without an existing DevGlobe directory profile.
- Presence publishes `Ready to code` until a source-code file supplies a language.
- Missing location data is collected in the editor with a bounded city/country prompt.

## Measures

Use existing web analytics through attributed landing URLs:

- Visits with `utm_source=vscode_extension`.
- Profile and identity-card visits originating from the extension.
- Agent setup visits originating from the extension.
- Downstream profile claims and shares attributed to those visits.

Marketplace installs, active installs, ratings, and uninstall trends come from marketplace reporting. The extension includes no telemetry SDK; DevGlobe's server records bounded milestones from normal presence and stats requests.

DevGlobe records first-party install-click, token, presence, sign-off, and stats-view milestones. Raw identities are replaced with HMAC hashes before storage, event properties are allow-listed, and repeated milestones are deduplicated in 30-minute windows.

## Rollout

1. Validate the VSIX locally and with Extension Development Host.
2. Deploy the presence and coding-stats APIs before publishing each extension release.
3. Publish an unlisted marketplace preview and verify GitHub authentication, presence expiry, and VS Code forks.
4. Publish publicly and measure install-to-presence activation and stats return usage.