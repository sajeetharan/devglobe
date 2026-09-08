import Link from 'next/link';
import EditorPicker from '../../components/EditorPicker.jsx';
import { editorChannels } from '../../lib/editor-distribution.js';
import styles from './plugins.module.css';

export const metadata = {
  title: 'Connect your editor | DevGlobe',
  description: 'Install DevGlobe for VS Code and compatible editors, then appear on the live developer globe while you code.',
  alternates: { canonical: '/plugins' },
};

export default function PluginDirectoryPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/space" className={styles.brand}><img src="/devglobe.png" alt="" />DevGlobe</Link>
        <Link href="/space">View live globe</Link>
      </header>
      <section className={styles.intro}>
        <div>
          <p>Editor connections</p>
          <h1>Pick an editor. Go live.</h1>
        </div>
        <span>Search your editor, install the connection, and appear on the globe while you actively code.</span>
      </section>
      <EditorPicker editors={editorChannels} />
      <aside className={styles.privacy}>
        <strong>Activity, not contents</strong>
        <p>DevGlobe never sends source code, file paths, repository names, branches, or keystrokes. Editor events only reset a local inactivity timer.</p>
      </aside>
    </main>
  );
}