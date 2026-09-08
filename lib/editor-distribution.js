const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery';
const VSIX_URL = 'https://github.com/sajeetharan/devglobe/releases/download/v0.3.0/devglobe-developer-discovery-0.3.0.vsix';

export const editorChannels = [
  { slug: 'vscode', name: 'VS Code', family: 'VS Code', aliases: ['visual studio code', 'microsoft'], status: 'available', installLabel: 'Install from Marketplace', installUrl: MARKETPLACE_URL, accent: '#23a8f2' },
  { slug: 'cursor', name: 'Cursor', family: 'VS Code', aliases: ['anysphere', 'ai editor'], status: 'available', installLabel: 'Download VSIX', installUrl: VSIX_URL, accent: '#d8ff4f' },
  { slug: 'windsurf', name: 'Windsurf', family: 'VS Code', aliases: ['codeium', 'ai editor'], status: 'available', installLabel: 'Download VSIX', installUrl: VSIX_URL, accent: '#46d8bd' },
  { slug: 'vscodium', name: 'VSCodium', family: 'VS Code', aliases: ['codium', 'open source'], status: 'available', installLabel: 'Download VSIX', installUrl: VSIX_URL, accent: '#2f80ed' },
  { slug: 'positron', name: 'Positron', family: 'VS Code', aliases: ['data science', 'python', 'r'], status: 'available', installLabel: 'Download VSIX', installUrl: VSIX_URL, accent: '#ffcb4c' },
  { slug: 'void', name: 'Void', family: 'VS Code', aliases: ['ai editor'], status: 'available', installLabel: 'Download VSIX', installUrl: VSIX_URL, accent: '#ef5350' },
  { slug: 'antigravity', name: 'Antigravity', family: 'VS Code', aliases: ['google', 'ai editor'], status: 'available', installLabel: 'Download VSIX', installUrl: VSIX_URL, accent: '#ff7a45' },
  { slug: 'jetbrains', name: 'JetBrains IDEs', family: 'JetBrains', aliases: ['intellij', 'webstorm', 'pycharm', 'phpstorm', 'rider'], status: 'planned', accent: '#ff4f80' },
  { slug: 'cli', name: 'CLI agents', family: 'Terminal', aliases: ['claude code', 'codex', 'opencode', 'command line'], status: 'planned', accent: '#62d58b' },
];

export function getEditorChannel(slug) {
  return editorChannels.find(editor => editor.slug === slug) || null;
}

export function filterEditorChannels(editors, { query = '', status = 'all' } = {}) {
  const normalizedQuery = String(query).trim().toLowerCase();
  return editors.filter(editor => {
    if (status !== 'all' && editor.status !== status) return false;
    if (!normalizedQuery) return true;
    return [editor.name, editor.family, editor.slug, ...(editor.aliases || [])]
      .some(value => value.toLowerCase().includes(normalizedQuery));
  });
}

export function editorInstallSteps(editor) {
  if (!editor || editor.status !== 'available') return [];
  if (editor.slug === 'vscode') {
    return ['Open the Marketplace listing.', 'Choose Install and allow VS Code to open.', 'Choose Go Live in the DevGlobe status item.'];
  }
  return ['Download the latest VSIX from GitHub Releases.', `Open ${editor.name} and run “Extensions: Install from VSIX…”.`, 'Choose the downloaded DevGlobe VSIX, then use the status item to Go Live.'];
}

export function attributedInstallUrl(editor) {
  if (!editor?.installUrl) return null;
  const url = new URL(editor.installUrl);
  url.searchParams.set('utm_source', 'devglobe');
  url.searchParams.set('utm_medium', 'plugin_directory');
  url.searchParams.set('utm_campaign', editor.slug);
  return url.toString();
}