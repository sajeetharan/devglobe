import 'dotenv/config';
import {
  getMaintainerOutreachContainer,
  listMaintainerOutreachRecords,
  updateMaintainerOutreachStatus,
} from '../lib/maintainer-outreach-store.js';
import { getMaintainerOutreachReport } from '../lib/maintainer-outreach-scheduler.js';

const [command = 'list', value, actor] = process.argv.slice(2);
const container = getMaintainerOutreachContainer();
if (!container) throw new Error('Cosmos DB is required for the maintainer outreach queue');

if (command === 'list') {
  const records = await listMaintainerOutreachRecords(value, container);
  console.log(JSON.stringify(records.map(record => ({
    login: record.login,
    status: record.status,
    attempt: record.attempt,
    selectedAt: record.selectedAt,
    profileUrl: record.profileUrl,
    message: record.message,
  })), null, 2));
} else if (command === 'report') {
  console.log(JSON.stringify(await getMaintainerOutreachReport({ outreachContainer: container }), null, 2));
} else if (['approve', 'reject', 'sent'].includes(command)) {
  if (!value) throw new Error(`${command} requires a GitHub login`);
  const record = await updateMaintainerOutreachStatus(value, command, actor, container);
  console.log(`${record.login} is now ${record.status} for attempt ${record.attempt}.`);
} else {
  throw new Error('Command must be list, report, approve, reject, or sent');
}