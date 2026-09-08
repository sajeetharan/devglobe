# DevGlobe: Live Coding Globe for VS Code

Show up on the live developer globe while you code, build private daily coding stats, and discover developers without leaving VS Code.

This extension connects exclusively to [devglobe.dev](https://www.devglobe.dev). It is not affiliated with `devglobe.app` or the `DevGlobe.devglobe` Marketplace extension.

## Install

Install [DevGlobe: Live Coding Globe from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery). Choose **Go Live** in the first-run prompt, approve GitHub authentication, and open the live globe to see your presence. You can also use the Command Palette and run `DevGlobe.dev: Go Live on the Developer Globe`.

## Commands

- `DevGlobe.dev: Find a Developer`
- `DevGlobe.dev: Open My Profile`
- `DevGlobe.dev: Copy My Identity Card Link`
- `DevGlobe.dev: Copy MCP Configuration`
- `DevGlobe.dev: Open Agent Setup`
- `DevGlobe.dev: View My Coding Stats`
- `DevGlobe.dev: Go Live on the Developer Globe`
- `DevGlobe.dev: Stop Sharing Coding Presence`

Set `devglobedev.githubLogin` in VS Code settings to enable personal profile and card commands. `devglobedev.baseUrl` defaults to `https://www.devglobe.dev`.

Live presence is off by default. Starting it uses VS Code's GitHub authentication, then sends a heartbeat every 30 seconds while the extension is running. Private daily totals and language/editor breakdowns are calculated from those heartbeats. Set `devglobedev.presence.shareActiveLanguage` to `false` to hide the active language.

## Privacy

The extension makes a public API request when you run a search command. If you explicitly enable live presence, it sends the active language, editor name, operating system, and session timestamps. It does not send source code, file paths, repository names, branches, or keystrokes. Globe coordinates come from your existing public DevGlobe profile, not device geolocation. The DevGlobe presence token is stored in VS Code SecretStorage.

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

Marketplace publication requires `devglobedev` publisher credentials and must use a version not already published.