const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery';
const VSIX_URL = 'https://github.com/sajeetharan/devglobe/releases/download/v0.3.0/devglobe-developer-discovery-0.3.0.vsix';

export const editorChannels = [
  { slug: 'vscode', name: 'VS Code', family: 'VS Code', status: 'available', installLabel: 'Install from Marketplace', installUrl: MARKETPLACE_URL, accent: '#23a8f2' },
  { slug: 'cursor', name: 'Cursor', family: 'VS Code', status: 'available', installLabel: 'Download VSIX', installUrl: VSIX_URL, accent: '#d8ff4f' },
  { slug: 'windsurf', name: 'Windsurf', family: 'VS Code', status: 'available', installLabel: 'Download VSIX', installUrl: VSIX_URL, accent: '#46d8bd' },
  { slug: 'vscodium', name: 'VSCodium', family: 'VS Code', status: 'available', installLabel: 'Download VSIX', installUrl: VSIX_URL, accent: '#2f80ed' },
  { slug: 'positron', name: 'Positron', family: 'VS Code', status: 'available', installLabel: 'Download VSIX', installUrl: VSIX_URL, accent: '#ffcb4c' },
  { slug: 'void', name: 'Void', family: 'VS Code', status: 'available', installLabel: 'Download VSIX', installUrl: VSIX_URL, accent: '#ef5350' },
  { slug: 'antigravity', name: 'Antigravity', family: 'VS Code', status: 'available', installLabel: 'Download VSIX', installUrl: VSIX_URL, accent: '#ff7a45' },
  { slug: 'jetbrains', name: 'JetBrains IDEs', family: 'JetBrains', status: 'planned', accent: '#ff4f80' },
  { slug: 'cli', name: 'CLI agents', family: 'Terminal', status: 'planned', accent: '#62d58b' },
];

export function getEditorChannel(slug) {
  return editorChannels.find(editor => editor.slug === slug) || null;
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