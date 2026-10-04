'use client';

import { useState } from 'react';
import { contributionReminder, reminderPreset } from '../lib/contribution-passport.js';
import { track } from '../lib/analytics.js';
import styles from './ContributionPassport.module.css';

export default function ContributionReminder({ opportunity }) {
  const [choice, setChoice] = useState('none');
  const [when, setWhen] = useState('');
  const [message, setMessage] = useState('');

  function download(event) {
    event.preventDefault();
    let objectUrl;
    try {
      const date = choice === 'custom' ? new Date(when) : reminderPreset(choice);
      const calendar = contributionReminder(opportunity, date);
      objectUrl = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'devglobe-contribution-reminder.ics';
      anchor.click();
      setMessage('Calendar file downloaded. Import it into your calendar to enable the reminder. Edit or remove it there; DevGlobe cannot cancel imported events.');
      track('mission_reminder_downloaded', { journey: 'contribution_passport', action: choice });
    } catch (error) {
      setMessage(error.message);
    } finally {
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  }

  return (
    <form className={styles.reminder} onSubmit={download}>
      <label>
        When would you like to continue?
        <select value={choice} onChange={event => { setChoice(event.target.value); setMessage(''); }}>
          <option value="none">No reminder</option>
          <option value="tomorrow">Tomorrow, around this time</option>
          <option value="weekend">Next Saturday at 9 AM</option>
          <option value="custom">Choose a time</option>
        </select>
      </label>
      {choice === 'custom' && (
        <label>Your local reminder time<input type="datetime-local" required value={when} onChange={event => setWhen(event.target.value)} /></label>
      )}
      {choice !== 'none' && <button type="submit">Download calendar reminder</button>}
      <p>No email or push notifications. Your calendar handles reminders; recheck issue availability before continuing.</p>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
