import Link from 'next/link';
import { editorChannels } from '../../lib/editor-distribution.js';
import styles from './plugins.module.css';

export const metadata = {
  title: 'Connect your editor | DevGlobe',
  description: 'Install DevGlobe for VS Code and compatible editors, then appear on the live developer globe while you code.',
  alternates: { canonical: '/plugins' },
};

export default function PluginDirectoryPage() {
  const available = editorChannels.filter(editor => editor.status === 'available');
  const planned = editorChannels.filter(editor => editor.status === 'planned');
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/space" className={styles.brand}><img src="/devglobe.png" alt="" />DevGlobe</Link>
        <Link href="/space">View live globe</Link>
      </header>
      <section className={styles.intro}>
        <p>Editor connections</p>
        <h1>Show up while you code</h1>
        <span>One private-by-default extension connects compatible editors to the live globe. Pick your editor for the shortest installation path.</span>
      </section>
      <section className={styles.directory} aria-labelledby="available-title">
        <div className={styles.sectionHeading}><h2 id="available-title">Available now</h2><span>{available.length} editors</span></div>
        <div className={styles.rows}>
          {available.map(editor => (
            <Link href={`/plugins/${editor.slug}`} key={editor.slug} className={styles.row} style={{ '--editor-accent': editor.accent }}>
              <i aria-hidden="true" />
              <strong>{editor.name}</strong>
              <span>{editor.slug === 'vscode' ? 'Marketplace' : 'VSIX'}</span>
              <b>Install</b>
            </Link>
          ))}
        </div>
      </section>
      <section className={styles.planned} aria-labelledby="planned-title">
        <div className={styles.sectionHeading}><h2 id="planned-title">Coming next</h2><span>New native clients</span></div>
        {planned.map(editor => <div key={editor.slug}><strong>{editor.name}</strong><span>{editor.family} client in development</span></div>)}
      </section>
      <aside className={styles.privacy}>
        <strong>Activity, not contents</strong>
        <p>DevGlobe never sends source code, file paths, repository names, branches, or keystrokes. Editor events only reset a local inactivity timer.</p>
      </aside>
    </main>
  );
}