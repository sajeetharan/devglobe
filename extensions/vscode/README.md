# DevGlobe: Live Coding Globe for VS Code

Show up on the live developer globe while you code, build private daily coding stats, and discover developers without leaving VS Code.

This extension connects exclusively to [devglobe.dev](https://www.devglobe.dev). It is not affiliated with `devglobe.app` or the `DevGlobe.devglobe` Marketplace extension.

## Install

Choose your editor in the [DevGlobe editor directory](https://www.devglobe.dev/plugins), or install [DevGlobe: Live Coding Globe from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery). Choose **Go Live Now** in the first-run prompt and approve GitHub authentication. Your verified GitHub name appears automatically on the [live globe](https://www.devglobe.dev/space); no separate DevGlobe profile is required. You can also use the Command Palette and run `DevGlobe.dev: Go Live on the Developer Globe`.

Cursor, Windsurf, VSCodium, Positron, Void, Antigravity, and other compatible VS Code forks can install the same VSIX. Download the [version 0.4.0 release package](https://github.com/sajeetharan/devglobe/releases/download/v0.4.0/devglobe-developer-discovery-0.4.0.vsix), then use the editor's **Install from VSIX** action. Open VSX and vendor marketplace publication require their respective publisher credentials.

## Commands

- `DevGlobe.dev: Find a Developer`
- `DevGlobe.dev: Open My Profile`
- `DevGlobe.dev: Copy My Identity Card Link`
- `DevGlobe.dev: Copy MCP Configuration`
- `DevGlobe.dev: Open Agent Setup`
- `DevGlobe.dev: View My Coding Stats`
- `DevGlobe.dev: Complete My Globe Profile`
- `DevGlobe.dev: Go Live on the Developer Globe`
- `DevGlobe.dev: Stop Sharing Coding Presence`

Set `devglobedev.githubLogin` in VS Code settings to enable personal profile and card commands. `devglobedev.baseUrl` defaults to `https://www.devglobe.dev`.

Live presence is off by default. After you opt in once, it resumes automatically on later editor launches. Starting it uses the editor's GitHub authentication, then sends a heartbeat every 30 seconds while you are active. DevGlobe uses your verified public GitHub identity and an existing public profile location. If no location is available, the extension asks for a city and country without sending you to another website. Until a source-code file is active, the globe shows **Ready to code** instead of an unknown language. Heartbeats pause after one minute without editor activity and resume when you continue coding. Private daily totals, streaks, weekly goals, achievements, and language/editor breakdowns are calculated from those heartbeats. Set `devglobedev.presence.shareActiveLanguage` to `false` to hide the active language.

## Privacy

The extension makes a public API request when you run a search command. If you explicitly enable live presence, it sends your public profile location (or the city/country you enter), active language, editor name, operating system, and session timestamps. Editor events only reset an in-memory inactivity timer; the events and their contents are not transmitted. It does not send source code, file paths, repository names, branches, or keystrokes. Globe coordinates are geocoded from that public location, not device geolocation. The DevGlobe presence token is stored in VS Code SecretStorage.

## Development

1. Open `extensions/vscode` in VS Code.
2. Run `npm install`.
3. Press `F5` and select **Run Extension**.
4. Run a DevGlobe command in the Extension Development Host.

Run `npm test` for helper tests and `npm run check` for JavaScript syntax checks.

For help, see [SUPPORT.md](SUPPORT.md) or open a [GitHub issue](https://github.com/sajeetharan/devglobe/issues).

## Packaging

Package a release candidate from this directory with:

```sh
npx @vscode/vsce package
```

The **Publish editor extension** GitHub Actions workflow validates and packages one VSIX, then can publish that exact artifact to GitHub Releases, Visual Studio Marketplace, and Open VSX. Marketplace publication requires the `VSCE_PAT` repository secret. Open VSX publication requires the `devglobedev` namespace and an `OVSX_PAT` repository secret. Each registry requires a version not already published.