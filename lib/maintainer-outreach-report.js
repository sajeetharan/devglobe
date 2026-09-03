import { sendLifecycleEmail } from './lifecycle-email.js';
import { getMaintainerOutreachReport } from './maintainer-outreach-scheduler.js';

function percentage(numerator, denominator) {
  return denominator ? Math.round((1000 * numerator) / denominator) / 10 : 0;
}

export function buildMaintainerOutreachReportEmail(report) {
  const visitRate = percentage(report.profileViewed, report.contacted);
  const claimRate = percentage(report.claimed, report.contacted);
  const lines = [
    `Selected: ${report.selected}`,
    `Pending review: ${report.pending}`,
    `Approved: ${report.approved}`,
    `Contacted: ${report.contacted}`,
    `Profile viewed: ${report.profileViewed} (${visitRate}%)`,
    `Claimed: ${report.claimed} (${claimRate}%)`,
  ];
  return {
    subject: 'DevGlobe weekly maintainer outreach report',
    text: `DevGlobe maintainer outreach\n\n${lines.join('\n')}\n\nDraft delivery remains manual.`,
    html: `<h1>DevGlobe maintainer outreach</h1><ul>${lines.map(line => `<li>${line}</li>`).join('')}</ul><p>Draft delivery remains manual.</p>`,
  };
}

export async function sendMaintainerOutreachReport({
  now = new Date(),
  recipient = process.env.GROWTH_REPORT_EMAIL?.trim(),
  loadReport = getMaintainerOutreachReport,
  sendEmail = sendLifecycleEmail,
} = {}) {
  const report = await loadReport({ now });
  if (!recipient) return { ...report, reportSent: false, reason: 'missing_recipient' };
  const week = now.toISOString().slice(0, 10);
  const delivery = await sendEmail({
    to: recipient,
    message: buildMaintainerOutreachReportEmail(report),
    idempotencyKey: `maintainer-outreach-report-${week}`,
  });
  return { ...report, reportSent: delivery.sent, reason: delivery.reason || null };
}