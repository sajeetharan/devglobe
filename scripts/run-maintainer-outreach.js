import 'dotenv/config';
import { runMaintainerOutreachSchedule } from '../lib/maintainer-outreach-scheduler.js';

const limitArgument = process.argv.find(argument => argument.startsWith('--limit='));
const requestedLimit = Number.parseInt(limitArgument?.slice('--limit='.length) || '10', 10);
const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 10) : 10;
const summary = await runMaintainerOutreachSchedule({ limit });
console.log(JSON.stringify(summary, null, 2));