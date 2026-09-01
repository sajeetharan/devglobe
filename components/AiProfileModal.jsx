'use client';

import { useEffect, useState } from 'react';

const OPPORTUNITY_LABELS = {
  employment: 'Full-time roles',
  contract: 'Contract work',
  'open-source': 'Open source',
  speaking: 'Speaking',
  mentoring: 'Mentoring',
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};

function expiryFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function expiryDuration(expiresAt) {
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 7 && days > 0) return '7';
  if (days <= 30 && days > 0) return '30';
  return '90';
}

export default function AiProfileModal({ onClose, onSaved }) {
  const [profile, setProfile] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const response = await fetch('/api/ai-profile', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load AI settings');
        if (!cancelled) {
          setProfile(data.profile);
          setOptions(data.options);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProfile();
    return () => { cancelled = true; };
  }, []);

  const selectedTool = id => profile.tools.find(tool => tool.id === id);

  const toggleTool = id => {
    const existing = selectedTool(id);
    setProfile(current => ({
      ...current,
      tools: existing
        ? current.tools.filter(tool => tool.id !== id)
        : [...current.tools, { id, usage: 'regular' }],
    }));
  };

  const updateUsage = (id, usage) => {
    setProfile(current => ({
      ...current,
      tools: current.tools.map(tool => tool.id === id ? { ...tool, usage } : tool),
    }));
  };

  const opportunity = profile?.opportunityPreferences || { enabled: false };

  const setOpportunity = changes => {
    setProfile(current => ({
      ...current,
      opportunityPreferences: { ...(current.opportunityPreferences || { enabled: false }), ...changes },
    }));
  };

  const enableOpportunities = enabled => {
    setProfile(current => ({
      ...current,
      visibility: enabled ? 'public' : current.visibility,
      acceptsAgentRequests: enabled ? true : current.acceptsAgentRequests,
      contactPolicy: enabled ? 'verified-agents' : current.contactPolicy,
      opportunityPreferences: enabled ? {
        enabled: true,
        types: current.opportunityPreferences?.types?.length ? current.opportunityPreferences.types : ['employment'],
        roles: current.opportunityPreferences?.roles || [],
        locations: current.opportunityPreferences?.locations || [],
        workModes: current.opportunityPreferences?.workModes?.length ? current.opportunityPreferences.workModes : ['remote'],
        expiresAt: expiryFromNow(30),
      } : { enabled: false },
    }));
  };

  const toggleOpportunityValue = (field, value) => {
    const values = opportunity[field] || [];
    setOpportunity({ [field]: values.includes(value) ? values.filter(item => item !== value) : [...values, value] });
  };

  const updateTextList = (field, value) => {
    setOpportunity({ [field]: value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 10) });
  };

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/ai-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save AI settings');
      onSaved(data.profile.visibility === 'public' ? data.profile : null, data.profile);
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ai-profile-modal__backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="ai-profile-modal" role="dialog" aria-modal="true" aria-labelledby="ai-profile-title">
        <button type="button" className="ai-profile-modal__close" onClick={onClose} aria-label="Close AI collaboration settings">&times;</button>
        <span className="ai-profile-modal__eyebrow">CONSENT-BASED DISCOVERY</span>
        <h2 id="ai-profile-title">AI collaboration settings</h2>
        <p className="ai-profile-modal__intro">Share the tools you use and decide whether verified agents may request an introduction.</p>

        {loading && <div className="ai-profile-modal__status">Loading settings...</div>}
        {!loading && error && !profile && <div className="ai-profile-modal__error">{error}</div>}

        {profile && options && (
          <form onSubmit={save}>
            <fieldset className="ai-profile-modal__fieldset">
              <legend>AI tools</legend>
              <p>Public tool selections are shown as self-declared.</p>
              <div className="ai-profile-modal__tools">
                {options.tools.map(tool => {
                  const selected = selectedTool(tool.id);
                  return (
                    <div className={`ai-tool-option${selected ? ' ai-tool-option--selected' : ''}`} key={tool.id}>
                      <label>
                        <input type="checkbox" checked={Boolean(selected)} onChange={() => toggleTool(tool.id)} />
                        <span>{tool.name}</span>
                      </label>
                      {selected && (
                        <select value={selected.usage} onChange={event => updateUsage(tool.id, event.target.value)} aria-label={`${tool.name} usage level`}>
                          {options.usageLevels.map(level => <option value={level} key={level}>{level}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="ai-profile-modal__fieldset">
              <legend>Visibility and contact</legend>
              <label className="ai-profile-modal__row">
                <span><strong>Public AI profile</strong><small>Show these self-declared tools on your DevGlobe profile.</small></span>
                <input type="checkbox" checked={profile.visibility === 'public'} onChange={event => setProfile(current => ({ ...current, visibility: event.target.checked ? 'public' : 'private' }))} />
              </label>
              <label className="ai-profile-modal__row">
                <span><strong>Accept agent requests</strong><small>Allow verified agents to request an introduction. Contact details remain private.</small></span>
                <input
                  type="checkbox"
                  checked={profile.acceptsAgentRequests}
                  onChange={event => setProfile(current => ({
                    ...current,
                    acceptsAgentRequests: event.target.checked,
                    contactPolicy: event.target.checked ? 'verified-agents' : 'nobody',
                  }))}
                />
              </label>
            </fieldset>

            <fieldset className="ai-profile-modal__fieldset">
              <legend>Opportunity agent</legend>
              <p>Let verified agents find you for relevant opportunities. Every introduction still requires your approval.</p>
              <label className="ai-profile-modal__row">
                <span><strong>Open to opportunities</strong><small>Publishes these preferences until they expire. Private contact details are never shared.</small></span>
                <input type="checkbox" checked={opportunity.enabled} onChange={event => enableOpportunities(event.target.checked)} />
              </label>

              {opportunity.enabled && (
                <div className="opportunity-editor">
                  <div className="opportunity-editor__group">
                    <strong>Opportunity types</strong>
                    <div className="opportunity-editor__choices">
                      {options.opportunityTypes.map(type => (
                        <label key={type}>
                          <input type="checkbox" checked={opportunity.types?.includes(type) || false} onChange={() => toggleOpportunityValue('types', type)} />
                          <span>{OPPORTUNITY_LABELS[type]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="opportunity-editor__field">
                    <strong>Desired roles or keywords</strong>
                    <input type="text" value={(opportunity.roles || []).join(', ')} onChange={event => updateTextList('roles', event.target.value)} placeholder="Staff engineer, TypeScript, Azure" />
                    <small>Separate up to 10 values with commas.</small>
                  </label>

                  <div className="opportunity-editor__group">
                    <strong>Work modes</strong>
                    <div className="opportunity-editor__choices">
                      {options.opportunityWorkModes.map(mode => (
                        <label key={mode}>
                          <input type="checkbox" checked={opportunity.workModes?.includes(mode) || false} onChange={() => toggleOpportunityValue('workModes', mode)} />
                          <span>{OPPORTUNITY_LABELS[mode]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="opportunity-editor__field">
                    <strong>Preferred locations</strong>
                    <input type="text" value={(opportunity.locations || []).join(', ')} onChange={event => updateTextList('locations', event.target.value)} placeholder="Colombo, London" />
                    <small>Optional for remote-only opportunities.</small>
                  </label>

                  <label className="opportunity-editor__field">
                    <strong>Keep this signal active for</strong>
                    <select value={expiryDuration(opportunity.expiresAt)} onChange={event => setOpportunity({ expiresAt: expiryFromNow(Number(event.target.value)) })}>
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                    </select>
                  </label>
                </div>
              )}
            </fieldset>

            {error && <div className="ai-profile-modal__error">{error}</div>}
            <div className="ai-profile-modal__actions">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn ai-profile-modal__save" disabled={saving}>{saving ? 'Saving...' : 'Save settings'}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
