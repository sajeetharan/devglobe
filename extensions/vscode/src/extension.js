const vscode = require('vscode');
const {
  agentSetupUrl,
  identityCardUrl,
  mcpConfiguration,
  normalizeLogin,
  normalizeResults,
  presenceTokenUrl,
  presenceUrl,
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
    shareActiveLanguage: settings.get('presence.shareActiveLanguage', true),
  };
}

const PRESENCE_TOKEN_KEY = 'devglobedev.livePresenceToken';
const HEARTBEAT_INTERVAL_MS = 30000;

function platformName() {
  return { darwin: 'macOS', linux: 'Linux', win32: 'Windows' }[process.platform] || 'Unknown';
}

function activeLanguage() {
  return vscode.window.activeTextEditor?.document?.languageId || 'Unknown';
}

function createPresenceController(context) {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 20);
  status.command = 'devglobedev.stopPresence';
  status.text = '$(radio-tower) DevGlobe live';
  status.tooltip = 'Coding presence is visible on DevGlobe. Click to stop sharing.';
  context.subscriptions.push(status);

  let timer = null;
  let starting = null;
  let sessionStartedAt = null;
  let sending = false;

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
    return payload.token;
  }

  async function token(interactive = false) {
    return await context.secrets.get(PRESENCE_TOKEN_KEY) || exchangeToken(interactive);
  }

  async function heartbeat(interactive = false) {
    if (sending || !configuration().presenceEnabled) return false;
    sending = true;
    try {
      let bearer = await token(interactive);
      if (!bearer) return false;
      const send = () => fetch(presenceUrl(configuration().baseUrl), {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeLanguage: configuration().shareActiveLanguage ? activeLanguage() : 'Hidden',
          editor: 'VS Code',
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
        throw new Error(payload.error || `DevGlobe presence failed with HTTP ${response.status}.`);
      }
      status.show();
      return true;
    } finally {
      sending = false;
    }
  }

  async function start(interactive = false) {
    if (timer) return true;
    if (starting) return starting;
    starting = (async () => {
      sessionStartedAt = new Date().toISOString();
      const online = await heartbeat(interactive);
      if (!online || !configuration().presenceEnabled) return false;
      timer = setInterval(() => heartbeat(false).catch(() => {}), HEARTBEAT_INTERVAL_MS);
      return true;
    })();
    try {
      return await starting;
    } finally {
      starting = null;
    }
  }

  async function stop(notifyServer = true) {
    if (timer) clearInterval(timer);
    timer = null;
    status.hide();
    if (!notifyServer) return;
    const bearer = await context.secrets.get(PRESENCE_TOKEN_KEY);
    if (!bearer) return;
    await fetch(presenceUrl(configuration().baseUrl), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => heartbeat(false).catch(() => {})),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration('devglobedev.presence')) return;
      if (configuration().presenceEnabled) start(true).catch(() => {});
      else stop().catch(() => {});
    }),
    { dispose: () => stop(false) },
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

function activate(context) {
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
  registerCommand(context, 'devglobedev.startPresence', async () => {
    await vscode.workspace.getConfiguration('devglobedev').update('presence.enabled', true, vscode.ConfigurationTarget.Global);
    const online = await presence.start(true);
    if (!online) throw new Error('GitHub authentication is required to share coding presence.');
    await vscode.window.showInformationMessage('Your coding presence is now visible on DevGlobe.');
  });
  registerCommand(context, 'devglobedev.stopPresence', async () => {
    await vscode.workspace.getConfiguration('devglobedev').update('presence.enabled', false, vscode.ConfigurationTarget.Global);
    await presence.stop();
    await vscode.window.showInformationMessage('Your DevGlobe coding presence is offline.');
  });
  if (configuration().presenceEnabled) presence.start(false).catch(() => {});
}

function deactivate() {}

module.exports = { activate, deactivate };