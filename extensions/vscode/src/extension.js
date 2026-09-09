const vscode = require('vscode');
const {
  agentSetupUrl,
  codingStatsUrl,
  editorName,
  identityCardUrl,
  isCodingActivityRecent,
  liveGlobeUrl,
  mcpConfiguration,
  normalizeActiveLanguage,
  normalizeLogin,
  normalizeResults,
  presenceTokenUrl,
  presenceUrl,
  profileSetupUrl,
  profileUrl,
  resolveBaseUrl,
  searchUrl,
} = require('./devglobe');

function configuration() {
  const settings = vscode.workspace.getConfiguration('devglobedev');
  return {
    baseUrl: resolveBaseUrl(settings.get('baseUrl', 'https://www.devglobe.dev')),
    githubLogin: settings.get('githubLogin', ''),
    presenceEnabled: settings.get('presence.enabled', false),
    presenceLocation: settings.get('presence.location', ''),
    shareActiveLanguage: settings.get('presence.shareActiveLanguage', true),
  };
}

const PRESENCE_TOKEN_KEY = 'devglobedev.livePresenceToken';
const ONBOARDING_KEY = 'devglobedev.goLiveOnboarding.v1';
const HEARTBEAT_INTERVAL_MS = 30000;

function platformName() {
  return { darwin: 'macOS', linux: 'Linux', win32: 'Windows' }[process.platform] || 'Unknown';
}

function activeLanguage() {
  return normalizeActiveLanguage(vscode.window.activeTextEditor?.document?.languageId);
}

function createPresenceController(context) {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 20);
  context.subscriptions.push(status);

  let timer = null;
  let starting = null;
  let sessionStartedAt = null;
  let lastActivityAt = 0;
  let sending = false;

  function showOfflineStatus() {
    status.command = 'devglobedev.startPresence';
    status.text = '$(globe) DevGlobe: Go live';
    status.tooltip = 'Show up on the live developer globe while you code.';
    status.show();
  }

  function showLiveStatus() {
    status.command = 'devglobedev.stopPresence';
    status.text = '$(radio-tower) DevGlobe live';
    status.tooltip = 'Coding presence is visible on DevGlobe. Click to stop sharing.';
    status.show();
  }

  function showIdleStatus() {
    status.command = 'devglobedev.stopPresence';
    status.text = '$(debug-pause) DevGlobe idle';
    status.tooltip = 'Heartbeats pause after one minute without editor activity. Start coding to resume.';
    status.show();
  }

  function showLocationRequiredStatus() {
    status.command = 'devglobedev.startPresence';
    status.text = '$(location) DevGlobe: Add location';
    status.tooltip = 'Enter a city and country to place your marker on the globe.';
    status.show();
  }

  showOfflineStatus();

  async function exchangeToken(interactive) {
    const githubSession = await vscode.authentication.getSession('github', ['read:user'], {
      createIfNone: interactive,
    });
    if (!githubSession) return null;

    const response = await fetch(presenceTokenUrl(configuration().baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${githubSession.accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`DevGlobe presence sign-in failed with HTTP ${response.status}.`);
    const payload = await response.json();
    if (typeof payload.token !== 'string' || !payload.token) throw new Error('DevGlobe returned an invalid presence token.');
    await context.secrets.store(PRESENCE_TOKEN_KEY, payload.token);
    if (payload.login) {
      await vscode.workspace.getConfiguration('devglobedev').update(
        'githubLogin',
        normalizeLogin(payload.login),
        vscode.ConfigurationTarget.Global,
      );
    }
    return payload.token;
  }

  async function token(interactive = false) {
    return await context.secrets.get(PRESENCE_TOKEN_KEY) || exchangeToken(interactive);
  }

  async function heartbeat(interactive = false) {
    if (sending || !configuration().presenceEnabled) return false;
    if (!isCodingActivityRecent(lastActivityAt)) {
      showIdleStatus();
      return false;
    }
    const language = activeLanguage() || 'Ready to code';
    sending = true;
    try {
      let bearer = await token(interactive);
      if (!bearer) return false;
      const send = () => fetch(presenceUrl(configuration().baseUrl), {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeLanguage: configuration().shareActiveLanguage ? language : 'Hidden',
          editor: editorName(vscode.env.appName),
          location: configuration().presenceLocation,
          platform: platformName(),
          sessionStartedAt,
        }),
        signal: AbortSignal.timeout(15000),
      });
      let response = await send();
      if (response.status === 401) {
        await context.secrets.delete(PRESENCE_TOKEN_KEY);
        bearer = await exchangeToken(interactive);
        if (!bearer) return false;
        response = await send();
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const error = new Error(payload.error || `DevGlobe presence failed with HTTP ${response.status}.`);
        if (response.status === 422 && payload.code === 'location_required') error.code = 'location-required';
        throw error;
      }
      showLiveStatus();
      return 'live';
    } finally {
      sending = false;
    }
  }

  async function start(interactive = false) {
    if (timer) return true;
    if (starting) return starting;
    starting = (async () => {
      sessionStartedAt = new Date().toISOString();
      lastActivityAt = Date.now();
      if (interactive && !await token(true)) return false;
      try {
        const state = await heartbeat(interactive);
        if (!state || !configuration().presenceEnabled) return false;
        timer = setInterval(() => heartbeat(false).catch(handleBackgroundError), HEARTBEAT_INTERVAL_MS);
        return state;
      } catch (error) {
        if (error.code === 'location-required') showLocationRequiredStatus();
        throw error;
      }
    })();
    try {
      return await starting;
    } finally {
      starting = null;
    }
  }

  function handleBackgroundError(error) {
    if (error?.code === 'location-required') {
      if (timer) clearInterval(timer);
      timer = null;
      showLocationRequiredStatus();
      return;
    }
    console.error('DevGlobe presence heartbeat failed:', error);
  }

  async function stop(notifyServer = true, keepAction = true) {
    if (timer) clearInterval(timer);
    timer = null;
    if (keepAction) showOfflineStatus();
    else status.hide();
    if (!notifyServer) return;
    const bearer = await context.secrets.get(PRESENCE_TOKEN_KEY);
    if (!bearer) return;
    await fetch(presenceUrl(configuration().baseUrl), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  }

  function recordActivity() {
    const wasActive = isCodingActivityRecent(lastActivityAt);
    lastActivityAt = Date.now();
    if (configuration().presenceEnabled && !wasActive) heartbeat(false).catch(handleBackgroundError);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(recordActivity),
    vscode.window.onDidChangeTextEditorSelection(recordActivity),
    vscode.workspace.onDidChangeTextDocument(recordActivity),
    vscode.workspace.onDidSaveTextDocument(recordActivity),
    vscode.window.onDidChangeWindowState(event => {
      if (event.focused) recordActivity();
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration('devglobedev.presence')) return;
      if (configuration().presenceEnabled) start(true).catch(handleBackgroundError);
      else stop().catch(error => console.error('DevGlobe presence sign-off failed:', error));
    }),
    { dispose: () => stop(false, false) },
  );
  return { start, stop };
}

async function openExternal(url) {
  await vscode.env.openExternal(vscode.Uri.parse(url));
}

async function copyWithConfirmation(value, message) {
  await vscode.env.clipboard.writeText(value);
  await vscode.window.showInformationMessage(message);
}

async function configuredLogin() {
  const { githubLogin } = configuration();
  if (githubLogin) return normalizeLogin(githubLogin);

  const action = await vscode.window.showWarningMessage(
    'Set devglobedev.githubLogin to use this command.',
    'Open Settings',
  );
  if (action === 'Open Settings') {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'devglobedev.githubLogin');
  }
  return null;
}

async function searchDevelopers() {
  const query = await vscode.window.showInputBox({
    prompt: 'Search by developer, language, location, or biography',
    placeHolder: 'TypeScript Canada',
    ignoreFocusOut: true,
  });
  if (query === undefined) return;

  const { baseUrl } = configuration();
  let response;
  try {
    response = await fetch(searchUrl(baseUrl, query), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new Error(`Could not reach DevGlobe: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`DevGlobe search failed with HTTP ${response.status}.`);
  }

  const developers = normalizeResults(await response.json());
  if (developers.length === 0) {
    await vscode.window.showInformationMessage(`No DevGlobe developers found for "${query.trim()}".`);
    return;
  }

  const selected = await vscode.window.showQuickPick(
    developers.map((developer) => ({
      label: developer.name || developer.login,
      description: `@${developer.login}`,
      detail: [developer.language, developer.location, developer.score === null ? '' : `Score ${developer.score}`]
        .filter(Boolean)
        .join(' | '),
      developer,
    })),
    { placeHolder: 'Select a developer' },
  );
  if (!selected) return;

  const action = await vscode.window.showQuickPick([
    { label: '$(link-external) Open profile', value: 'open' },
    { label: '$(copy) Copy profile link', value: 'copy-profile' },
    { label: '$(credit-card) Copy identity card link', value: 'copy-card' },
  ], { placeHolder: `Choose an action for @${selected.developer.login}` });

  if (action?.value === 'open') {
    await openExternal(profileUrl(baseUrl, selected.developer.login));
  } else if (action?.value === 'copy-profile') {
    await copyWithConfirmation(profileUrl(baseUrl, selected.developer.login), 'DevGlobe profile link copied.');
  } else if (action?.value === 'copy-card') {
    await copyWithConfirmation(identityCardUrl(baseUrl, selected.developer.login), 'DevGlobe identity card link copied.');
  }
}

function registerCommand(context, name, handler) {
  context.subscriptions.push(vscode.commands.registerCommand(name, async () => {
    try {
      await handler();
    } catch (error) {
      await vscode.window.showErrorMessage(error instanceof Error ? error.message : 'DevGlobe command failed.');
    }
  }));
}

async function goLive(presence) {
  const settings = vscode.workspace.getConfiguration('devglobedev');
  await settings.update('presence.enabled', true, vscode.ConfigurationTarget.Global);
  try {
    let state;
    try {
      state = await presence.start(true);
    } catch (error) {
      if (error?.code !== 'location-required') throw error;
      const location = await vscode.window.showInputBox({
        title: 'Place your marker on DevGlobe',
        prompt: 'Enter a city and country. This is shared publicly while you are live.',
        placeHolder: 'Colombo, Sri Lanka',
        ignoreFocusOut: true,
        validateInput: value => {
          const length = value.trim().length;
          if (length < 2) return 'Enter a city or country.';
          if (length > 80) return 'Keep the location under 80 characters.';
          return null;
        },
      });
      if (location === undefined) {
        await settings.update('presence.enabled', false, vscode.ConfigurationTarget.Global);
        await presence.stop(false);
        return;
      }
      await settings.update('presence.location', location.trim(), vscode.ConfigurationTarget.Global);
      state = await presence.start(true);
    }
    if (!state) throw new Error('GitHub authentication is required to go live on DevGlobe.');
    const action = await vscode.window.showInformationMessage(
      `You are live as @${configuration().githubLogin}.`,
      'See Me Live',
      'View My Stats',
    );
    if (action === 'See Me Live') await openExternal(liveGlobeUrl(configuration().baseUrl));
    if (action === 'View My Stats') await openExternal(codingStatsUrl(configuration().baseUrl));
  } catch (error) {
    await settings.update('presence.enabled', false, vscode.ConfigurationTarget.Global);
    await presence.stop(false);
    throw error;
  }
}

async function offerGoLiveOnboarding(context) {
  if (context.globalState.get(ONBOARDING_KEY)) return;
  await context.globalState.update(ONBOARDING_KEY, true);
  if (configuration().presenceEnabled) return;

  const action = await vscode.window.showInformationMessage(
    'Join the DevGlobe live coding map? Share your public location, language, editor, OS, and session timing; never code, files, or repositories.',
    'Go Live Now',
    'Learn More',
    'Not Now',
  );
  if (action === 'Go Live Now') await vscode.commands.executeCommand('devglobedev.startPresence');
  if (action === 'Learn More') await openExternal(liveGlobeUrl(configuration().baseUrl));
}

async function activate(context) {
  const presence = createPresenceController(context);
  registerCommand(context, 'devglobedev.searchDevelopers', searchDevelopers);
  registerCommand(context, 'devglobedev.openMyProfile', async () => {
    const login = await configuredLogin();
    if (login) await openExternal(profileUrl(configuration().baseUrl, login));
  });
  registerCommand(context, 'devglobedev.copyIdentityCardUrl', async () => {
    const login = await configuredLogin();
    if (login) {
      await copyWithConfirmation(
        identityCardUrl(configuration().baseUrl, login),
        'Your DevGlobe identity card link was copied.',
      );
    }
  });
  registerCommand(context, 'devglobedev.copyMcpConfiguration', async () => {
    await copyWithConfirmation(mcpConfiguration(configuration().baseUrl), 'DevGlobe MCP configuration copied.');
  });
  registerCommand(context, 'devglobedev.openAgentSetup', async () => {
    await openExternal(agentSetupUrl(configuration().baseUrl));
  });
  registerCommand(context, 'devglobedev.openCodingStats', async () => {
    await openExternal(codingStatsUrl(configuration().baseUrl));
  });
  registerCommand(context, 'devglobedev.completeProfile', async () => {
    const login = await configuredLogin();
    if (login) await openExternal(profileSetupUrl(configuration().baseUrl, login));
  });
  registerCommand(context, 'devglobedev.startPresence', async () => {
    await goLive(presence);
  });
  registerCommand(context, 'devglobedev.stopPresence', async () => {
    await vscode.workspace.getConfiguration('devglobedev').update('presence.enabled', false, vscode.ConfigurationTarget.Global);
    await presence.stop();
    await vscode.window.showInformationMessage('Your DevGlobe coding presence is offline.');
  });
  if (configuration().presenceEnabled) {
    presence.start(false).catch(error => console.error('DevGlobe automatic presence resume failed:', error));
  }
  await offerGoLiveOnboarding(context);
}

function deactivate() {}

module.exports = { activate, deactivate };