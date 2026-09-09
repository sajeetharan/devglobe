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
          <h1>Install once. See yourself live.</h1>
        </div>
        <span>DevGlobe uses your verified GitHub name. Install the extension, choose Go Live Now, and your marker appears automatically.</span>
      </section>
      <ol className={styles.quickStart} aria-label="How to appear on the live globe">
        <li><span>1</span><div><strong>Install</strong><p>Choose your editor below.</p></div></li>
        <li><span>2</span><div><strong>Approve GitHub</strong><p>Confirm your public identity.</p></div></li>
        <li><span>3</span><div><strong>See your name live</strong><p>No separate DevGlobe profile required.</p></div></li>
      </ol>
      <EditorPicker editors={editorChannels} />
      <aside className={styles.privacy}>
        <strong>Activity, not contents</strong>
        <p>DevGlobe never sends source code, file paths, repository names, branches, or keystrokes. Editor events only reset a local inactivity timer.</p>
      </aside>
    </main>
  );
}