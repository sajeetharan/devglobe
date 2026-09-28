import {
  VERIFICATION_REMINDER_INTERVAL_MS,
  claimEmailDelivery,
  completeEmailDelivery,
  createEmailVerification,
  isVerificationReminderDue,
  iterateVerificationReminderContacts,
  recordEmailVerificationReminder,
  releaseEmailDelivery,
} from './developer-contact-store.js';
import { buildEmailVerificationEmail, sendLifecycleEmail } from './lifecycle-email.js';

export async function sendEmailVerificationReminders(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const sentAt = now.toISOString();
  const dateKey = sentAt.slice(0, 10);
  const contacts = options.contacts || iterateVerificationReminderContacts({
    container: options.contactsContainer,
    now,
  });
  const createVerification = options.createVerification || (login => createEmailVerification(login, {
    container: options.contactsContainer,
    now,
  }));
  const sendEmail = options.sendEmail || sendLifecycleEmail;
  const recordDelivery = options.recordDelivery || ((login, delivery) => recordEmailVerificationReminder(login, delivery, {
    container: options.contactsContainer,
  }));
  const injectedContacts = options.contacts !== undefined;
  const claimDelivery = options.claimDelivery || (injectedContacts
    ? async delivery => ({ claimed: true, deliveryKey: delivery.deliveryKey })
    : delivery => claimEmailDelivery(delivery, { container: options.contactsContainer, now }));
  const completeDelivery = options.completeDelivery || (injectedContacts
    ? async () => ({ completed: true })
    : (claim, delivery) => completeEmailDelivery(claim, delivery, { container: options.contactsContainer }));
  const releaseDelivery = options.releaseDelivery || (injectedContacts
    ? async () => ({ released: true })
    : claim => releaseEmailDelivery(claim, { container: options.contactsContainer }));
  const summary = { scanned: 0, eligible: 0, sent: 0, skipped: 0, suppressed: 0, failed: 0 };

  for await (const contact of contacts) {
    summary.scanned += 1;
    if (!isVerificationReminderDue(contact, now)) {
      summary.skipped += 1;
      continue;
    }
    summary.eligible += 1;

    let claim;
    try {
      claim = await claimDelivery({
        campaign: 'verification-reminder',
        deliveryKey: dateKey,
        recipient: contact.email,
        minimumIntervalMs: VERIFICATION_REMINDER_INTERVAL_MS,
      });
      if (!claim.claimed) {
        summary.skipped += 1;
        summary.suppressed += 1;
        continue;
      }
      const verification = await createVerification(contact.login);
      if (!verification.created) {
        await releaseDelivery(claim).catch(() => {});
        summary.skipped += 1;
        continue;
      }
      const delivery = await sendEmail({
        to: verification.email,
        message: buildEmailVerificationEmail({
          login: contact.login,
          token: verification.token,
          reminder: true,
        }),
        idempotencyKey: `email-verification-reminder-${contact.id}-${dateKey}`,
      });
      if (!delivery.sent) {
        await releaseDelivery(claim).catch(() => {});
        summary.failed += 1;
        continue;
      }
      const completion = await completeDelivery(claim, { deliveredAt: sentAt });
      if (!completion.completed) throw new Error('Email delivery claim could not be completed');
      summary.sent += 1;
      try {
        await recordDelivery(contact.login, { sentAt, providerId: delivery.id || null });
      } catch {
        summary.failed += 1;
      }
    } catch {
      if (claim?.claimed) await releaseDelivery(claim).catch(() => {});
      summary.failed += 1;
    }
  }

  return summary;
}