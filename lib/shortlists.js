import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { normalizeDeveloperFollow } from './watchlist-store.js';

export const MAX_SHORTLISTS = 20;
export const MAX_SHORTLIST_ENTRIES = 50;

function requiredText(value, label, maximum) {
  const text = String(value || '').trim();
  if (!text || text.length > maximum) throw new Error(`${label} must be between 1 and ${maximum} characters`);
  return text;
}

function shortlistIndex(shortlists, id) {
  const index = (shortlists || []).findIndex(shortlist => shortlist.id === id);
  if (index < 0) throw new Error('Shortlist not found');
  return index;
}

export function hashShortlistShareToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function createShortlist(shortlists, input, {
  id = randomUUID(),
  now = new Date().toISOString(),
} = {}) {
  const current = Array.isArray(shortlists) ? shortlists : [];
  if (current.length >= MAX_SHORTLISTS) throw new Error(`Shortlist limit is ${MAX_SHORTLISTS}`);
  const name = requiredText(input?.name, 'Shortlist name', 80);
  if (current.some(shortlist => shortlist.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('A shortlist with that name already exists');
  }
  return [...current, { id, name, entries: [], createdAt: now, updatedAt: now }];
}

export function updateShortlist(shortlists, input, {
  now = new Date().toISOString(),
  createShareToken = () => randomBytes(24).toString('base64url'),
} = {}) {
  const index = shortlistIndex(shortlists, input?.id);
  const shortlist = structuredClone(shortlists[index]);
  const action = input?.action;
  let shareToken;

  if (action === 'rename') {
    const name = requiredText(input.name, 'Shortlist name', 80);
    if (shortlists.some((entry, entryIndex) => entryIndex !== index && entry.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('A shortlist with that name already exists');
    }
    shortlist.name = name;
  } else if (action === 'add') {
    const login = normalizeDeveloperFollow(input.login);
    if (shortlist.entries.some(entry => entry.login === login)) throw new Error('Developer is already in this shortlist');
    if (shortlist.entries.length >= MAX_SHORTLIST_ENTRIES) throw new Error(`Shortlist developer limit is ${MAX_SHORTLIST_ENTRIES}`);
    shortlist.entries.push({ login, note: String(input.note || '').trim().slice(0, 500), addedAt: now });
  } else if (action === 'note') {
    const login = normalizeDeveloperFollow(input.login);
    const entry = shortlist.entries.find(candidate => candidate.login === login);
    if (!entry) throw new Error('Developer is not in this shortlist');
    entry.note = String(input.note || '').trim().slice(0, 500);
  } else if (action === 'remove') {
    const login = normalizeDeveloperFollow(input.login);
    shortlist.entries = shortlist.entries.filter(entry => entry.login !== login);
  } else if (action === 'share') {
    shareToken = createShareToken();
    shortlist.share = { tokenHash: hashShortlistShareToken(shareToken), createdAt: now };
  } else if (action === 'unshare') {
    delete shortlist.share;
  } else {
    throw new Error('Unsupported shortlist action');
  }

  shortlist.updatedAt = now;
  const updated = [...shortlists];
  updated[index] = shortlist;
  return { shortlists: updated, shareToken };
}

export function deleteShortlist(shortlists, id) {
  shortlistIndex(shortlists, id);
  return shortlists.filter(shortlist => shortlist.id !== id);
}

export function ownerShortlistView(shortlists) {
  return (shortlists || []).map(({ share, ...shortlist }) => ({
    ...shortlist,
    shared: Boolean(share?.tokenHash),
  }));
}

export function findSharedShortlist(shortlists, token) {
  const tokenHash = hashShortlistShareToken(token);
  const candidateHash = Buffer.from(tokenHash, 'hex');
  const shortlist = (shortlists || []).find(candidate => {
    if (!/^[a-f\d]{64}$/i.test(candidate.share?.tokenHash || '')) return false;
    return timingSafeEqual(Buffer.from(candidate.share.tokenHash, 'hex'), candidateHash);
  });
  if (!shortlist) return null;
  const { share, ...publicShortlist } = shortlist;
  return publicShortlist;
}