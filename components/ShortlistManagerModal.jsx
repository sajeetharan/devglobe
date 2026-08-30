'use client';

import { useEffect, useState } from 'react';

async function readResponse(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to update shortlists');
  return data;
}

function ShortlistEntry({ entry, selected, onSelect, onSaveNote, onRemove }) {
  const [note, setNote] = useState(entry.note || '');
  return (
    <article className="shortlist-entry">
      <label className="shortlist-entry__identity">
        <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${entry.login} for comparison`} />
        <span>@{entry.login}</span>
      </label>
      <textarea value={note} maxLength={500} onChange={event => setNote(event.target.value)} aria-label={`Private note for ${entry.login}`} placeholder="Private note" />
      <div className="shortlist-entry__actions">
        <button type="button" onClick={() => onSaveNote(note)}>Save note</button>
        <button type="button" className="shortlist-action--danger" onClick={onRemove}>Remove</button>
      </div>
    </article>
  );
}

export default function ShortlistManagerModal({ ownerLogin, initialLogin = '', onClose, onCompare }) {
  const [shortlists, setShortlists] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [newName, setNewName] = useState('');
  const [login, setLogin] = useState(initialLogin);
  const [note, setNote] = useState('');
  const [compareLogins, setCompareLogins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/shortlists', { cache: 'no-store' })
      .then(readResponse)
      .then(data => {
        if (cancelled) return;
        setShortlists(data.shortlists);
        setSelectedId(data.shortlists[0]?.id || '');
      })
      .catch(loadError => { if (!cancelled) setError(loadError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selected = shortlists.find(shortlist => shortlist.id === selectedId);

  const mutate = async (method, body) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await readResponse(await fetch('/api/shortlists', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
      setShortlists(data.shortlists);
      return data;
    } catch (mutationError) {
      setError(mutationError.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const create = async event => {
    event.preventDefault();
    const data = await mutate('POST', { name: newName });
    if (!data) return;
    const created = data.shortlists.find(shortlist => !shortlists.some(existing => existing.id === shortlist.id));
    setSelectedId(created?.id || data.shortlists.at(-1)?.id || '');
    setNewName('');
  };

  const addDeveloper = async event => {
    event.preventDefault();
    const data = await mutate('PATCH', { id: selectedId, action: 'add', login, note });
    if (!data) return;
    setLogin('');
    setNote('');
  };

  const share = async () => {
    if (!window.confirm('Create a read-only link? Anyone with it can see this shortlist, including its notes.')) return;
    const data = await mutate('PATCH', { id: selectedId, action: 'share' });
    if (!data?.shareToken) return;
    const url = `${window.location.origin}/shortlists/shared?owner=${encodeURIComponent(ownerLogin)}&token=${encodeURIComponent(data.shareToken)}`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Read-only link copied. Creating another link revokes this one.');
    } catch {
      setMessage(url);
    }
  };

  const removeList = async () => {
    if (!selected || !window.confirm(`Delete “${selected.name}” and all of its private notes?`)) return;
    const data = await mutate('DELETE', { id: selected.id });
    if (data) {
      setSelectedId(data.shortlists[0]?.id || '');
      setCompareLogins([]);
    }
  };

  const renameList = async () => {
    const name = window.prompt('Shortlist name', selected?.name || '');
    if (!name || name.trim() === selected?.name) return;
    await mutate('PATCH', { id: selected.id, action: 'rename', name });
  };

  const compare = async () => {
    setSaving(true);
    setError('');
    try {
      const profiles = await Promise.all(compareLogins.map(async developerLogin => {
        const response = await fetch(`/api/developer?id=${encodeURIComponent(developerLogin)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Unable to load @${developerLogin}`);
        return response.json();
      }));
      onCompare(profiles);
    } catch (compareError) {
      setError(compareError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shortlist-modal__backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="shortlist-modal" role="dialog" aria-modal="true" aria-labelledby="shortlist-title">
        <header className="shortlist-modal__header">
          <div><span>PRIVATE WORKSPACE</span><h2 id="shortlist-title">Developer shortlists</h2></div>
          <button type="button" className="shortlist-modal__close" onClick={onClose} aria-label="Close shortlists">&times;</button>
        </header>
        <p className="shortlist-modal__intro">Organize candidates and collaborators. Lists and notes stay private unless you create a read-only link.</p>

        <form className="shortlist-create" onSubmit={create}>
          <label htmlFor="shortlist-name">New shortlist</label>
          <div><input id="shortlist-name" value={newName} maxLength={80} onChange={event => setNewName(event.target.value)} placeholder="e.g. Rust maintainers" required /><button disabled={saving}>Create</button></div>
        </form>

        {loading && <p className="shortlist-modal__state">Loading shortlists...</p>}
        {error && <p className="shortlist-modal__error" role="alert">{error}</p>}
        {message && <p className="shortlist-modal__message" role="status">{message}</p>}

        {!loading && shortlists.length === 0 && <p className="shortlist-modal__state">Create a named shortlist to start organizing developers.</p>}
        {shortlists.length > 0 && (
          <div className="shortlist-workspace">
            <nav className="shortlist-tabs" aria-label="Your shortlists">
              {shortlists.map(shortlist => (
                <button type="button" aria-pressed={selectedId === shortlist.id} onClick={() => { setSelectedId(shortlist.id); setCompareLogins([]); }} key={shortlist.id}>
                  <span>{shortlist.name}</span><small>{shortlist.entries.length}</small>
                </button>
              ))}
            </nav>

            {selected && (
              <section className="shortlist-detail" aria-label={selected.name}>
                <div className="shortlist-detail__toolbar">
                  <div><strong>{selected.name}</strong><span>{selected.entries.length} of 50 developers</span></div>
                  <div>
                    <button type="button" disabled={saving} onClick={renameList}>Rename</button>
                    <button type="button" disabled={saving || compareLogins.length !== 2} onClick={compare}>Compare {compareLogins.length}/2</button>
                    <button type="button" disabled={saving} onClick={share}>{selected.shared ? 'Replace share link' : 'Share read-only'}</button>
                    {selected.shared && <button type="button" disabled={saving} onClick={() => mutate('PATCH', { id: selected.id, action: 'unshare' })}>Revoke</button>}
                    <button type="button" className="shortlist-action--danger" disabled={saving} onClick={removeList}>Delete</button>
                  </div>
                </div>

                <form className="shortlist-add" onSubmit={addDeveloper}>
                  <label htmlFor="shortlist-login">Add developer</label>
                  <div><input id="shortlist-login" value={login} onChange={event => setLogin(event.target.value)} placeholder="GitHub login" required /><input value={note} maxLength={500} onChange={event => setNote(event.target.value)} placeholder="Private note (optional)" /><button disabled={saving}>Add</button></div>
                </form>

                <div className="shortlist-entries">
                  {selected.entries.length === 0 && <p className="shortlist-modal__state">No developers in this shortlist yet.</p>}
                  {selected.entries.map(entry => (
                    <ShortlistEntry
                      entry={entry}
                      selected={compareLogins.includes(entry.login)}
                      onSelect={() => setCompareLogins(current => current.includes(entry.login) ? current.filter(loginValue => loginValue !== entry.login) : current.length < 2 ? [...current, entry.login] : current)}
                      onSaveNote={entryNote => mutate('PATCH', { id: selected.id, action: 'note', login: entry.login, note: entryNote })}
                      onRemove={() => mutate('PATCH', { id: selected.id, action: 'remove', login: entry.login })}
                      key={entry.login}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </section>
    </div>
  );
}