'use client';

import { track } from '../lib/analytics.js';

export default function EditorInstallLink({ className, editor, href, children }) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => track('extension_install_clicked', { source: 'plugin_directory', action: editor })}
    >
      {children}
    </a>
  );
}