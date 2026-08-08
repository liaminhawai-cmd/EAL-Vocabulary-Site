// Local-first data store.
//
// Everything works offline against localStorage. When a Supabase user is set,
// writes are ALSO pushed to the cloud so progress follows the student across
// devices and the teacher can see the log. Reads stay local (fast + offline);
// cloud data is merged in once at login.

import * as cloud from './supabase.js';

const LS_PREFIX = 'ealvocab';

let userId = 'guest';
let state = { collection: {}, log: [], prefs: {} };
const listeners = new Set();

function lsKey() {
  return `${LS_PREFIX}:${userId}`;
}

function load() {
  try {
    const raw = localStorage.getItem(lsKey());
    state = raw ? JSON.parse(raw) : { collection: {}, log: [], prefs: {} };
  } catch (_) {
    state = { collection: {}, log: [], prefs: {} };
  }
  if (!state.collection) state.collection = {};
  if (!state.log) state.log = [];
  if (!state.prefs) state.prefs = {};
}

function save() {
  try {
    localStorage.setItem(lsKey(), JSON.stringify(state));
  } catch (_) {}
  emit();
}

function emit() {
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function wordKey(path, word) {
  return `${path}::${word}`;
}

// --- session identity ------------------------------------------------------
export async function setUser(user) {
  userId = user ? user.id : 'guest';
  load();
  if (user) {
    try {
      const rows = await cloud.pullCollection(user.id);
      mergeCloud(rows);
      save();
    } catch (e) {
      console.warn('cloud pull failed, staying local', e);
    }
  } else {
    emit();
  }
}

function mergeCloud(rows) {
  for (const r of rows) {
    const existing = state.collection[r.word_key];
    const cloudItem = {
      key: r.word_key,
      path: r.path || (r.word_key || '').split('::')[0],
      word: r.word,
      box: r.box,
      reps: r.reps,
      lapses: r.lapses,
      streak: r.streak != null ? r.streak : (existing ? existing.streak || 0 : 0),
      mastered: r.mastered,
      lastTranslation: r.last_translation || '',
      addedAt: existing ? existing.addedAt : r.updated_at,
      updatedAt: r.updated_at,
    };
    // keep whichever was updated most recently
    if (!existing || new Date(r.updated_at) >= new Date(existing.updatedAt || 0)) {
      state.collection[r.word_key] = cloudItem;
    }
  }
}

// --- prefs -----------------------------------------------------------------
export function getPref(k, fallback) {
  return k in state.prefs ? state.prefs[k] : fallback;
}
export function setPref(k, v) {
  state.prefs[k] = v;
  save();
}

// --- collection ------------------------------------------------------------
export function getCollection() {
  return Object.values(state.collection);
}
export function getItem(key) {
  return state.collection[key] || null;
}

export function addToCollection(path, word, meta = {}) {
  const key = wordKey(path, word);
  if (!state.collection[key]) {
    state.collection[key] = {
      key,
      path,
      word,
      box: 1,
      reps: 0,
      lapses: 0,
      streak: 0,
      mastered: false,
      lastTranslation: meta.lastTranslation || '',
      addedAt: nowISO(),
      updatedAt: nowISO(),
    };
    logEvent({ action: 'learned', key, word, subject: path });
    syncItem(key);
    save();
  } else if (meta.lastTranslation) {
    state.collection[key].lastTranslation = meta.lastTranslation;
    state.collection[key].updatedAt = nowISO();
    syncItem(key);
    save();
  }
  return state.collection[key];
}

// How many in-a-row correct answers before we suggest a word is mastered.
export const MASTERY_STREAK = 3;

// Leitner review. correct -> advance a box + grow the success streak; a wrong
// answer drops it back to box 1 and breaks the streak. 5 boxes -> auto-mastered.
export function reviewItem(key, correct) {
  const it = state.collection[key];
  if (!it) return;
  it.reps += 1;
  if (correct) {
    it.streak = (it.streak || 0) + 1;
    it.box = Math.min(it.box + 1, 5);
    if (it.box >= 5) {
      it.mastered = true;
      logEvent({ action: 'mastered', key, word: it.word, subject: it.path });
    }
    logEvent({ action: 'review_correct', key, word: it.word, subject: it.path });
  } else {
    it.streak = 0;
    it.box = 1;
    it.lapses += 1;
    it.mastered = false;
    logEvent({ action: 'review_wrong', key, word: it.word, subject: it.path });
  }
  it.updatedAt = nowISO();
  syncItem(key);
  save();
  return it;
}

// The three learning bins a word can sit in, derived from its Leitner box and
// mastered flag: fresh/struggling words are 'learning', words that are sticking
// are 'consolidating', and finished ones are 'mastered' (out of revision).
export function binOf(it) {
  if (it.mastered) return 'mastered';
  return (it.box || 1) >= 3 ? 'consolidating' : 'learning';
}
export const BINS = ['learning', 'consolidating', 'mastered'];

// Manually move a word between bins. 'mastered' takes it out of revision;
// the other two put it back in, at a box that matches the bin.
export function moveToBin(key, bin) {
  const it = state.collection[key];
  if (!it) return;
  if (bin === 'mastered') {
    it.mastered = true;
    logEvent({ action: 'mastered', key, word: it.word, subject: it.path });
  } else if (bin === 'consolidating') {
    it.mastered = false;
    it.box = 3;
  } else { // learning
    it.mastered = false;
    it.box = 1;
    it.streak = 0;
  }
  it.updatedAt = nowISO();
  syncItem(key);
  save();
  return it;
}

// The collection grouped into the three bins.
export function bins() {
  const by = { learning: [], consolidating: [], mastered: [] };
  for (const it of getCollection()) by[binOf(it)].push(it);
  return by;
}

// Words still in active rotation (added, not yet mastered).
export function dueForReview() {
  return getCollection()
    .filter((it) => !it.mastered)
    .sort((a, b) => a.box - b.box || a.reps - b.reps);
}

// --- log -------------------------------------------------------------------
export function getLog() {
  return state.log.slice().reverse(); // newest first
}
export function logEvent(ev) {
  const entry = { ...ev, at: nowISO() };
  state.log.push(entry);
  if (state.log.length > 1000) state.log = state.log.slice(-1000);
  if (userId !== 'guest') cloud.logEvent(userId, ev).catch(() => {});
}

// --- stats -----------------------------------------------------------------
export function stats() {
  const items = getCollection();
  return {
    total: items.length,
    mastered: items.filter((i) => i.mastered).length,
    learning: items.filter((i) => !i.mastered).length,
    reviews: items.reduce((n, i) => n + i.reps, 0),
  };
}

// --- streak (consecutive local days with any activity) ---------------------
function localDayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function streak() {
  const days = new Set();
  for (const e of state.log) {
    if (e.at) days.add(localDayKey(new Date(e.at)));
  }
  if (!days.size) return { current: 0, best: 0, today: false };
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  const todayKey = localDayKey(now);
  const yKey = localDayKey(new Date(now.getTime() - 86400000));
  const today = days.has(todayKey);
  // Current run: walk back a day at a time from today (or yesterday, so a streak
  // stays alive until the day is actually missed) while each day was active.
  let current = 0;
  if (today || days.has(yKey)) {
    let cursor = midnight(today ? now : new Date(now.getTime() - 86400000));
    while (days.has(localDayKey(cursor))) {
      current++;
      cursor = new Date(cursor.getTime() - 86400000);
    }
  }
  // Best run across all recorded days.
  const sorted = [...days].sort();
  let best = 0, run = 0, prev = null;
  for (const k of sorted) {
    const t = new Date(k + 'T00:00:00').getTime();
    run = (prev !== null && t - prev === 86400000) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { current, best, today };
}

// Per-subject mastery, newest activity first — for the progress dashboard.
export function masteryBySubject() {
  const by = {};
  for (const it of getCollection()) {
    const subj = (it.path || '').split('/').slice(0, 2).join('/');
    const b = (by[subj] = by[subj] || { subject: subj, total: 0, mastered: 0, learning: 0 });
    b.total += 1;
    if (it.mastered) b.mastered += 1; else b.learning += 1;
  }
  return Object.values(by).sort((a, b) => b.total - a.total);
}

function syncItem(key) {
  if (userId === 'guest') return;
  const it = state.collection[key];
  if (it) cloud.pushCollectionItem(userId, it).catch(() => {});
}

function nowISO() {
  return new Date().toISOString();
}

load();
