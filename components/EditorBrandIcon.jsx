import { Atom, Code2, Orbit, Terminal } from 'lucide-react';
import { siCursor, siJetbrains, siVscodium, siWindsurf } from 'simple-icons';

const brandIcons = {
  cursor: siCursor,
  jetbrains: siJetbrains,
  vscodium: siVscodium,
  windsurf: siWindsurf,
};

const fallbackIcons = {
  antigravity: Orbit,
  cli: Terminal,
  positron: Atom,
};

export default function EditorBrandIcon({ editor, size = 28 }) {
  const brand = brandIcons[editor.slug];
  if (brand) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <path d={brand.path} fill="currentColor" />
      </svg>
    );
  }
  const Icon = fallbackIcons[editor.slug] || Code2;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}