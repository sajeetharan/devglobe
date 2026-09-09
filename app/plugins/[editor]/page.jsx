import Link from 'next/link';
import { notFound } from 'next/navigation';
import EditorInstallLink from '../../../components/EditorInstallLink.jsx';
import { attributedInstallUrl, editorChannels, editorInstallSteps, getEditorChannel } from '../../../lib/editor-distribution.js';
import styles from '../plugins.module.css';

export function generateStaticParams() {
  return editorChannels.map(editor => ({ editor: editor.slug }));
}

export async function generateMetadata({ params }) {
  const { editor: slug } = await params;
  const editor = getEditorChannel(slug);
  if (!editor) return {};
  return {
    title: `${editor.status === 'available' ? 'Install' : 'DevGlobe for'} ${editor.name} | DevGlobe`,
    description: editor.status === 'available'
      ? `Connect ${editor.name} to DevGlobe and show your privacy-safe coding presence on the live globe.`
      : `Follow DevGlobe's progress toward a native ${editor.name} connection.`,
    alternates: { canonical: `/plugins/${editor.slug}` },
  };
}

export default async function EditorPluginPage({ params }) {
  const { editor: slug } = await params;
  const editor = getEditorChannel(slug);
  if (!editor) notFound();
  const steps = editorInstallSteps(editor);
  const installUrl = attributedInstallUrl(editor);
  return (
    <main className={styles.page} style={{ '--editor-accent': editor.accent }}>
      <header className={styles.header}>
        <Link href="/plugins" className={styles.brand}><img src="/devglobe.png" alt="" />All editors</Link>
        <Link href="/space">View live globe</Link>
      </header>
      <section className={styles.editorIntro}>
        <i aria-hidden="true" />
        <p>{editor.family}</p>
        <h1>DevGlobe for {editor.name}</h1>
        <span>{editor.status === 'available' ? 'Install the extension, choose Go Live Now, and approve GitHub. Your verified name appears on the globe automatically.' : 'This connection needs a native client and is on the distribution roadmap.'}</span>
        {installUrl ? <EditorInstallLink className={styles.primaryAction} editor={editor.slug} href={installUrl}>{editor.installLabel}</EditorInstallLink> : <Link className={styles.secondaryAction} href="/plugins">Use a supported editor</Link>}
      </section>
      {steps.length ? (
        <ol className={styles.steps}>
          {steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}
        </ol>
      ) : (
        <section className={styles.waiting}><h2>Not available yet</h2><p>We will not label an incompatible package as supported. The native client will use the same opt-in heartbeat and privacy rules as the current extension.</p></section>
      )}
      <aside className={styles.privacy}>
        <strong>Your work stays local</strong>
        <p>Your public location, bounded presence timestamps, editor, platform, and optionally active language are sent. Tracking pauses after one minute without editor activity.</p>
      </aside>
    </main>
  );
}