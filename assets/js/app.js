import * as store from './store.js';
import * as sb from './supabase.js';
import * as speech from './speech.js';

// ---------------------------------------------------------------------------
// tiny DOM helper
// ---------------------------------------------------------------------------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
const $app = () => document.getElementById('app');

// Append children to an element, skipping null/false/undefined (which native
// .append() would otherwise stringify into stray "false" text nodes).
function add(parent, ...children) {
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    parent.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return parent;
}

// ---------------------------------------------------------------------------
// state + lookups
// ---------------------------------------------------------------------------
let DATA = null;
let currentUser = null;
// When set (a Set of "path::word" keys), the revision drill is restricted to
// just those words — used by the "pick subjects/units" screen and by
// "drill this morpheme family". Cleared whenever /drill is opened without the
// ?scope=1 flag (e.g. the plain nav link), so the default drill stays global.
let DRILL_SCOPE = null;

// Which drill ladder rungs a student wants in rotation — set on the Pick
// page (drillModeSettings). Default is everything on; the common case for
// turning one off is a student who isn't confident enough in their home
// language yet for the "home gloss → English" mode (rung 1), but any rung
// can be toggled. A brand-new word's FIRST attempt still always forces build
// (see renderDrill) — that's the intro mechanic, not a review rung, so it
// isn't gated by this.
const RUNG_LABELS = {
  1: 'Home language → English word',
  2: 'Definition → English word',
  3: 'Fix the wrong part',
  4: 'Build from parts',
  5: 'Type the word',
};
function drillRungPrefs() {
  const saved = store.getPref('drillRungs', null);
  return { 1: true, 2: true, 3: true, 4: true, 5: true, ...(saved || {}) };
}
function setDrillRungPref(rung, on) {
  const cur = drillRungPrefs();
  cur[rung] = on;
  if (![1, 2, 3, 4, 5].some((r) => cur[r])) cur[rung] = true; // always leave one on
  store.setPref('drillRungs', cur);
  return cur;
}

// 'other' is a picker option meaning "my language isn't listed" — it should
// never itself become the stored/displayed language (see promptOtherLanguage).
// Guard here too in case a stale value ever ends up in storage.
function getLang() {
  const v = store.getPref('lang', 'zh-Hans');
  return v === 'other' ? 'zh-Hans' : v;
}
function langLabel(code) {
  const l = (DATA.languages || []).find((x) => x.code === code);
  return l ? l.label : code;
}
// Prefer the student's chosen language; fall back to whatever is available
// rather than showing a blank cell (not every morpheme has every language).
function pickTranslation(translations, lang) {
  if (!translations) return '';
  if (translations[lang]) return translations[lang];
  // Simplified and Traditional Chinese are the same language in different
  // scripts. A legacy source list may carry only one; prefer that over
  // silently falling through to an unrelated language.
  if (lang === 'zh-Hans' && translations['zh-Hant']) return translations['zh-Hant'];
  if (lang === 'zh-Hant' && translations['zh-Hans']) return translations['zh-Hans'];
  const keys = Object.keys(translations).filter((k) => k !== 'other');
  return keys.length ? translations[keys[0]] : (translations.other || '');
}
// Strict pick: the chosen language ONLY (Simplified/Traditional Chinese count as
// the same language, different script). No fall-through to some other language —
// that per-morpheme fall-through is what made a bank read as a mix of whatever
// happened to be available (e.g. Vietnamese on one row, Farsi on the next).
function pickExact(translations, lang) {
  if (!translations) return '';
  if (translations[lang]) return translations[lang];
  if (lang === 'zh-Hans' && translations['zh-Hant']) return translations['zh-Hant'];
  if (lang === 'zh-Hant' && translations['zh-Hans']) return translations['zh-Hans'];
  return '';
}
// One language for a whole set of morpheme meanings: the student's choice if it
// appears at all, otherwise the most common language present — so meanings read
// consistently in ONE language instead of a per-morpheme mix.
function displayLangFor(dicts, lang) {
  const counts = {};
  for (const t of dicts) for (const code of Object.keys(t || {})) {
    if (code === 'other') continue;
    if (code === lang) return lang; // student's language is present
    counts[code] = (counts[code] || 0) + 1;
  }
  if (lang === 'zh-Hans' && counts['zh-Hant']) return 'zh-Hant';
  if (lang === 'zh-Hant' && counts['zh-Hans']) return 'zh-Hans';
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length ? sorted[0][0] : lang;
}
function unitDisplayLang(unit, lang) {
  const dicts = [];
  for (const w of (unit.words || [])) for (const p of (w.parts || [])) dicts.push(p.translations);
  return displayLangFor(dicts, lang);
}
// translations dict -> entries with the chosen language first
function orderedTranslations(translations, lang) {
  const entries = Object.entries(translations || {});
  entries.sort((a, b) => (a[0] === lang ? -1 : b[0] === lang ? 1 : 0));
  return entries;
}
function levelById(id) { return DATA.levels.find((l) => l.id === id); }
function subjectById(level, id) { return level && level.subjects.find((s) => s.id === id); }
function unitById(subject, id) { return subject && subject.units.find((u) => u.id === id); }
function folderById(subject, id) {
  return subject && (subject.folders || []).find((folder) => folder.id === id);
}
function folderUnits(subject, folder) {
  if (!subject || !folder) return [];
  const byId = new Map(subject.units.map((unit) => [unit.id, unit]));
  const listed = (folder.unitIds || []).map((id) => byId.get(id)).filter(Boolean);
  return listed.length ? listed : subject.units.filter((unit) => unit.folderId === folder.id);
}
function folderForUnit(subject, unit) {
  if (!subject || !unit) return null;
  if (unit.folderId) {
    const direct = folderById(subject, unit.folderId);
    if (direct) return direct;
  }
  return (subject.folders || []).find((folder) => (folder.unitIds || []).includes(unit.id)) || null;
}
function folderHref(level, subject, folder) {
  return `#/l/${level.id}/${subject.id}/f/${folder.id}`;
}
function unitParentHref(level, subject, unit) {
  const folder = folderForUnit(subject, unit);
  return folder ? folderHref(level, subject, folder) : `#/l/${level.id}/${subject.id}`;
}
function unitCrumbItems(level, subject, unit) {
  const items = [['Home', '#/'], [level.name, `#/l/${level.id}`],
    [subject.name, `#/l/${level.id}/${subject.id}`]];
  const folder = folderForUnit(subject, unit);
  if (folder) items.push([folder.name, folderHref(level, subject, folder)]);
  items.push([unit.name, null]);
  return items;
}

function resolvePath(path) {
  // path = "level/subject/unit"
  const [lid, sid, uid] = (path || '').split('/');
  const level = levelById(lid);
  const subject = subjectById(level, sid);
  const unit = unitById(subject, uid);
  return { level, subject, unit };
}

function subjectWordCount(s) { return s.units.reduce((n, u) => n + u.words.length, 0); }

// Aggregate progress across a unit's words, for the level/subject browse
// cards. null = not started at all; otherwise the WEAKEST bin present is the
// unit's overall status — a topic with even one still-learning word isn't
// "Consolidating" yet — so a glance at the folder tells you what still needs
// foundational work vs what's basically locked in.
const PROGRESS_LABEL = { learning: 'Learning', consolidating: 'Consolidating', mastered: 'Mastered' };
function unitProgress(u) {
  const items = u.words.map((w) => store.getItem(store.wordKey(u.path, w.word))).filter(Boolean);
  if (!items.length) return null;
  const bins = items.map((it) => store.binOf(it));
  const status = bins.includes('learning') ? 'learning'
    : bins.includes('consolidating') ? 'consolidating'
    : 'mastered';
  return { started: items.length, total: u.words.length, status };
}
function folderProgress(units) {
  const totalWords = units.reduce((total, unit) => total + unit.words.length, 0);
  let startedWords = 0, startedUnits = 0, masteredUnits = 0;
  for (const unit of units) {
    const progress = unitProgress(unit);
    if (!progress) continue;
    startedWords += progress.started;
    startedUnits++;
    if (progress.status === 'mastered' && progress.started === progress.total) masteredUnits++;
  }
  return { totalWords, startedWords, startedUnits, masteredUnits };
}
// Per-subject roll-up for the level page: how many topics have any progress,
// and how many are fully mastered. null when the student hasn't touched
// anything in this subject yet (nothing to show).
function subjectProgress(sub) {
  let started = 0, masteredUnits = 0;
  for (const u of sub.units) {
    const p = unitProgress(u);
    if (!p) continue;
    started++;
    if (p.status === 'mastered' && p.started === p.total) masteredUnits++;
  }
  return started ? { started, masteredUnits } : null;
}

// ---------------------------------------------------------------------------
// morpheme families — every word (across all units) that shares a morpheme
// ---------------------------------------------------------------------------
// Mirror of tools/translation_memory.norm_meaning so the family key computed in
// the browser matches the one baked into data/vocab.json at build time.
function normMeaning(m) {
  return (m || '').trim().toLowerCase()
    .replace(/\s*[/;,]\s*/g, '/').replace(/\s+/g, ' ').replace(/^[/ ]+|[/ ]+$/g, '');
}
function famKeyFor(part) {
  const surf = (part.surface || '').trim().toLowerCase();
  const nm = normMeaning(part.meaning);
  return nm ? `${surf}|${nm}` : null;
}
function morphemeFamily(part) {
  const key = famKeyFor(part);
  const fams = (DATA && DATA.morpheme_families) || {};
  return key ? fams[key] || null : null;
}
// Bold the shared morpheme inside a whole word, e.g. photo → **photo**synthesis.
function highlightMorph(word, surface) {
  const i = surface ? word.toLowerCase().indexOf(surface.toLowerCase()) : -1;
  if (i < 0) return h('span', {}, word);
  return h('span', {},
    word.slice(0, i),
    h('b', { class: 'mo-hit' }, word.slice(i, i + surface.length)),
    word.slice(i + surface.length));
}
// Only roots and prefixes carry meaning that transfers between words, so only
// they open a family. Suffixes (-ation, -ic, -al…) are grammatical glue: they
// still render as coloured chips (the word's full breakdown stays visible) but
// aren't tappable — their families are huge and low-insight.
const FAMILY_TYPES = new Set(['root', 'prefix']);
// A morpheme's literal spelling here sometimes differs from its familiar
// dictionary form — a silent letter drops before a vowel suffix ("create" →
// "creat-or"), a prefix's final consonant assimilates to the next sound
// ("con-" → "col-laborate"), a doubled vowel reduces (haplology: "bio-" →
// "-bic" in "aerobic"). part.variant carries that familiar form when it
// differs; this renders the literal surface plus a small muted hint of the
// change, so the "wrong-looking" spelling reads as taught, not as a typo.
function spellingChip(part) {
  const surf = part.surface;
  const variant = part.variant;
  if (!variant || variant.toLowerCase() === surf.toLowerCase()) return [surf];
  const a = surf.toLowerCase(), b = variant.toLowerCase();
  let lcp = 0;
  while (lcp < a.length && lcp < b.length && a[lcp] === b[lcp]) lcp++;
  if (surf.length === lcp && variant.length > lcp) {
    // the surface is a strict prefix of the familiar form: letters were
    // dropped right here — show them struck through, right after the chip.
    return [surf, h('span', { class: 'mo-drop', title: `usually spelt "${variant}"` }, variant.slice(lcp))];
  }
  // any other change (assimilation, substitution): note the familiar form.
  return [surf, h('span', { class: 'mo-was', title: `usually spelt "${variant}"` }, `≈${variant}`)];
}
// A morpheme chip. Coloured by type; roots/prefixes with a family are tappable.
function morphemeChip(part, extraCls = '') {
  const fam = FAMILY_TYPES.has(part.type) ? morphemeFamily(part) : null;
  if (!fam) {
    return h('span', { class: `mo-chip ${part.type || ''} ${extraCls}`.trim(), title: part.surface }, ...spellingChip(part));
  }
  return h('button', {
    type: 'button',
    class: `mo-chip ${part.type || ''} has-fam ${extraCls}`.trim(),
    title: `See ${fam.words.length} words with “${part.surface}”`,
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); openMorphemePanel(part); },
  }, ...spellingChip(part));
}
function closeOverlay(o) { o.remove(); }
function openMorphemePanel(part) {
  const fam = morphemeFamily(part);
  const overlay = h('div', { class: 'modal-overlay' });
  overlay.onclick = (e) => { if (e.target === overlay) closeOverlay(overlay); };
  const meaning = part.meaning || (fam && fam.meaning) || '';
  const typeLabel = { prefix: 'prefix', root: 'root', suffix: 'suffix' }[part.type] || '';
  const head = h('div', { class: 'mo-panel-head' },
    h('span', { class: `mo-chip ${part.type || ''} lg` }, ...spellingChip(part)),
    h('div', {},
      h('div', { class: 'mo-panel-meaning' }, meaning || '—'),
      typeLabel && h('div', { class: 'muted small' }, typeLabel)));

  const body = h('div', { class: 'mo-panel-body' });
  if (!fam) {
    add(body, h('p', { class: 'muted' },
      `“${part.surface}” only appears in this word so far — no family to show yet.`));
  } else {
    const words = fam.words;
    const CAP = 40;
    add(body, h('p', { class: 'muted small' },
      `${words.length} word${words.length === 1 ? '' : 's'} share this ${typeLabel || 'piece'}:`));
    const list = h('div', { class: 'mo-fam-list' });
    for (const [wtext, path, surf] of words.slice(0, CAP)) {
      const { level, subject, unit } = resolvePath(path);
      const tag = subject ? `${subject.name}${unit ? ' · ' + unit.name : ''}` : path;
      add(list, h('a', {
        class: 'mo-fam-row',
        href: unit ? `#/browse/${path}` : '#/',
        onclick: () => closeOverlay(overlay),
      },
        h('span', { class: 'mo-fam-word' }, highlightMorph(wtext, surf), say(wtext)),
        h('span', { class: 'mo-fam-tag muted small' }, tag)));
    }
    add(body, list);
    if (words.length > CAP) add(body, h('p', { class: 'muted small' }, `…and ${words.length - CAP} more`));
    add(body, h('button', {
      class: 'btn primary full',
      onclick: () => { closeOverlay(overlay); startFamilyDrill(fam); },
    }, `Drill these ${Math.min(words.length, CAP)} words →`));
  }

  overlay.append(h('div', { class: 'card mo-panel' },
    head,
    body,
    h('div', { class: 'row gap end' },
      h('button', { class: 'btn ghost', onclick: () => closeOverlay(overlay) }, 'Close'))));
  document.body.append(overlay);
}

// ---------------------------------------------------------------------------
// scoped drills — seed the chosen words, then open /drill restricted to them
// ---------------------------------------------------------------------------
function startScopedDrill(pairs) {
  // pairs: [[path, word], ...] — add each to the collection (idempotent) so it
  // becomes due, then restrict the drill to exactly this set.
  const keys = new Set();
  for (const [path, word] of pairs) {
    store.addToCollection(path, word);
    keys.add(store.wordKey(path, word));
  }
  DRILL_SCOPE = keys;
  window.location.hash = '#/drill?scope=1';
}
function startFamilyDrill(fam) {
  startScopedDrill(fam.words.slice(0, 40).map(([w, path]) => [path, w]));
}
// The drill's working pool.
//  - unscoped (plain "drill everything"): the words currently due for review
//    (added, not yet mastered), most-due first.
//  - scoped (came from the Pick page): EXACTLY the chosen words, mastered
//    included — the student asked for these, so a mastered word they ticked is
//    still drillable. Same box/reps ordering so the shakiest come up first.
function scopedDue() {
  if (!DRILL_SCOPE) return store.dueForReview();
  return store.getCollection()
    .filter((it) => DRILL_SCOPE.has(it.key))
    .sort((a, b) => (a.box - b.box) || (a.reps - b.reps));
}
function scopeLabel() {
  if (!DRILL_SCOPE) return '';
  return `Custom set · ${DRILL_SCOPE.size} word${DRILL_SCOPE.size === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------
const routes = [];
function route(pattern, handler) {
  routes.push({ parts: pattern.split('/').filter(Boolean), handler });
}
function router() {
  const path = (window.location.hash || '#/').slice(1).split('?')[0];
  const segs = path.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.parts.length; i++) {
      if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (r.parts[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) { window.scrollTo(0, 0); return r.handler(params); }
  }
  renderHome();
}

// ---------------------------------------------------------------------------
// chrome
// ---------------------------------------------------------------------------
function render(view) {
  const app = $app();
  app.innerHTML = '';
  app.append(view);
  updateNavCounts();
}
function updateNavCounts() {
  const badge = document.getElementById('nav-count');
  if (badge) { const s = store.stats(); badge.textContent = s.learning ? String(s.learning) : ''; }
}
// Where a language request actually goes. Set this to your own contact email
// before deploying — it is intentionally a placeholder so no personal address
// ships in the public repo.
const LANGUAGE_REQUEST_EMAIL = 'your-contact-email@example.com';

// "Other / my language" means "my language isn't in this list" — it is a
// TRIGGER, never a real display language. Picking it used to just get stored
// as the pref, which then silently fell through displayLangFor's
// most-common-language fallback (e.g. landing on Amharic) with no indication
// anything was wrong. Instead this asks what language the student speaks,
// emails the teacher to request it, and reverts the picker to whatever
// language the student was already using — so 'other' never gets persisted
// or displayed as if it were an actual language.
function promptOtherLanguage(selectEl, previousLang) {
  const input = h('input', { class: 'field', placeholder: 'e.g. Somali, Punjabi, Karen…' });
  const overlay = h('div', { class: 'modal-overlay' });
  function revert() { selectEl.value = previousLang; overlay.remove(); }
  function send() {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const message = [
      `A student's language isn't in Word Builder's list yet: "${name}"`,
      `\n(Sent automatically from Word Builder — ${new Date().toLocaleString()})`,
    ].join('');
    store.logEvent({ action: 'requested', subject: 'language', word: name, detail: 'language request' });
    const mailto = `mailto:${LANGUAGE_REQUEST_EMAIL}` +
      `?subject=${encodeURIComponent('Word Builder — language request: ' + name)}` +
      `&body=${encodeURIComponent(message)}`;
    const a = document.createElement('a');
    a.href = mailto;
    a.click();
    selectEl.value = previousLang;
    overlay.innerHTML = '';
    overlay.append(h('div', { class: 'card modal-card' },
      h('div', { class: 'big-emoji' }, '✉️'),
      h('p', {}, `Thanks — we've asked your teacher to add ${name}.`),
      h('p', { class: 'muted small' }, `Meanwhile you're still set to ${langLabel(previousLang)}.`),
      h('button', { class: 'btn primary', onclick: () => overlay.remove() }, 'OK')));
  }
  overlay.onclick = (e) => { if (e.target === overlay) revert(); };
  overlay.append(h('div', { class: 'card modal-card' },
    h('p', { class: 'kicker' }, "What's your language?"),
    h('p', { class: 'build-hint' },
      "We'll ask your teacher to add it. You'll keep using your current language until then."),
    input,
    h('div', { class: 'row gap end' },
      h('button', { class: 'btn ghost', onclick: revert }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: send }, 'Send request'))));
  document.body.append(overlay);
  input.focus();
}

function langPicker() {
  const sel = h('select', { class: 'lang-select', 'aria-label': 'My language',
    onchange: (e) => {
      if (e.target.value === 'other') { promptOtherLanguage(sel, getLang()); return; }
      store.setPref('lang', e.target.value); router();
    } });
  for (const l of DATA.languages) {
    const opt = h('option', { value: l.code }, l.label);
    if (l.code === getLang()) opt.selected = true;
    sel.append(opt);
  }
  return sel;
}
function stat(label, val) {
  return h('div', { class: 'stat' },
    h('div', { class: 'stat-val' }, String(val)),
    h('div', { class: 'stat-label' }, label));
}
// A small speaker button that pronounces `text` in language `code` (default
// English, Australian). Renders nothing when the browser has no speech engine.
// stopPropagation so tapping it inside a link/row doesn't also navigate.
function say(text, code = 'en', cls = '') {
  if (!speech.canSpeak() || !text) return null;
  return h('button', {
    class: `say-btn ${cls}`.trim(), type: 'button',
    'aria-label': `Listen to ${text}`, title: 'Listen',
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); speech.speak(text, code); },
  }, '🔊');
}
function crumb(items) {
  return h('nav', { class: 'crumb' }, ...items.flatMap(([label, href], i) => {
    const el = href ? h('a', { href }, label) : h('span', {}, label);
    return i ? [h('span', { class: 'sep' }, '/'), el] : [el];
  }));
}

// ---------------------------------------------------------------------------
// HOME — levels
// ---------------------------------------------------------------------------
function renderHome() {
  const s = store.stats();
  const st = store.streak();
  const cards = DATA.levels.map((lvl) => {
    const words = lvl.subjects.reduce((n, sub) => n + subjectWordCount(sub), 0);
    const ready = lvl.subjects.filter((sub) => subjectWordCount(sub) > 0).length;
    return h('a', { class: 'card level-card', href: `#/l/${lvl.id}` },
      h('h3', {}, lvl.name),
      h('p', { class: 'muted' }, lvl.subtitle),
      h('p', { class: 'card-meta' },
        `${lvl.subjects.length} subjects · ${ready ? `${words} words ready` : 'coming soon'}`));
  });
  render(h('div', { class: 'stack' },
    h('section', { class: 'hero' },
      h('h1', {}, 'Word Builder'),
      h('p', { class: 'lead' },
        'Pick your level and subject, build each word from its morphemes, guess the meaning, ' +
        'then master it with flashcards.'),
      h('div', { class: 'hero-row' }, h('span', { class: 'muted' }, 'My language:'), langPicker())),
    s.total > 0 && h('section', { class: 'statbar' },
      st.current > 0 && stat('🔥 Day streak', st.current),
      stat('In progress', s.learning), stat('Mastered', s.mastered), stat('Reviews done', s.reviews),
      h('a', { class: 'btn', href: '#/pick' }, 'Revision drill →'),
      h('a', { class: 'btn ghost', href: '#/progress' }, 'My progress')),
    h('h2', { class: 'section-title' }, 'Choose your level'),
    h('div', { class: 'grid' }, ...cards)));
}

// ---------------------------------------------------------------------------
// LEVEL — subjects
// ---------------------------------------------------------------------------
function renderLevel({ levelId }) {
  const level = levelById(levelId);
  if (!level) return renderHome();
  const grid = h('div', { class: 'grid' });
  level.subjects.forEach((sub) => {
    const words = subjectWordCount(sub);
    const ready = sub.units.length > 0;
    const href = ready ? `#/l/${level.id}/${sub.id}` : `#/request/${level.id}/${sub.id}`;
    const prog = ready ? subjectProgress(sub) : null;
    grid.append(h('a', { class: `card subject-card ${ready ? '' : 'soon'}`, href },
      h('div', { class: 'card-tag' }, ready ? `${words} words` : 'Request this list'),
      h('h3', {}, sub.name),
      h('p', { class: 'muted' }, sub.subtitle || ''),
      prog && h('p', { class: 'card-progress muted small' },
        `${prog.started} topic${prog.started === 1 ? '' : 's'} started`,
        prog.masteredUnits > 0 ? ` · ${prog.masteredUnits} mastered` : '')));
  });
  render(h('div', { class: 'stack' },
    crumb([['Home', '#/'], [level.name, null]]),
    h('h1', {}, level.name),
    h('p', { class: 'muted' }, level.subtitle),
    grid,
    h('p', { class: 'muted small' },
      "Can't find your subject? ",
      h('a', { href: `#/request/${level.id}` }, 'Request a new topic'))));
}

// ---------------------------------------------------------------------------
// SUBJECT — folders + units
// ---------------------------------------------------------------------------
function unitCard(unit) {
  const empty = unit.words.length === 0;
  const progress = unitProgress(unit);
  const done = progress ? progress.started : 0;
  const pct = unit.words.length ? Math.round((done / unit.words.length) * 100) : 0;
  const href = empty ? `#/request/${unit.path}`
    : unit.interactive ? `#/learn/${unit.path}` : `#/browse/${unit.path}`;
  return h('a', { class: `card unit-card ${empty ? 'soon' : ''}`, href },
    h('div', { class: 'card-tag' }, empty ? 'Request this list' : unit.interactive ? 'Build' : 'Browse'),
    h('h3', {}, unit.name),
    h('p', { class: 'card-meta' }, empty ? 'Not added yet' : `${unit.words.length} words`),
    unit.interactive && !empty && h('div', { class: 'progress' },
      h('div', { class: 'progress-fill', style: `width:${pct}%` })),
    unit.interactive && !empty && h('p', { class: `muted small ${progress ? 'unit-status-' + progress.status : ''}` },
      progress ? `${done}/${unit.words.length} · ${PROGRESS_LABEL[progress.status]}` : `${done}/${unit.words.length} started`));
}

function folderCard(level, subject, folder) {
  const units = folderUnits(subject, folder);
  const progress = folderProgress(units);
  const pct = progress.totalWords
    ? Math.round((progress.startedWords / progress.totalWords) * 100) : 0;
  return h('a', { class: 'card folder-card', href: folderHref(level, subject, folder) },
    h('div', { class: 'card-tag' }, 'Ballad folder'),
    h('h3', {}, h('span', { class: 'folder-icon', 'aria-hidden': 'true' }, '▰'), folder.name),
    h('p', { class: 'muted' }, folder.subtitle || ''),
    h('p', { class: 'card-meta' }, `${units.length} stanzas · ${progress.totalWords} word entries`),
    h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${pct}%` })),
    h('p', { class: 'muted small' }, progress.startedUnits
      ? `${progress.startedUnits}/${units.length} stanzas started${progress.masteredUnits ? ` · ${progress.masteredUnits} mastered` : ''}`
      : 'Open the folder to choose a stanza'));
}

function renderSubject({ levelId, subjectId }) {
  const level = levelById(levelId);
  const subject = subjectById(level, subjectId);
  if (!subject) return renderHome();
  const folders = (subject.folders || []).filter((folder) => folderUnits(subject, folder).length);
  const groupedUnitIds = new Set(folders.flatMap((folder) => folderUnits(subject, folder).map((unit) => unit.id)));
  const cards = [
    ...folders.map((folder) => folderCard(level, subject, folder)),
    ...subject.units.filter((unit) => !groupedUnitIds.has(unit.id)).map(unitCard),
  ];
  const hasBank = subject.morphemes &&
    (subject.morphemes.prefixes.length || subject.morphemes.roots.length);
  render(h('div', { class: 'stack' },
    crumb([['Home', '#/'], [level.name, `#/l/${level.id}`], [subject.name, null]]),
    h('h1', {}, subject.name),
    h('p', { class: 'muted' }, subject.subtitle || ''),
    h('div', { class: 'toolbar' },
      hasBank && h('a', { class: 'btn ghost', href: `#/morphemes/${level.id}/${subject.id}` }, 'Morpheme bank'),
      h('a', { class: 'btn ghost', href: '#/pick' }, 'Revision drill')),
    cards.length
      ? h('div', { class: 'grid' }, ...cards)
      : h('div', { class: 'card done-card' },
          h('p', { class: 'muted' }, 'No units added yet.'),
          h('a', { class: 'btn primary', href: `#/request/${level.id}/${subject.id}` }, 'Request this list'))));
}

function renderFolder({ levelId, subjectId, folderId }) {
  const level = levelById(levelId);
  const subject = subjectById(level, subjectId);
  const folder = folderById(subject, folderId);
  if (!folder) return renderSubject({ levelId, subjectId });
  const units = folderUnits(subject, folder);
  const progress = folderProgress(units);
  render(h('div', { class: 'stack' },
    crumb([['Home', '#/'], [level.name, `#/l/${level.id}`],
      [subject.name, `#/l/${level.id}/${subject.id}`], [folder.name, null]]),
    h('div', { class: 'folder-heading' },
      h('div', { class: 'folder-heading-icon', 'aria-hidden': 'true' }, '▰'),
      h('div', {},
        h('p', { class: 'kicker' }, 'Ballad vocabulary folder'),
        h('h1', {}, folder.name),
        h('p', { class: 'muted' }, folder.subtitle || ''))),
    h('p', { class: 'folder-summary muted small' },
      `${units.length} stanzas · ${progress.totalWords} word entries · choose a stanza to study and build`),
    h('div', { class: 'toolbar' },
      folder.sourceUrl && h('a', { class: 'btn ghost', href: folder.sourceUrl,
        target: '_blank', rel: 'noopener' }, `${folder.sourceLabel || 'Read the source'} ↗`),
      h('a', { class: 'btn ghost', href: '#/pick' }, 'Revision drill')),
    units.length
      ? h('div', { class: 'grid' }, ...units.map(unitCard))
      : h('div', { class: 'card done-card' }, h('p', { class: 'muted' }, 'No stanzas added yet.'))));
}

// ---------------------------------------------------------------------------
// REQUEST — "this list hasn't been made yet" -> send the teacher a request
// ---------------------------------------------------------------------------
// Where requests actually go. No backend is required for this to work: it
// always opens a pre-filled email, and it also logs the request into the
// student's own progress log (synced to Supabase if that's configured), so a
// teacher can also find every request with:
//   select * from progress_log where action = 'requested' order by created_at desc;
const TEACHER_EMAIL = 'liaminhawai@gmail.com'; // change this to your own email

function renderRequest({ levelId, subjectId, unitId }) {
  const level = levelById(levelId);
  if (!level) return renderHome();
  const subject = subjectId ? subjectById(level, subjectId) : null;
  const unit = subject && unitId ? unitById(subject, unitId) : null;

  const crumbItems = [['Home', '#/'], [level.name, `#/l/${level.id}`]];
  if (subject) crumbItems.push([subject.name, subject.units.length ? `#/l/${level.id}/${subject.id}` : null]);
  if (unit) crumbItems.push([unit.name, null]);

  const needsSubjectInput = !subject;
  const needsUnitInput = subject && !unit;
  const subjectInput = needsSubjectInput
    ? h('input', { class: 'field', placeholder: 'e.g. Legal Studies, or a topic within a subject' }) : null;
  const unitInput = needsUnitInput
    ? h('input', { class: 'field', placeholder: `e.g. a topic within ${subject.name}` }) : null;
  const noteInput = h('textarea', { class: 'guess', rows: '3',
    placeholder: 'Anything specific you want included? (optional)' });

  const card = h('div', { class: 'card build-card' });

  function draw() {
    card.innerHTML = '';
    add(card,
      h('p', { class: 'kicker' }, 'Request this word list'),
      h('p', { class: 'build-hint' },
        unit
          ? `"${unit.name}" hasn't been added yet. Send a request to your teacher and they'll add it.`
          : subject
            ? `Tell your teacher what topic you'd like added to ${subject.name}.`
            : `Tell your teacher what subject or topic you'd like added to ${level.name}.`),
      subjectInput, unitInput, noteInput,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary', onclick: onSend }, 'Send request to your teacher')),
      h('div', { class: 'feedback', id: 'fb' }));
  }

  function onSend() {
    if (needsSubjectInput && !subjectInput.value.trim()) {
      const fb = card.querySelector('#fb');
      fb.className = 'feedback warn'; fb.textContent = 'Please say what subject or topic you want.';
      return;
    }
    if (needsUnitInput && !unitInput.value.trim()) {
      const fb = card.querySelector('#fb');
      fb.className = 'feedback warn'; fb.textContent = 'Please say what topic you want.';
      return;
    }
    const target = unit ? unit.name : needsUnitInput ? unitInput.value.trim() : null;
    const subjectName = subject ? subject.name : needsSubjectInput ? subjectInput.value.trim() : null;
    const note = noteInput.value.trim();
    const pathLabel = [level.name, subjectName, target].filter(Boolean).join(' · ');
    const message = [
      `A student requested a new word list: ${pathLabel}`,
      note ? `\nNote from student: ${note}` : '',
      `\n(Sent automatically from Word Builder — ${new Date().toLocaleString()})`,
    ].join('');

    store.logEvent({
      action: 'requested',
      subject: unit ? unit.path : `${level.id}/${subject ? subject.id : ''}`,
      word: target || '',
      detail: note,
    });

    const mailto = `mailto:${TEACHER_EMAIL}` +
      `?subject=${encodeURIComponent('Word Builder — list request: ' + pathLabel)}` +
      `&body=${encodeURIComponent(message)}`;
    const a = document.createElement('a');
    a.href = mailto;
    a.click();

    card.innerHTML = '';
    card.append(
      h('p', { class: 'kicker' }, 'Request sent'),
      h('div', { class: 'big-emoji' }, '✉️'),
      h('p', {}, `Your request for "${pathLabel}" has been logged.`),
      h('p', { class: 'muted small' },
        "If your email app didn't open, show this to your teacher:"),
      h('div', { class: 'meaning-box' }, h('p', { class: 'meaning' }, message)),
      h('a', { class: 'btn primary', href: '#/' }, 'Back to home'));
  }

  draw();
  render(h('div', { class: 'stack' }, crumb(crumbItems), h('h1', {}, 'Request a word list'), card));
}

// ---------------------------------------------------------------------------
// LEARN (core interactive)
// ---------------------------------------------------------------------------
// An unobtrusive running list of the unit's words: the ones already made show
// solid with a ✓, the current one is highlighted, and the words still to make
// are faded — so a student can always see how far along the list they are.
function wordProgressStrip(unit, currentIdx) {
  let done = 0;
  const chips = unit.words.map((w, i) => {
    const built = !!store.getItem(store.wordKey(unit.path, w.word));
    if (built) done += 1;
    const cls = i === currentIdx ? 'wm-current' : built ? 'wm-done' : 'wm-todo';
    return h('span', { class: `wm-chip ${cls}` }, (built ? '✓ ' : '') + w.word);
  });
  return h('div', { class: 'wordmap' },
    h('div', { class: 'wm-title muted small' }, `Your word list — ${done}/${unit.words.length} made`),
    h('div', { class: 'wm-list' }, ...chips));
}

// Split a unit into small sets grouped by SHARED MORPHEMES, so each set's
// morpheme bank stays small and coherent (words that share pieces learn
// together). Greedy: seed a set, then keep adding whichever remaining word
// shares the most morphemes with it, up to `target` words.
function buildSets(unit, target = 6) {
  const key = (w) => (w.parts || []).map((p) => p.surface.toLowerCase());
  const remaining = unit.words.slice();
  const sets = [];
  while (remaining.length) {
    const set = [remaining.shift()];
    const morphs = new Set(key(set[0]));
    while (set.length < target && remaining.length) {
      let bestI = 0, bestShare = -1;
      for (let i = 0; i < remaining.length; i++) {
        const share = key(remaining[i]).filter((m) => morphs.has(m)).length;
        if (share > bestShare) { bestShare = share; bestI = i; }
      }
      const w = remaining.splice(bestI, 1)[0];
      set.push(w);
      key(w).forEach((m) => morphs.add(m));
    }
    sets.push(set);
  }
  return sets;
}

// Normalise a typed answer for lenient comparison (case, spaces, punctuation).
function normAnswer(s) {
  return (s || '').toLowerCase().replace(/[\s‌]+/g, '').replace(/[.,;،؛。、]/g, '').trim();
}

// The build board: study a small set, build every word from its morphemes in
// any order (the WORD is hidden — you build from the definition), done words
// drop to the bottom, then a meaning check you choose the mode of.
function renderBuildBoard({ levelId, subjectId, unitId }) {
  const path = `${levelId}/${subjectId}/${unitId}`;
  const { level, subject, unit } = resolvePath(path);
  if (!unit) return renderHome();
  if (!unit.interactive) return renderBrowse({ levelId, subjectId, unitId });
  const parentHref = unitParentHref(level, subject, unit);

  const sets = buildSets(unit);
  let si = 0;              // current set index
  let phase = 'study';     // study | build | check
  let st = null;           // per-set state

  function initSet() {
    const words = sets[si];
    st = { held: null, checkMode: null, check: {} };
    st.build = words.map((w) => {
      const buildable = (w.parts || []).length >= 2;
      // "remember this" words have no morphemes to build, but they still get a
      // task — recognise the word from its meaning (see revealRow) — rather
      // than starting pre-done with nothing for the student to actually do.
      const rec = { w, buildable, slots: (w.parts || []).map(() => null), done: false };
      // Degenerate guard: a non-buildable word with NEITHER an English meaning
      // NOR any translation has no prompt to recognise it by, so it can only
      // start done — there is genuinely nothing to test. (Not reachable with
      // current data; every word carries at least a translation.)
      const hasPrompt = !!(w.meaning || (w.translations && Object.keys(w.translations).some((k) => k !== 'other')));
      if (!buildable && !hasPrompt) { rec.done = true; store.addToCollection(unit.path, w.word); }
      return rec;
    });
  }
  function bankMorphemes() {
    const seen = new Map();
    for (const b of st.build) {
      if (!b.buildable) continue;
      for (const p of b.w.parts) {
        const k = p.surface.toLowerCase();
        if (!seen.has(k)) seen.set(k, p);
      }
    }
    // stable but non-obvious order
    return [...seen.values()].sort((a, b) => a.surface.localeCompare(b.surface));
  }
  function head(labelRight) {
    const totalDone = sets.slice(0, si).reduce((n, s) => n + s.length, 0)
      + (st ? st.build.filter((b) => b.done).length : 0);
    const totalWords = unit.words.length;
    return h('div', { class: 'learn-head' },
      h('div', {},
        h('span', { class: 'muted small' }, `Set ${si + 1} of ${sets.length} · ${sets[si].length} words`),
        h('div', { class: 'progress thin' },
          h('div', { class: 'progress-fill', style: `width:${(totalDone / totalWords) * 100}%` }))),
      h('div', { class: 'row gap' }, buildLangPicker(),
        labelRight,
        h('a', { class: 'btn ghost small', href: parentHref }, 'Exit')));
  }
  function buildLangPicker() {
    const sel = h('select', { class: 'lang-select sm', 'aria-label': 'My language',
      onchange: (e) => {
        if (e.target.value === 'other') { promptOtherLanguage(sel, getLang()); return; }
        store.setPref('lang', e.target.value); render_();
      } });
    for (const l of DATA.languages) {
      const opt = h('option', { value: l.code }, l.label);
      if (l.code === getLang()) opt.selected = true;
      sel.append(opt);
    }
    return sel;
  }
  const crumbBar = () => crumb(unitCrumbItems(level, subject, unit));

  // ---- STUDY: see the whole set (word + parts + meaning + translation) ----
  function studyView() {
    const lang = getLang();
    const dispLang = unitDisplayLang(unit, lang);
    const cards = sets[si].map((w) => h('div', { class: 'study-card' },
      h('div', { class: 'study-word' }, h('strong', {}, w.word), say(w.word)),
      (w.parts && w.parts.length >= 2) && h('div', { class: 'study-morphs' },
        ...w.parts.map((p) => {
          const native = pickExact(p.translations, dispLang);
          return h('span', { class: `mo-chip ${p.type || ''}` },
            ...spellingChip(p), h('i', { class: 'mo-gloss' },
              p.meaning || '', native ? ` · ${native}` : ''));
        })),
      h('p', { class: 'study-def' }, w.meaning || ''),
      (pickTranslation(w.translations, lang) || pickExact(w.translations, dispLang)) &&
        h('p', { class: 'study-trans wtr' }, pickTranslation(w.translations, lang) || pickExact(w.translations, dispLang)),
      w.example && h('p', { class: 'study-example' }, '“' + w.example + '”'),
      w.context && h('p', { class: 'study-context' }, h('b', {}, 'In the text: '), w.context),
      w.origin && h('details', { class: 'word-story' },
        h('summary', {}, 'Word story'), h('p', {}, w.origin))));
    return h('div', { class: 'stack learn' }, crumbBar(),
      head(null),
      h('div', { class: 'board-intro' },
        h('h2', {}, 'Study the words'),
        h('p', { class: 'muted small' }, 'Read each word, its parts and meaning. When you build, the words are hidden — so learn them now.')),
      h('div', { class: 'study-list' }, ...cards),
      h('div', { class: 'row gap end' },
        h('button', { class: 'btn primary', onclick: () => { phase = 'build'; initSet(); render_(); } },
          'Start building →')));
  }

  // ---- BUILD: ALL words buildable at once, any order. Two ways to place a
  //      part: DRAG it onto a box, or TAP it (it lifts) then TAP a box. No
  //      single "active" word. Finished words minimise and sink to the bottom.
  function gradeRow(b) {
    if (!b.slots.every((x) => x != null)) return;
    const correct = b.w.parts.map((x) => x.surface.toLowerCase());
    const got = b.slots.map((x) => x.toLowerCase());
    if (correct.every((c, k) => c === got[k])) {
      b.done = true;
      store.addToCollection(unit.path, b.w.word); // flows into the drill
    } else {
      b.wrong = true;
      setTimeout(() => { b.slots = b.w.parts.map(() => null); b.wrong = false; render_(); }, 700);
    }
  }
  function placeAt(ri, k, surface) {
    const b = st.build[ri];
    if (!b || !b.buildable || b.done || !surface || b.slots[k] != null) return;
    b.slots[k] = surface;
    st.held = null;
    gradeRow(b);
    render_();
  }
  function dropOnRow(ri, surface) {
    const b = st.build[ri];
    if (!b || !b.buildable || b.done) return;
    const k = b.slots.indexOf(null);
    if (k >= 0) placeAt(ri, k, surface);
  }
  function doneRow(b) {
    const tr = pickTranslation(b.w.translations, getLang());
    return h('div', { class: 'board-row done mini' },
      h('span', { class: 'board-built' }, '✓ ', b.w.word, say(b.w.word)),
      tr && h('span', { class: 'board-trans wtr' }, tr),
      h('span', { class: 'board-def mini muted small' }, b.w.meaning || ''));
  }
  // Distractor WORDS (not defs/translations) from elsewhere in the unit, for
  // the "remember this" recognise task below.
  function otherWordsFor(word, n) {
    const pool = unit.words.filter((x) => x.word !== word.word).map((x) => x.word);
    const out = [];
    for (const t of pool) { if (!out.includes(t) && out.length < n) out.push(t); }
    return out;
  }
  // Words with no morphemes to build ("remember this" cards) still get a real
  // task instead of arriving pre-ticked: pick the word that matches the hidden
  // meaning. A correct tap reveals it and marks it done; a wrong tap just
  // shakes — low-stakes, since the real test is the end-of-set meaning check.
  function revealRow(b) {
    // shuffle() is a function declaration further down this scope — hoisted,
    // so it's callable here. Options are cached on first render so ticking a
    // DIFFERENT row doesn't jumble this one's order underneath the student.
    const shown = b.opts || (b.opts = shuffle([b.w.word, ...otherWordsFor(b.w, 3)]));
    // The prompt is the meaning — English definition and/or the home-language
    // translation (many "remember this" words, e.g. Year 7 Particles, carry a
    // translation but no English definition, so the translation IS the prompt).
    const tr = pickTranslation(b.w.translations, getLang());
    return h('div', { class: `board-row board-row-reveal ${b.wrong ? 'wrong' : ''}` },
      h('div', { class: 'board-def' }, b.w.meaning || '',
        tr && h('div', { class: 'board-trans wtr' }, tr),
        h('div', { class: 'muted small' }, 'Which word is this?')),
      h('div', { class: 'check-opts' }, ...shown.map((o) => h('button', {
        class: 'check-opt', type: 'button',
        onclick: () => {
          if (o === b.w.word) { b.done = true; store.addToCollection(unit.path, b.w.word); }
          else { b.wrong = true; setTimeout(() => { b.wrong = false; render_(); }, 500); }
          render_();
        },
      }, o))));
  }
  function buildView() {
    const bank = bankMorphemes();
    const dispLang = unitDisplayLang(unit, getLang());
    // done words minimise + sink to the bottom
    const rows = st.build.map((b, i) => ({ b, i }))
      .sort((a, x) => (a.b.done === x.b.done) ? 0 : a.b.done ? 1 : -1);
    const remaining = st.build.filter((b) => !b.done).length;

    const bankEl = h('div', { class: 'board-bank' },
      h('div', { class: 'board-bank-label muted small' },
        st.held ? 'Now tap a box to drop it in ↓' : 'Tap a part (then tap a box), or drag it. Build any word, in any order.'),
      h('div', { class: 'board-bank-chips' }, ...bank.map((p) => {
        const native = pickExact(p.translations, dispLang);
        return h('button', {
          class: `mo-chip ${p.type || ''} board-chip ${st.held === p.surface ? 'held' : ''}`,
          type: 'button', draggable: 'true',
          onclick: () => { st.held = (st.held === p.surface) ? null : p.surface; render_(); },
          ondragstart: (e) => e.dataTransfer.setData('text/plain', p.surface),
        }, ...spellingChip(p), h('i', { class: 'mo-gloss' },
          p.meaning || '', native ? ` · ${native}` : ''));
      })));

    const list = h('div', { class: 'board-list' }, ...rows.map(({ b, i }) => {
      if (b.done) return doneRow(b);
      if (!b.buildable) return revealRow(b);
      const tr = pickTranslation(b.w.translations, getLang());
      return h('div', { class: `board-row ${b.wrong ? 'wrong' : ''} ${st.held ? 'targetable' : ''}`,
        ondragover: (e) => e.preventDefault(),
        ondrop: (e) => { e.preventDefault(); dropOnRow(i, e.dataTransfer.getData('text/plain')); } },
        h('div', { class: 'board-def' }, b.w.meaning || '',
          tr && h('div', { class: 'board-trans wtr' }, tr)),
        h('div', { class: 'board-slots' }, ...b.slots.map((s, k) => {
          const p = b.w.parts[k];
          return h('button', {
            class: `board-slot ${s ? 'filled ' + (p.type || '') : ''} ${(!s && st.held) ? 'open' : ''}`, type: 'button',
            ondragover: (e) => e.preventDefault(),
            ondrop: (e) => { e.stopPropagation(); e.preventDefault(); placeAt(i, k, e.dataTransfer.getData('text/plain')); },
            onclick: (e) => { e.stopPropagation(); if (s) { b.slots[k] = null; render_(); } else if (st.held) { placeAt(i, k, st.held); } },
          }, s || '');
        })));
    }));

    return h('div', { class: 'stack learn' }, crumbBar(),
      head(h('button', { class: 'btn ghost small', onclick: () => {
        // bail back to study — reset the words not yet finished (peek costs you)
        phase = 'study'; render_();
      } }, '← Study')),
      h('div', { class: 'board-intro' },
        h('h2', {}, 'Build the words'),
        h('p', { class: 'muted small' }, 'Build any word, in any order — drag a part onto a box, or tap a part then tap a box. The words are hidden; build each from its meaning. Finished words drop to the bottom.')),
      bankEl,
      list,
      remaining === 0 && h('div', { class: 'row gap end' },
        h('button', { class: 'btn primary', onclick: () => { phase = 'check'; render_(); } },
          'Check meanings →')));
  }

  // ---- CHECK: choose how to prove you know each word's meaning ----
  function otherTranslations(word, lang, n) {
    const pool = unit.words.filter((x) => x.word !== word.word)
      .map((x) => pickTranslation(x.translations, lang)).filter(Boolean);
    const out = [];
    for (const t of pool) { if (!out.includes(t) && out.length < n) out.push(t); }
    return out;
  }
  function otherDefs(word, n) {
    const pool = unit.words.filter((x) => x.word !== word.word && x.meaning).map((x) => x.meaning);
    const out = [];
    for (const t of pool) { if (!out.includes(t) && out.length < n) out.push(t); }
    return out;
  }
  function shuffle(a) { // deterministic-ish: rotate by length so it's stable per render
    const r = a.slice(); for (let i = 0; i < (a.length % 3); i++) r.push(r.shift()); return r;
  }
  function checkView() {
    const lang = getLang();
    if (!st.checkMode) {
      // Tap/type only make sense when this set actually has home-language
      // translations to tap or type; without them those modes would be
      // ungradeable (empty options), so offer only the English-definition
      // "match" mode. "match" always works — every word has a definition.
      const hasLangAnswers = sets[si].some((w) => pickTranslation(w.translations, lang));
      return h('div', { class: 'stack learn' }, crumbBar(), head(null),
        h('div', { class: 'board-intro' }, h('h2', {}, 'Check your meanings'),
          h('p', { class: 'muted small' }, 'Choose how you want to show you know what each word means.')),
        h('div', { class: 'mode-cards' },
          hasLangAnswers && modeCard('tap', '👆 Tap the meaning', 'Pick the right translation in your language.'),
          hasLangAnswers && modeCard('type', '⌨️ Type the meaning', 'Type the word in your language.'),
          modeCard('match', '🔗 Match the meaning', 'Pick the right English definition — no home language needed.')));
    }
    const rows = sets[si].map((w) => checkRow(w, lang));
    const allDone = sets[si].every((w) => st.check[w.word] && st.check[w.word].graded);
    return h('div', { class: 'stack learn' }, crumbBar(), head(
      h('button', { class: 'btn ghost small', onclick: () => { st.checkMode = null; render_(); } }, 'Change mode')),
      h('div', { class: 'board-intro' }, h('h2', {}, 'Check your meanings')),
      h('div', { class: 'check-list' }, ...rows),
      allDone && h('div', { class: 'row gap end' },
        si + 1 < sets.length
          ? h('button', { class: 'btn primary', onclick: () => { si++; phase = 'study'; render_(); } }, 'Next set →')
          : h('a', { class: 'btn primary', href: parentHref }, 'Finish unit ✓')));
  }
  function modeCard(mode, title, desc) {
    return h('button', { class: 'mode-card', type: 'button',
      onclick: () => { st.checkMode = mode; render_(); } },
      h('div', { class: 'mode-title' }, title), h('div', { class: 'muted small' }, desc));
  }
  function checkRow(w, lang) {
    const state = st.check[w.word] || (st.check[w.word] = { graded: false, ok: false });
    const answer = pickTranslation(w.translations, lang);
    const reveal = state.graded && h('div', { class: `check-reveal ${state.ok ? 'ok' : 'bad'}` },
      state.ok ? '✓ ' : '✗ ', h('strong', {}, w.word), ' — ', answer || w.meaning);
    if (state.graded) {
      return h('div', { class: 'check-row graded' },
        h('div', { class: 'board-built' }, w.word, say(w.word)), reveal);
    }
    let control;
    if (st.checkMode === 'type') {
      const inp = h('input', { class: 'gap-input check-input', placeholder: 'meaning in your language' });
      control = h('div', { class: 'row gap' }, inp,
        h('button', { class: 'btn small primary', onclick: () => {
          state.graded = true;
          state.ok = !!answer && normAnswer(inp.value) === normAnswer(answer);
          render_();
        } }, 'Check'));
    } else if (st.checkMode === 'tap') {
      const opts = shuffle([answer, ...otherTranslations(w, lang, 3)].filter(Boolean));
      control = h('div', { class: 'check-opts' }, ...opts.map((o) => h('button', {
        class: 'check-opt', type: 'button', onclick: () => { state.graded = true; state.ok = o === answer; render_(); },
      }, o)));
    } else { // match — pick the English definition
      const opts = shuffle([w.meaning, ...otherDefs(w, 3)].filter(Boolean));
      control = h('div', { class: 'check-opts' }, ...opts.map((o) => h('button', {
        class: 'check-opt', type: 'button', onclick: () => { state.graded = true; state.ok = o === w.meaning; render_(); },
      }, o)));
    }
    return h('div', { class: 'check-row' },
      h('div', { class: 'board-built' }, w.word, say(w.word)), control);
  }

  function render_() {
    if (phase === 'study') return render(studyView());
    if (phase === 'build') return render(buildView());
    return render(checkView());
  }
  render_();
}

function renderLearn({ levelId, subjectId, unitId }) {
  const path = `${levelId}/${subjectId}/${unitId}`;
  const { level, subject, unit } = resolvePath(path);
  if (!unit) return renderHome();
  if (!unit.interactive) return renderBrowse({ levelId, subjectId, unitId });
  const parentHref = unitParentHref(level, subject, unit);
  let idx = 0;

  // A language picker right on the build page, so a student can fix their
  // language without going back home. Re-renders the current word in place
  // (keeps their position) rather than restarting the unit.
  function learnLangPicker() {
    const sel = h('select', { class: 'lang-select sm', 'aria-label': 'My language',
      onchange: (e) => {
        if (e.target.value === 'other') { promptOtherLanguage(sel, getLang()); return; }
        store.setPref('lang', e.target.value); show();
      } });
    for (const l of DATA.languages) {
      const opt = h('option', { value: l.code }, l.label);
      if (l.code === getLang()) opt.selected = true;
      sel.append(opt);
    }
    return sel;
  }

  function show() {
    const word = unit.words[idx];
    const total = unit.words.length;
    const lang = getLang();
    // A word only gets the morpheme-building task if it actually splits into 2+
    // morphemes. Single-morpheme words (e.g. "element", "speed") skip straight
    // to a "remember this word" card — no fake build task.
    const hasMorphology = (word.parts || []).length >= 2;
    render(h('div', { class: 'stack learn' },
      crumb(unitCrumbItems(level, subject, unit)),
      h('div', { class: 'learn-head' },
        h('div', {},
          h('span', { class: 'muted small' }, `Word ${idx + 1} of ${total}`),
          h('div', { class: 'progress thin' },
            h('div', { class: 'progress-fill', style: `width:${(idx / total) * 100}%` }))),
        h('div', { class: 'row gap' }, learnLangPicker(),
          h('a', { class: 'btn ghost small', href: parentHref }, 'Exit'))),
      hasMorphology
        ? buildWordCard(subject, unit, word, lang, goNext)
        : learnWordCard(subject, unit, word, lang, goNext),
      wordProgressStrip(unit, idx)));
  }
  function goNext() {
    if (idx < unit.words.length - 1) { idx++; show(); }
    else renderUnitDone(level, subject, unit);
  }
  show();
}

// The morpheme table for a unit — every prefix/root/suffix used across the
// unit's words, grouped like the bank at the top of the teacher's book pages.
// This is the SOURCE students drag from: they have to find the right pieces
// among all of them, not pick from a pool that only holds the answer.
function unitMorphemeBank(unit) {
  const byType = { prefix: new Map(), root: new Map(), suffix: new Map() };
  for (const w of unit.words) {
    // Only words that actually break into 2+ morphemes contribute to the bank.
    // A single-morpheme word is the whole word itself (or, in bilingual lists,
    // its translation) — not a reusable piece to drag.
    if ((w.parts || []).length < 2) continue;
    for (const p of w.parts) {
      const m = byType[p.type];
      if (m && !m.has(p.surface.toLowerCase())) m.set(p.surface.toLowerCase(), p);
    }
  }
  const sortBySurface = (a, b) => a.surface.localeCompare(b.surface);
  return {
    prefix: [...byType.prefix.values()].sort(sortBySurface),
    root: [...byType.root.values()].sort(sortBySurface),
    suffix: [...byType.suffix.values()].sort(sortBySurface),
  };
}

// A word that doesn't break into morphemes: no build task — just learn and
// remember it. It's emphasised (a "remember this" card) and added straight to
// the collection so the spaced-repetition drill keeps it from being forgotten.
function learnWordCard(subject, unit, word, lang, onDone) {
  store.addToCollection(unit.path, word.word);
  const dispLang = unitDisplayLang(unit, lang);
  const wholeWord = pickExact(word.translations, lang) || pickExact(word.translations, dispLang);
  const related = relatedByRoot(subject, word);
  return h('div', { class: 'card learn-word-card' },
    h('div', { class: 'lw-badge' }, '★ Remember this word'),
    h('p', { class: 'build-hint' },
      'This word doesn’t split into parts — there’s nothing to build. Just learn what it means and keep it in your revision.'),
    h('div', { class: 'lw-word' }, h('strong', {}, word.word), say(word.word, 'en', 'lg')),
    wholeWord && h('p', { class: 'flash-translation' }, wholeWord, say(wholeWord, lang, 'sm')),
    h('div', { class: 'meaning-box' },
      h('p', { class: 'meaning' }, word.meaning || '(no dictionary definition yet — learn it from the translation)'),
      word.example && h('p', { class: 'example' }, '“' + word.example + '”')),
    related.length > 0 && h('div', { class: 'related' },
      h('p', { class: 'muted small' }, `Related words with the root “${word.root}”:`),
      h('div', { class: 'chips' }, ...related.map((r) => h('span', { class: 'chip ghost' }, r)))),
    h('div', { class: 'row gap end' },
      h('span', { class: 'saved-note' }, '✓ Added to My Words'),
      h('button', { class: 'btn primary', onclick: onDone }, 'Next word →')));
}

function buildWordCard(subject, unit, word, lang, onDone) {
  const correct = word.parts.map((p) => p.surface.toLowerCase());
  const slots = correct.map(() => null);
  const bank = unitMorphemeBank(unit);
  // One consistent language for every meaning on this card.
  const dispLang = unitDisplayLang(unit, lang);
  const card = h('div', { class: 'card build-card' });
  // morph: student's home-language meaning per morpheme surface; guess: their
  // predicted whole-word meaning. Both persist across back/forward.
  const stage = { name: 'build', guess: '' };
  let dragging = null; // morpheme surface currently being dragged (desktop)

  function draw() {
    card.innerHTML = '';
    if (stage.name === 'build') drawBuild();
    else if (stage.name === 'write') drawWrite();
    else drawReveal();
  }

  // ---- Step 1: build the word by dragging from the morpheme table ----------
  function drawBuild() {
    add(card,
      h('p', { class: 'kicker' }, 'Step 1 — Build the word from the morpheme table'),
      h('div', { class: 'build-target' },
        h('span', { class: 'muted small' }, 'Word to build:'), h('strong', {}, word.word), say(word.word)),
      h('p', { class: 'build-hint' }, 'Drag (or tap) the right morphemes from the table into the slots.'),
      dispLang !== lang && dispLang !== 'other' && h('p', { class: 'muted small lang-note' },
        `This list doesn’t have your language — showing meanings in ${langLabel(dispLang)}.`),
      slotRow(),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost small', onclick: () => { slots.fill(null); draw(); } }, 'Clear'),
        h('button', { class: 'btn ghost small', onclick: () => { correct.forEach((c, i) => (slots[i] = c)); draw(); } }, 'Show me'),
        h('button', { class: 'btn primary', onclick: checkBuild }, 'Check')),
      h('div', { class: 'feedback', id: 'fb' }),
      buildBankTable());
  }

  function slotRow() {
    const row = h('div', { class: 'slots' });
    word.parts.forEach((p, i) => {
      const slot = h('button', {
        class: `slot ${p.type} ${slots[i] ? 'filled' : 'empty'}`,
        onclick: () => { if (slots[i]) { slots[i] = null; draw(); } },
        ondragover: (e) => { e.preventDefault(); slot.classList.add('dragover'); },
        ondragleave: () => slot.classList.remove('dragover'),
        ondrop: (e) => { e.preventDefault(); if (dragging) { slots[i] = dragging; draw(); } },
      }, slots[i] || p.type);
      row.append(slot);
    });
    return row;
  }

  // tap-to-place: drop into the first empty slot of the morpheme's own type,
  // else the first empty slot — so tapping a suffix never lands in a prefix box.
  function placeByType(type, surface) {
    let i = word.parts.findIndex((p, idx) => p.type === type && slots[idx] === null);
    if (i < 0) i = slots.findIndex((s) => s === null);
    if (i >= 0) { slots[i] = surface; draw(); }
  }

  function bankChip(m) {
    const surface = m.surface.toLowerCase();
    return h('div', {
      class: `chip ${m.type} bank-chip`, draggable: 'true',
      ondragstart: () => { dragging = surface; },
      ondragend: () => { dragging = null; },
      onclick: () => placeByType(m.type, surface),
    }, m.surface);
  }

  // A morpheme is "still needed" if a word you haven't built yet uses it. Once
  // it's placed in a slot here, or every word that uses it is done, it fades —
  // less clutter, and the bank visibly shrinks toward the pieces still in play.
  function stillNeeded(surface) {
    const key = surface.toLowerCase();
    return unit.words.some((w) =>
      !store.getItem(store.wordKey(unit.path, w.word)) &&
      (w.parts || []).some((p) => p.surface.toLowerCase() === key));
  }
  function buildBankTable() {
    // Bilingual reference, like the morpheme table at the top of the book page:
    // each morpheme with its English meaning AND the home-language meaning, so an
    // EAL student can actually tell what they're dragging (not English-only).
    const colFor = (title, list, cls) => h('div', { class: 'mbank-col' },
      h('div', { class: `mbank-head ${cls}` }, title),
      h('div', { class: 'mbank-scroll' }, ...list.map((m) => {
        const native = pickExact(m.translations, dispLang);
        const dim = slots.includes(m.surface.toLowerCase()) || !stillNeeded(m.surface);
        return h('div', { class: `mbank-item ${dim ? 'dim' : ''}` },
          bankChip(m),
          h('span', { class: 'mbank-mean' },
            h('span', { class: 'mbank-en' }, m.meaning || ''),
            native && h('span', { class: 'mbank-native' }, native)));
      })));
    return h('div', { class: 'mbank' },
      colFor('Prefixes', bank.prefix, 'prefix'),
      colFor('Roots', bank.root, 'root'),
      colFor('Suffixes', bank.suffix, 'suffix'));
  }

  function checkBuild() {
    const fb = card.querySelector('#fb');
    if (slots.some((s) => s === null)) {
      fb.className = 'feedback warn'; fb.textContent = 'Drag a morpheme into every slot first.'; return;
    }
    if (slots.every((s, i) => s === correct[i])) {
      fb.className = 'feedback ok'; fb.textContent = `✓ Nice — that spells "${word.word}".`;
      setTimeout(() => { stage.name = 'write'; draw(); }, 500);
    } else {
      fb.className = 'feedback bad';
      fb.textContent = 'Not quite — check which morphemes make this word, and the order.';
    }
  }

  // ---- Step 2: read each morpheme's meaning, then predict the whole word -----
  // Each part's meaning is shown in English AND the student's language — an EAL
  // kid can't translate an English gloss they don't know yet, so we give it to
  // them. Their own task is the prediction of the whole word, in their language.
  function drawWrite() {
    const rows = word.parts.map((p) => {
      const native = pickExact(p.translations, dispLang);
      return h('div', { class: 'write-row reveal-row' },
        h('span', { class: `chip ${p.type}` }, p.surface),
        h('span', { class: 'write-en' }, p.meaning || '—'),
        native && h('span', { class: 'answer' }, native));
    });
    const guess = h('textarea', { class: 'guess', rows: '2', lang: speech.bcp47(lang) || null,
      placeholder: `What do you think “${word.word}” means?` });
    guess.value = stage.guess || '';
    guess.oninput = (e) => { stage.guess = e.target.value; };
    add(card,
      h('p', { class: 'kicker' }, 'Step 2 — Predict the meaning'),
      h('div', { class: 'built-word' }, h('strong', {}, word.word), say(word.word)),
      h('p', { class: 'build-hint' },
        'Here is what each part means — in English and in your language. Put them together.'),
      h('div', { class: 'write-list' }, ...rows),
      h('p', { class: 'write-predict-label' },
        `Now put them together — what do you think “${word.word}” means? Write it in your own language.`),
      guess,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost small', onclick: () => { stage.name = 'build'; draw(); } }, '← Back'),
        h('button', { class: 'btn primary', onclick: () => { stage.name = 'reveal'; draw(); } }, 'Reveal meaning →')));
  }

  // ---- Step 3: reveal + self-check against the real answers -----------------
  function drawReveal() {
    store.addToCollection(unit.path, word.word, { lastTranslation: stage.guess || '' });
    const wholeWord = pickExact(word.translations, lang) || pickExact(word.translations, dispLang);
    const related = relatedByRoot(subject, word);
    const morphRows = word.parts.map((p) => {
      const answer = pickExact(p.translations, dispLang);
      return h('div', { class: 'write-row reveal-row' },
        h('span', { class: `chip ${p.type}` }, p.surface),
        h('span', { class: 'write-en' }, p.meaning || '—'),
        answer && h('span', { class: 'answer' }, answer));
    });
    add(card,
      h('p', { class: 'kicker' }, 'Step 3 — The meaning'),
      h('div', { class: 'built-word' }, h('strong', {}, word.word), say(word.word)),
      h('div', { class: 'write-list' }, ...morphRows),
      wholeWord && h('p', { class: 'flash-translation' }, wholeWord, say(wholeWord, lang, 'sm')),
      h('div', { class: 'meaning-box' },
        h('p', { class: 'meaning' }, word.meaning || '(no dictionary definition yet — use your morphemes above)'),
        word.example && h('p', { class: 'example' }, '“' + word.example + '”')),
      stage.guess && h('div', { class: 'your-guess' },
        h('span', { class: 'muted small' }, 'You predicted: '), h('span', {}, stage.guess)),
      related.length > 0 && h('div', { class: 'related' },
        h('p', { class: 'muted small' }, `Related words with the root “${word.root}”:`),
        h('div', { class: 'chips' }, ...related.map((r) => h('span', { class: 'chip ghost' }, r)))),
      h('div', { class: 'row gap end' },
        h('span', { class: 'saved-note' }, '✓ Added to My Words'),
        h('button', { class: 'btn primary', onclick: onDone }, 'Next word →')));
  }

  draw();
  return card;
}

function relatedByRoot(subject, word) {
  if (!word.root) return [];
  const out = [];
  for (const u of subject.units) for (const w of u.words) {
    if (w.word !== word.word && w.root && w.root === word.root) out.push(w.word);
  }
  return [...new Set(out)].slice(0, 8);
}

function renderUnitDone(level, subject, unit) {
  render(h('div', { class: 'stack center-card' },
    h('div', { class: 'card done-card' },
      h('div', { class: 'big-emoji' }, '🎉'),
      h('h2', {}, 'Unit complete!'),
      h('p', { class: 'muted' }, `You built all ${unit.words.length} words in ${unit.name}. They are now in your revision drill.`),
      h('div', { class: 'row gap center' },
        h('a', { class: 'btn primary', href: '#/pick' }, 'Start revision drill'),
        h('a', { class: 'btn ghost', href: unitParentHref(level, subject, unit) }, 'Back to units')))));
}

// ---------------------------------------------------------------------------
// DRILL PICKER — choose subjects / units to drill together
// ---------------------------------------------------------------------------
// The Pick page is the ONLY way into a drill. It offers exactly the words the
// student has already built (their collection) — grouped by subject then topic
// — so you can only revise what you've actually met. A mastery-bin filter
// (learning / consolidating / mastered) narrows it further, e.g. "just drill
// the biology words I'm still consolidating".
function renderDrillPicker() {
  DRILL_SCOPE = null;                       // arriving here always resets scope
  const coll = store.getCollection();
  if (!coll.length) {
    return render(h('div', { class: 'stack center-card' },
      h('div', { class: 'card done-card' },
        h('div', { class: 'big-emoji' }, '📭'),
        h('h2', {}, 'No words to drill yet'),
        h('p', { class: 'muted' },
          "The drill practises words you've already built. Open a subject, build a few words, and they'll show up here to revise."),
        h('a', { class: 'btn primary', href: '#/' }, 'Find words to build'))));
  }

  const activeBins = new Set(store.BINS);   // learning / consolidating / mastered — all on
  const boxes = [];                         // {cb, items, countEl, row}
  const subjToggles = [];                   // {cb, unitCbs}
  const footer = h('div', { class: 'pick-footer' });
  const binMeta = {
    learning:      { label: 'Learning',      emoji: '🌱' },
    consolidating: { label: 'Consolidating', emoji: '🔁' },
    mastered:      { label: 'Mastered',      emoji: '⭐' },
  };
  const totalBin = { learning: 0, consolidating: 0, mastered: 0 };
  for (const it of coll) totalBin[store.binOf(it)]++;

  const eligible = (items) => items.filter((it) => activeBins.has(store.binOf(it)));

  function refresh() {
    let words = 0, topics = 0;
    for (const b of boxes) {
      const n = eligible(b.items).length;
      b.countEl.textContent = String(n);
      if (n === 0) { b.cb.checked = false; b.cb.disabled = true; b.row.classList.add('pick-empty'); }
      else { b.cb.disabled = false; b.row.classList.remove('pick-empty'); }
      if (b.cb.checked) { words += n; topics++; }
    }
    for (const s of subjToggles) {              // subject checkbox tri-state
      const live = s.unitCbs.filter((c) => !c.disabled);
      const on = live.filter((c) => c.checked);
      s.cb.disabled = live.length === 0;
      s.cb.checked = live.length > 0 && on.length === live.length;
      s.cb.indeterminate = on.length > 0 && on.length < live.length;
    }
    footer.innerHTML = '';
    add(footer,
      h('span', { class: 'pick-total' },
        topics ? `${topics} topic${topics === 1 ? '' : 's'} · ${words} word${words === 1 ? '' : 's'}`
               : 'Nothing selected yet'),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost', onclick: () => { boxes.forEach((b) => { b.cb.checked = false; }); refresh(); } }, 'Clear'),
        h('button', { class: 'btn primary', disabled: words === 0, onclick: start },
          `Drill ${words || ''} →`)));
  }

  function start() {
    const pairs = [];
    for (const b of boxes) {
      if (!b.cb.checked) continue;
      for (const it of eligible(b.items)) pairs.push([it.path, it.word]);
    }
    if (pairs.length) startScopedDrill(pairs);
  }

  // mastery-bin filter chips
  const chips = h('div', { class: 'bin-filter' });
  for (const bin of store.BINS) {
    const m = binMeta[bin];
    const chip = h('button', {
      class: `bin-chip active bin-${bin}`, type: 'button',
      onclick: () => {
        if (activeBins.has(bin)) activeBins.delete(bin); else activeBins.add(bin);
        chip.classList.toggle('active', activeBins.has(bin));
        refresh();
      },
    }, `${m.emoji} ${m.label} `, h('span', { class: 'bin-n' }, String(totalBin[bin])));
    chips.append(chip);
  }

  // group the collection: subject (level/subject) -> topic (full path) -> items
  const groups = new Map();
  for (const it of coll) {
    const { level, subject, unit } = resolvePath(it.path);
    const [lid, sid, uid] = (it.path || '').split('/');
    const subjKey = `${lid}/${sid}`;
    if (!groups.has(subjKey)) groups.set(subjKey, {
      levelName: level ? level.name : lid,
      subjectName: subject ? subject.name : sid,
      units: new Map(),
    });
    const g = groups.get(subjKey);
    if (!g.units.has(it.path)) g.units.set(it.path, { name: unit ? unit.name : (uid || it.path), items: [] });
    g.units.get(it.path).items.push(it);
  }

  const body = h('div', { class: 'pick-body' });
  for (const [, g] of groups) {
    const unitCbs = [];
    const rows = [];
    for (const [, u] of g.units) {
      const cb = h('input', { type: 'checkbox', class: 'pick-cb', onchange: refresh });
      const countEl = h('span', { class: 'muted small pick-count' }, String(u.items.length));
      const row = h('label', { class: 'pick-unit' },
        cb, h('span', { class: 'pick-unit-name' }, u.name), countEl);
      boxes.push({ cb, items: u.items, countEl, row });
      unitCbs.push(cb);
      rows.push(row);
    }
    const subjCb = h('input', { type: 'checkbox', class: 'pick-cb',
      onchange: (e) => { unitCbs.forEach((c) => { if (!c.disabled) c.checked = e.target.checked; }); refresh(); } });
    subjToggles.push({ cb: subjCb, unitCbs });
    add(body, h('details', { class: 'pick-subj', open: true },
      h('summary', {}, h('label', { class: 'pick-subj-head' },
        subjCb,
        h('span', { class: 'pick-subj-name' },
          h('strong', {}, g.subjectName), ' ',
          h('span', { class: 'muted small' }, g.levelName)),
        h('span', { class: 'muted small' }, `${g.units.size} topic${g.units.size === 1 ? '' : 's'}`))),
      h('div', { class: 'pick-units' }, ...rows)));
  }

  refresh();
  render(h('div', { class: 'stack' },
    crumb([['Home', '#/'], ['Drill', null]]),
    h('h1', {}, 'What do you want to drill?'),
    h('p', { class: 'muted' },
      "These are the words you've already built. Tick any subjects or topics, filter by how well you know them, then drill."),
    h('div', { class: 'row gap' },
      h('a', { class: 'btn ghost small', href: '#/drill?scope=all' }, 'Or drill everything I’ve built →')),
    drillModeSettings(),
    chips,
    body,
    footer));
}

// Which question TYPES show up during the drill, e.g. a student who isn't
// confident in their home language yet can turn off "home language → English"
// and keep everything else. All on by default; at least one always stays on.
function drillModeSettings() {
  const prefs = drillRungPrefs();
  const rows = [1, 2, 3, 4, 5].map((r) => {
    const cb = h('input', { type: 'checkbox', class: 'pick-cb' });
    cb.checked = !!prefs[r];
    cb.onchange = () => {
      const cur = setDrillRungPref(r, cb.checked);
      cb.checked = !!cur[r]; // reflect the "always leave one on" guard
    };
    return h('label', { class: 'pick-unit' }, cb, h('span', { class: 'pick-unit-name' }, RUNG_LABELS[r]));
  });
  return h('details', { class: 'pick-subj' },
    h('summary', {}, h('span', { class: 'pick-subj-head' },
      h('strong', {}, 'Drill settings'), ' ', h('span', { class: 'muted small' }, 'question types'))),
    h('div', { class: 'pick-units' }, ...rows));
}

// ---------------------------------------------------------------------------
// DRILL
// ---------------------------------------------------------------------------
function renderDrill() {
  // The drill always begins on the Pick page. Only an explicitly scoped entry
  // runs a session:
  //   scope=1   — a live custom set chosen on the Pick page (held in memory).
  //   scope=all — rebuild the scope from the WHOLE collection ("drill everything
  //               I've built"); reload-safe since it re-derives from storage.
  // Anything else — a plain #/drill, or a scope=1 whose in-memory set was lost
  // on reload — is not a real request, so bounce to the Pick page.
  const flag = (/[?&]scope=([a-z0-9]+)/i.exec(location.hash) || [])[1];
  if (flag === 'all') DRILL_SCOPE = new Set(store.getCollection().map((it) => it.key));
  else if (flag !== '1') DRILL_SCOPE = null;
  if (!DRILL_SCOPE || !DRILL_SCOPE.size) {
    DRILL_SCOPE = null;
    location.hash = '#/pick';
    return;
  }
  if (scopedDue().length === 0) {
    return render(h('div', { class: 'stack center-card' },
      h('div', { class: 'card done-card' },
        h('div', { class: 'big-emoji' }, '🎉'),
        h('h2', {}, 'This set is all done'),
        h('p', { class: 'muted' },
          'Every word you picked is already mastered. Pick another set to keep revising.'),
        h('div', { class: 'row gap center' },
          h('a', { class: 'btn primary', href: '#/pick' }, 'Pick words')))));
  }
  const startCount = scopedDue().length;
  let done = 0;
  // Words missed THIS session go into a relearn set. A wrong answer shows the
  // answer, then puts the card back in the live deck: the session will not end
  // while any relearn card is still unresolved (answered wrong and not yet
  // re-answered correctly). SOFT is the normal session length; past it we keep
  // serving ONLY unresolved relearn cards, up to a HARD safety ceiling.
  const relearn = new Set();
  const SOFT = startCount + 40, HARD = startCount + 80;

  function wordData(item) {
    const { unit } = resolvePath(item.path);
    const w = unit && unit.words.find((x) => x.word === item.word);
    return w || { word: item.word, meaning: '', example: '', parts: [], translations: {} };
  }
  function head(remaining) {
    return h('div', { class: 'learn-head' },
      h('div', {},
        h('span', { class: 'muted small' },
          `${remaining} in rotation`, DRILL_SCOPE ? ` · ${scopeLabel()}` : ''),
        h('div', { class: 'progress thin' },
          h('div', { class: 'progress-fill', style: `width:${Math.min(100, (done / startCount) * 100)}%` }))),
      h('a', { class: 'btn ghost small', href: '#/' }, 'Exit'));
  }

  // ---- honesty + rigour --------------------------------------------------
  // Every card makes the student PRODUCE or SELECT the answer, then grades that
  // real input — no "Show answer → I promise I knew it". The prompt is always
  // the MEANING (definition and/or home gloss), never the English word or its
  // morpheme chips, so the question can't answer itself.
  //
  // Cards climb a five-rung difficulty ladder:
  //   1  home gloss  → pick the English word   (easiest, L1 crutch)
  //   2  definition  → pick the English word   (no crutch)
  //   3  fix the word: one morpheme is wrong — tap the bad piece
  //   4  build the word from a distractored morpheme bank
  //   5  type the English word                 (hardest)
  // The rung is chosen PROBABILISTICALLY. A bell of weight sits over the ladder,
  // centred on the student's current level (Leitner box + streak); as they
  // improve, the centre slides toward the harder rungs — but every available
  // rung keeps a non-zero floor, so any rung is always possible. This
  // generalises the old two-way coin (floor/ceiling) to five outcomes.
  //
  // TWO overrides sit above the probabilistic pick:
  //   * FIRST GO — a word's very first attempt (never reviewed before) is always
  //     rung 4 (build from morphemes), never an easier rung. You cannot skip
  //     assembling a new word from its parts. (Only if it has 2+ morphemes.)
  //   * Every card is an active attempt before the answer is shown — there is no
  //     passive "did you know it?" self-report.
  const RUNG_DIFFICULTY = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
  function pickRung(box, streak, avail) {
    const rungs = [1, 2, 3, 4, 5].filter((r) => avail[r]);
    if (rungs.length <= 1) return rungs[0] || 5;
    const target = Math.max(1, Math.min(5, 1 + (box - 1) + streak * 0.5));
    const sigma = 1.2, floor = 0.06;
    const weights = rungs.map((r) => floor + Math.exp(-((RUNG_DIFFICULTY[r] - target) ** 2) / (2 * sigma * sigma)));
    const sum = weights.reduce((a, b) => a + b, 0);
    let x = Math.random() * sum;
    for (let i = 0; i < rungs.length; i++) { x -= weights[i]; if (x <= 0) return rungs[i]; }
    return rungs[rungs.length - 1];
  }
  // Same-type morphemes NOT in this word — used to corrupt one piece (rung 3)
  // and to salt the build bank (rung 4).
  function sameTypeDistractors(unit, part, correctSurfaces) {
    const bank = unit ? unitMorphemeBank(unit) : { prefix: [], root: [], suffix: [] };
    const correct = new Set(correctSurfaces.map((s) => s.toLowerCase()));
    return (bank[part.type] || []).filter((m) => !correct.has(m.surface.toLowerCase()));
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function normalize(s) {
    return (s || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.。]+$/, '');
  }
  // Wrong multiple-choice options: real sibling words, nearest first (same unit,
  // then same subject, then anywhere) so the decoys are same-field, not random.
  function distractorWords(item, w, n) {
    const { subject, unit } = resolvePath(item.path);
    const seen = new Set([w.word.toLowerCase()]);
    const tier = (words, out) => {
      for (const word of words) {
        const k = word.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.push(word); }
      }
    };
    const tU = [], tS = [], tA = [];
    if (unit) tier(unit.words.map((x) => x.word), tU);
    if (subject) for (const u of subject.units) tier(u.words.map((x) => x.word), tS);
    for (const lvl of DATA.levels) for (const s of lvl.subjects) for (const u of s.units) tier(u.words.map((x) => x.word), tA);
    return [...shuffle(tU), ...shuffle(tS), ...shuffle(tA)].slice(0, n);
  }
  // Extra morphemes to salt the build bank with, so the right pieces aren't the
  // only pieces on offer (that would hand over the answer).
  function distractorMorphemes(unit, correctSurfaces, n) {
    const bank = unit ? unitMorphemeBank(unit) : { prefix: [], root: [], suffix: [] };
    const all = [...bank.prefix, ...bank.root, ...bank.suffix];
    const correct = new Set(correctSurfaces.map((s) => s.toLowerCase()));
    return shuffle(all.filter((m) => !correct.has(m.surface.toLowerCase()))).slice(0, n);
  }

  function ctx(item) {
    const w = wordData(item);
    const collItem = store.getItem(item.key);
    const streak = collItem ? (collItem.streak || 0) : 0;
    const box = collItem ? (collItem.box || 1) : 1;
    const lang = getLang();
    const { unit: wUnit } = resolvePath(item.path);
    const dispLang = wUnit ? unitDisplayLang(wUnit, lang) : lang;
    const wholeWord = pickExact(w.translations, lang) || pickExact(w.translations, dispLang);
    return { w, streak, box, lang, wUnit, dispLang, wholeWord };
  }
  const streakFlame = (streak) => (streak >= 2 ? h('p', { class: 'flash-streak' }, `🔥 ${streak} in a row`) : null);
  // The question: the meaning only. Never the English word, never its morphemes.
  // mode 'home' shows only the home gloss (rung 1), 'def' only the definition
  // (rung 2), 'both' shows whatever exists (build/type).
  function meaningPrompt(c, mode = 'both') {
    const showDef = mode !== 'home' && c.w.meaning;
    const showHome = mode !== 'def' && c.wholeWord;
    return h('div', { class: 'mc-prompt' },
      showDef && h('p', { class: 'meaning big' }, c.w.meaning),
      showHome && h('p', { class: 'flash-translation' }, c.wholeWord, say(c.wholeWord, c.lang, 'sm')),
      !showDef && !showHome && h('p', { class: 'muted' }, 'Recall this word.'));
  }

  // The next card to serve, or null when the session should end. Normal run:
  // the most-due word. Past the SOFT cap we keep going ONLY to clear unresolved
  // relearn cards (words missed this session), so a wrong answer always comes
  // back before the session ends — up to the HARD safety ceiling.
  function nextItem() {
    const active = scopedDue();
    if (!active.length || done >= HARD) return null;
    if (done < SOFT) return active[0];
    return active.find((it) => relearn.has(it.key)) || null;
  }

  function show() {
    const item = nextItem();
    if (!item) return finish();
    const c = ctx(item);
    const parts = c.w.parts || [];
    const correctSurfaces = parts.map((p) => p.surface.toLowerCase());
    const canBuild = parts.length >= 2;
    const canCorrupt = canBuild && parts.some((p) => sameTypeDistractors(c.wUnit, p, correctSurfaces).length > 0);
    const stored = store.getItem(item.key);
    const firstGo = !stored || (stored.reps || 0) === 0;
    // FIRST GO: a brand-new word must be built from its morphemes — no skipping
    // to an easier rung. (Falls through if the word doesn't decompose.)
    if (firstGo && canBuild) return produceBuild(item, c);
    const hasPrompt = !!(c.w.meaning || c.wholeWord);
    // Nothing to prompt with (no definition, no translation): still make them
    // produce — build if we can, otherwise type. Never a passive self-report.
    if (!hasPrompt) return canBuild ? produceBuild(item, c) : produceType(item, c);
    // Which rungs this word can support (see the ladder above), narrowed by
    // the student's own rung preferences (Pick page — off by default is
    // "everything on").
    const rungPrefs = drillRungPrefs();
    const avail = {
      1: !!c.wholeWord && rungPrefs[1],      // home gloss → pick EN
      2: !!c.w.meaning && rungPrefs[2],      // definition → pick EN
      3: canCorrupt && rungPrefs[3],         // fix the wrong morpheme
      4: canBuild && rungPrefs[4],           // build from morphemes
      5: rungPrefs[5],                       // type the word
    };
    // Every rung this word could otherwise support got filtered out by
    // preference (e.g. only rung 1 was available and the student turned it
    // off) — fall back to typing rather than showing a blank card.
    if (![1, 2, 3, 4, 5].some((r) => avail[r])) avail[5] = true;
    switch (pickRung(c.box, c.streak, avail)) {
      case 1: return recognise(item, c, 'home');
      case 2: return recognise(item, c, 'def');
      case 3: return fixMorpheme(item, c);
      case 4: return produceBuild(item, c);
      default: return produceType(item, c);
    }
  }

  // ---- rungs 1 & 2 — recognise: meaning → pick the English word ----------
  function recognise(item, c, mode) {
    const options = shuffle([c.w.word, ...distractorWords(item, c.w, 3)]);
    let committed = false;
    const grid = h('div', { class: 'mc-grid' });
    options.forEach((optWord) => {
      const btn = h('button', { class: 'btn mc-option', type: 'button', onclick: () => {
        if (committed) return;
        committed = true;
        const ok = optWord === c.w.word;
        btn.classList.add(ok ? 'good' : 'bad');
        if (!ok) [...grid.children].forEach((el) => { if (el.textContent === c.w.word) el.classList.add('good'); });
        setTimeout(() => grade(item, c, ok), 600);
      } }, optWord);
      grid.append(btn);
    });
    render(h('div', { class: 'stack drill' }, head(scopedDue().length),
      h('div', { class: 'card flash' },
        h('div', { class: 'flash-face' },
          streakFlame(c.streak),
          h('p', { class: 'kicker' }, 'Which word means this?'),
          meaningPrompt(c, mode),
          grid))));
  }

  // ---- rung 3 — fix the word: one morpheme is wrong, tap the bad piece ----
  function fixMorpheme(item, c) {
    const parts = c.w.parts;
    const correctSurfaces = parts.map((p) => p.surface.toLowerCase());
    // Corrupt one position that has a same-type replacement available.
    const spoilable = parts
      .map((p, i) => ({ i, pool: sameTypeDistractors(c.wUnit, p, correctSurfaces) }))
      .filter((x) => x.pool.length > 0);
    const pick = spoilable[Math.floor(Math.random() * spoilable.length)];
    const wrongIdx = pick.i;
    const wrongPiece = shuffle(pick.pool)[0];
    // The displayed (broken) sequence: the real pieces, with one swapped out.
    const seq = parts.map((p, i) => (i === wrongIdx ? { surface: wrongPiece.surface, type: wrongPiece.type } : p));
    let committed = false;
    const row = h('div', { class: 'chips center fix-row' });
    seq.forEach((p, i) => {
      const chip = h('button', { class: `chip ${p.type} fix-chip`, type: 'button', onclick: () => {
        if (committed) return;
        committed = true;
        const ok = i === wrongIdx;
        chip.classList.add(ok ? 'good' : 'bad');
        if (!ok) [...row.children][wrongIdx].classList.add('good');
        setTimeout(() => grade(item, c, ok), 650);
      } }, p.surface);
      row.append(chip);
    });
    render(h('div', { class: 'stack drill' }, head(scopedDue().length),
      h('div', { class: 'card flash' },
        h('div', { class: 'flash-face' },
          streakFlame(c.streak),
          h('p', { class: 'kicker' }, 'One piece is wrong for this meaning — tap it'),
          meaningPrompt(c),
          row))));
  }

  // ---- produce (build): meaning → assemble the word from morphemes --------
  function produceBuild(item, c) {
    const correct = c.w.parts.map((p) => p.surface.toLowerCase());
    const slots = correct.map(() => null);
    const bankItems = shuffle([...c.w.parts, ...distractorMorphemes(c.wUnit, correct, 4)]);
    let dragging = null;
    let committed = false;
    const card = h('div', { class: 'card flash' });

    function place(type, surface) {
      let i = c.w.parts.findIndex((p, idx) => p.type === type && slots[idx] === null);
      if (i < 0) i = slots.findIndex((s) => s === null);
      if (i >= 0) { slots[i] = surface; draw(); }
    }
    function slotRow() {
      const row = h('div', { class: 'slots' });
      c.w.parts.forEach((p, i) => {
        const slot = h('button', {
          class: `slot ${p.type} ${slots[i] ? 'filled' : 'empty'}`, type: 'button',
          onclick: () => { if (!committed && slots[i]) { slots[i] = null; draw(); } },
          ondragover: (e) => { e.preventDefault(); slot.classList.add('dragover'); },
          ondragleave: () => slot.classList.remove('dragover'),
          ondrop: (e) => { e.preventDefault(); if (!committed && dragging) { slots[i] = dragging; draw(); } },
        }, slots[i] || p.type);
        row.append(slot);
      });
      return row;
    }
    function bankRow() {
      const row = h('div', { class: 'chips center drill-bank' });
      bankItems.forEach((m) => {
        const surface = m.surface.toLowerCase();
        const dim = slots.includes(surface);
        row.append(h('div', {
          class: `chip ${m.type} bank-chip ${dim ? 'dim' : ''}`, draggable: 'true',
          ondragstart: () => { dragging = surface; },
          ondragend: () => { dragging = null; },
          onclick: () => { if (!committed) place(m.type, surface); },
        }, m.surface));
      });
      return row;
    }
    function draw() {
      card.innerHTML = '';
      const face = h('div', { class: 'flash-face' });
      add(face,
        streakFlame(c.streak),
        h('p', { class: 'kicker' }, 'Build the word that means this'),
        meaningPrompt(c),
        slotRow(),
        h('div', { class: 'row gap center' },
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => { if (!committed) { slots.fill(null); draw(); } } }, 'Clear'),
          h('button', { class: 'btn primary', type: 'button', onclick: check }, 'Check')),
        h('div', { class: 'feedback', id: 'dfb' }),
        bankRow());
      card.append(face);
    }
    function check() {
      if (committed) return;
      const fb = card.querySelector('#dfb');
      if (slots.some((s) => s === null)) { fb.className = 'feedback warn'; fb.textContent = 'Put a morpheme in every slot first.'; return; }
      committed = true;
      grade(item, c, slots.every((s, i) => s === correct[i]));
    }
    render(h('div', { class: 'stack drill' }, head(scopedDue().length), card));
    draw();
  }

  // ---- produce (type): meaning → type the English word -------------------
  function produceType(item, c) {
    let committed = false;
    const input = h('input', {
      class: 'guess-input', type: 'text', autocomplete: 'off', autocapitalize: 'off',
      autocorrect: 'off', spellcheck: 'false', placeholder: 'Type the English word…',
    });
    function submit() {
      if (committed || !input.value.trim()) return;
      committed = true;
      grade(item, c, normalize(input.value) === normalize(c.w.word), input.value);
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    render(h('div', { class: 'stack drill' }, head(scopedDue().length),
      h('div', { class: 'card flash' },
        h('div', { class: 'flash-face' },
          streakFlame(c.streak),
          h('p', { class: 'kicker' }, 'Type the word that means this'),
          meaningPrompt(c),
          input,
          h('button', { class: 'btn primary', type: 'button', onclick: submit }, 'Check')))));
    input.focus();
  }

  // ---- grade the real attempt, then reveal the full word to learn from ----
  function grade(item, c, ok, typed) {
    store.reviewItem(item.key, ok);
    // Missed words re-enter the live deck for this session; getting one right
    // (this time or a later re-test) clears it.
    if (ok) relearn.delete(item.key); else relearn.add(item.key);
    done++;
    reveal(item, c, ok, typed);
  }
  function reveal(item, c, ok, typed) {
    const remaining = scopedDue().length;
    const more = nextItem() != null;
    const stored = store.getItem(item.key);
    const streak = stored ? (stored.streak || 0) : 0;
    const suggestMaster = stored && !stored.mastered && streak >= store.MASTERY_STREAK;
    const morphRows = (c.w.parts || []).map((p) => {
      const native = pickExact(p.translations, c.dispLang);
      return h('div', { class: 'write-row reveal-row' },
        h('span', { class: `chip ${p.type}` }, p.surface),
        h('span', { class: 'write-en' }, p.meaning || '—'),
        native && h('span', { class: 'answer' }, native));
    });
    render(h('div', { class: 'stack drill' }, head(remaining),
      h('div', { class: `card flash reveal ${ok ? 'ok' : 'no'}` },
        h('div', { class: 'flash-face' },
          h('p', { class: `kicker ${ok ? 'good-text' : 'bad-text'}` }, ok ? '✓ Correct' : '✗ Not quite'),
          h('div', { class: 'flash-word' }, c.w.word, say(c.w.word, 'en', 'lg')),
          c.wholeWord && h('p', { class: 'flash-translation' }, c.wholeWord, say(c.wholeWord, c.lang, 'sm')),
          morphRows.length ? h('div', { class: 'write-list' }, ...morphRows) : null,
          c.w.meaning && h('p', { class: 'meaning' }, c.w.meaning),
          c.w.example && h('p', { class: 'example' }, '“' + c.w.example + '”'),
          (typed && !ok) ? h('p', { class: 'muted small' }, 'You wrote: ' + typed) : null,
          h('div', { class: 'row gap center' },
            h('button', { class: 'btn primary', type: 'button', onclick: show }, more ? 'Next →' : 'Finish'),
            suggestMaster && h('button', {
              class: 'btn ghost small master-suggest', type: 'button',
              onclick: () => { store.moveToBin(item.key, 'mastered'); show(); },
            }, `⭐ ${streak}× in a row — mark mastered`))))));
    speech.speak(c.w.word, 'en');
  }
  function finish() {
    const s = store.stats();
    render(h('div', { class: 'stack center-card' },
      h('div', { class: 'card done-card' },
        h('div', { class: 'big-emoji' }, '✅'),
        h('h2', {}, 'Drill finished'),
        h('p', { class: 'muted' }, `${s.mastered} mastered · ${s.learning} still in rotation`),
        h('div', { class: 'row gap center' },
          scopedDue().length > 0 && h('button', { class: 'btn primary', onclick: () => { done = 0; show(); } }, 'Go again'),
          h('a', { class: 'btn ghost', href: '#/pick' }, 'Pick more'),
          h('a', { class: 'btn ghost', href: '#/words' }, 'My words')))));
  }
  show();
}

// ---------------------------------------------------------------------------
// MY WORDS + LOG
// ---------------------------------------------------------------------------
function labelForPath(path) {
  const { level, subject, unit } = resolvePath(path);
  if (!unit) return path;
  return `${level.name} · ${subject.name} · ${unit.name}`;
}
function labelForSubject(subjPath) {
  const [lid, sid] = (subjPath || '').split('/');
  const level = levelById(lid);
  const subject = subjectById(level, sid);
  return subject ? `${level.name} · ${subject.name}` : subjPath;
}

// ---------------------------------------------------------------------------
// PROGRESS — streak, milestones, per-subject mastery
// ---------------------------------------------------------------------------
const MILESTONES = [
  { n: 1, icon: '🌱', label: 'First word', metric: 'total' },
  { n: 10, icon: '📗', label: '10 mastered', metric: 'mastered' },
  { n: 25, icon: '📘', label: '25 mastered', metric: 'mastered' },
  { n: 50, icon: '🏅', label: '50 mastered', metric: 'mastered' },
  { n: 100, icon: '🏆', label: '100 mastered', metric: 'mastered' },
  { n: 200, icon: '👑', label: '200 mastered', metric: 'mastered' },
];
const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
function renderProgress() {
  const s = store.stats();
  const st = store.streak();
  const subjects = store.masteryBySubject();
  const dueCount = store.dueForReview().length;
  render(h('div', { class: 'stack' },
    crumb([['Home', '#/'], ['My progress', null]]),
    h('h1', {}, 'My progress'),
    // Streak hero
    h('div', { class: 'card streak-card' },
      h('div', { class: 'streak-flame' }, st.current > 0 ? '🔥' : '💤'),
      h('div', { class: 'streak-body' },
        h('div', { class: 'streak-num' }, `${st.current}`,
          h('span', { class: 'streak-unit' }, st.current === 1 ? ' day streak' : ' day streak')),
        h('p', { class: 'muted small' }, st.current === 0
          ? 'Do one word today to start a streak.'
          : st.today ? 'You showed up today — nice.' : 'Come back today to keep it going!'),
        st.best > 0 && h('p', { class: 'muted small' }, `Best streak: ${plural(st.best, 'day')}`))),
    // Headline stats
    h('div', { class: 'statbar' },
      stat('Words started', s.total), stat('Mastered', s.mastered),
      stat('In rotation', s.learning), stat('Reviews', s.reviews),
      dueCount > 0 && h('a', { class: 'btn primary', href: '#/pick' }, 'Revise now')),
    // Milestones
    h('h2', { class: 'section-title' }, 'Milestones'),
    h('div', { class: 'badges' }, ...MILESTONES.map((m) => {
      const have = s[m.metric] || 0;
      const earned = have >= m.n;
      return h('div', { class: `badge-tile ${earned ? 'earned' : 'locked'}`,
        title: earned ? `Earned — ${m.label}` : `${m.n - have} more to go` },
        h('div', { class: 'badge-icon' }, earned ? m.icon : '🔒'),
        h('div', { class: 'badge-label' }, m.label));
    })),
    // Per-subject mastery
    h('h2', { class: 'section-title' }, 'By subject'),
    subjects.length === 0
      ? h('p', { class: 'muted' }, 'No words yet — build some from a unit and they’ll show up here.')
      : h('div', { class: 'subj-progress' }, ...subjects.map((b) => {
          const pct = b.total ? Math.round((b.mastered / b.total) * 100) : 0;
          return h('div', { class: 'subj-row' },
            h('div', { class: 'subj-line' },
              h('span', {}, labelForSubject(b.subject)),
              h('span', { class: 'muted small' }, `${b.mastered}/${b.total} mastered`)),
            h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${pct}%` })));
        }))));
}
const BIN_META = {
  learning: { icon: '🌱', name: 'Learning', note: 'new or tricky — keep practising' },
  consolidating: { icon: '🔁', name: 'Consolidating', note: 'sticking now — a few more in a row and it’s mastered' },
  mastered: { icon: '⭐', name: 'Mastered', note: 'out of the revision pile' },
};

function renderWords() {
  const s = store.stats();
  const by = store.bins();

  // Buttons to move a word into whichever bins it isn't already in.
  function moveBtns(it) {
    const bin = store.binOf(it);
    return h('div', { class: 'wr-move' },
      h('span', { class: 'muted small' }, 'Move to:'),
      ...store.BINS.filter((b) => b !== bin).map((b) =>
        h('button', {
          class: 'btn ghost xs', title: `Move “${it.word}” to ${BIN_META[b].name}`,
          onclick: () => { store.moveToBin(it.key, b); renderWords(); },
        }, `${BIN_META[b].icon} ${BIN_META[b].name}`)));
  }
  function row(it) {
    const streak = it.streak || 0;
    return h('div', { class: 'word-row' },
      h('div', { class: 'wr-main' },
        h('span', { class: 'wr-word' }, it.word, say(it.word)),
        h('span', { class: 'muted small' }, labelForPath(it.path))),
      h('div', { class: 'wr-meta' },
        streak >= 2 && h('span', { class: 'pill streak' }, `🔥 ${streak}`),
        it.mastered ? h('span', { class: 'pill good' }, 'Mastered') : h('span', { class: 'pill' }, `Box ${it.box}/5`),
        moveBtns(it)));
  }
  function binSection(binId) {
    const list = by[binId].sort((a, b) => (b.streak || 0) - (a.streak || 0)
      || a.path.localeCompare(b.path) || a.word.localeCompare(b.word));
    const m = BIN_META[binId];
    return h('div', { class: `bin bin-${binId}` },
      h('div', { class: 'bin-head' },
        h('h2', {}, `${m.icon} ${m.name}`),
        h('span', { class: 'pill' }, String(list.length)),
        h('span', { class: 'muted small' }, m.note)),
      list.length
        ? h('div', { class: 'word-list' }, ...list.map(row))
        : h('p', { class: 'muted small' }, 'Nothing here yet.'));
  }
  render(h('div', { class: 'stack' },
    crumb([['Home', '#/'], ['My words', null]]),
    h('h1', {}, 'My words'),
    h('div', { class: 'statbar' },
      stat('Total', s.total), stat('Mastered', s.mastered), stat('Learning', s.learning),
      store.dueForReview().length > 0 && h('a', { class: 'btn primary', href: '#/pick' }, 'Revise now')),
    s.total === 0
      ? h('p', { class: 'muted' }, 'No words yet — build some from a unit to start your collection.')
      : h('div', { class: 'bins' }, ...store.BINS.map(binSection)),
    logSection()));
}
function logSection() {
  const log = store.getLog().slice(0, 40);
  if (!log.length) return h('div');
  const labelFor = { learned: 'built', review_correct: 'got it', review_wrong: 'missed',
    mastered: 'mastered ⭐', requested: 'requested ✉️' };
  return h('details', { class: 'ref' },
    h('summary', {}, `Progress log (${store.getLog().length} events)`),
    h('div', { class: 'log' }, ...log.map((e) => h('div', { class: 'log-row' },
      h('span', { class: 'muted small' }, new Date(e.at).toLocaleString()),
      h('span', {}, labelFor[e.action] || e.action),
      h('span', { class: 'wr-word sm' }, e.word || '')))));
}

// ---------------------------------------------------------------------------
// BROWSE + MORPHEME BANK
// ---------------------------------------------------------------------------
function renderBrowse({ levelId, subjectId, unitId }) {
  const path = `${levelId}/${subjectId}/${unitId}`;
  const { level, subject, unit } = resolvePath(path);
  if (!unit) return renderHome();
  const lang = getLang();
  const anyTrans = unit.words.some((w) => w.translations && Object.keys(w.translations).length);
  render(h('div', { class: 'stack' },
    crumb(unitCrumbItems(level, subject, unit)),
    h('h1', {}, unit.name),
    h('p', { class: 'muted' }, `${unit.words.length} words`),
    anyTrans && h('div', { class: 'row gap' },
      h('span', { class: 'muted small' }, 'Showing translations in:'), langPicker()),
    h('p', { class: 'muted small' },
      'Tap any coloured word-part to see every other word that shares it.'),
    anyTrans
      ? h('div', { class: 'word-list' }, ...unit.words.map((w) => h('div', { class: 'word-row' },
          h('div', { class: 'wr-main' },
            h('span', { class: 'wr-word' }, w.word, say(w.word)),
            h('span', { class: 'wr-trans' }, pickTranslation(w.translations, lang) || h('span', { class: 'muted small' }, '—'))),
          w.meaning && h('p', { class: 'wr-def' }, w.meaning),
          (w.parts && w.parts.length >= 2) && h('div', { class: 'wr-morphs' },
            ...w.parts.map((p) => morphemeChip(p))),
          w.example && h('p', { class: 'wr-example' }, '“' + w.example + '”'),
          w.context && h('p', { class: 'wr-context' }, h('b', {}, 'In the text: '), w.context),
          w.origin && h('details', { class: 'word-story compact' },
            h('summary', {}, 'Word story'), h('p', {}, w.origin)))))
      : h('div', { class: 'chips' }, ...unit.words.map((w) => h('span', { class: 'chip ghost lg' }, w.word, say(w.word))))));
}

function renderMorphemes({ levelId, subjectId }) {
  const level = levelById(levelId);
  const subject = subjectById(level, subjectId);
  if (!subject) return renderHome();
  const lang = getLang();
  const { prefixes, roots, suffixes } = subject.morphemes;
  const rows = Math.max(prefixes.length, roots.length, suffixes.length);
  const dispLang = displayLangFor([...prefixes, ...roots, ...suffixes].map((m) => m.translations), lang);

  // Recreates the teacher's own "student view" spreadsheet layout exactly:
  // Prefixes|meaning|translated | Roots|meaning|translated | Suffixes|meaning|translated
  const cell = (list, i, cls, field) => {
    const m = list[i];
    if (!m) return h('td', { class: cls });
    if (field === 'morph') return h('td', { class: `${cls} morph-cell` }, m.morpheme);
    if (field === 'meaning') return h('td', { class: cls }, m.meaning || '');
    return h('td', { class: `${cls} native-cell` }, pickExact(m.translations, dispLang));
  };
  const bodyRows = [];
  for (let i = 0; i < rows; i++) {
    bodyRows.push(h('tr', {},
      cell(prefixes, i, 'prefix', 'morph'), cell(prefixes, i, 'prefix', 'meaning'), cell(prefixes, i, 'prefix', 'native'),
      cell(roots, i, 'root', 'morph'), cell(roots, i, 'root', 'meaning'), cell(roots, i, 'root', 'native'),
      cell(suffixes, i, 'suffix', 'morph'), cell(suffixes, i, 'suffix', 'meaning'), cell(suffixes, i, 'suffix', 'native')));
  }

  render(h('div', { class: 'stack' },
    crumb([['Home', '#/'], [level.name, `#/l/${level.id}`],
      [subject.name, `#/l/${level.id}/${subject.id}`], ['Morphemes', null]]),
    h('h1', {}, 'Morpheme bank'),
    h('p', { class: 'muted' }, `${subject.name} — prefixes, roots and suffixes`),
    h('div', { class: 'row gap' },
      h('span', { class: 'muted small' }, 'Showing translations in:'), langPicker()),
    h('div', { class: 'bank-legend' },
      h('span', {}, h('i', { class: 'prefix' }), 'Prefixes'),
      h('span', {}, h('i', { class: 'root' }), 'Roots'),
      h('span', {}, h('i', { class: 'suffix' }), 'Suffixes')),
    h('div', { class: 'bank-table-wrap' },
      h('table', { class: 'bank-table' },
        h('thead', {},
          h('tr', {},
            h('th', { class: 'prefix group-head', colspan: '3' }, 'Prefixes'),
            h('th', { class: 'root group-head', colspan: '3' }, 'Roots'),
            h('th', { class: 'suffix group-head', colspan: '3' }, 'Suffixes')),
          h('tr', {},
            h('th', { class: 'prefix' }, 'Morpheme'), h('th', { class: 'prefix' }, 'Meaning'), h('th', { class: 'prefix' }, 'Translated'),
            h('th', { class: 'root' }, 'Morpheme'), h('th', { class: 'root' }, 'Meaning'), h('th', { class: 'root' }, 'Translated'),
            h('th', { class: 'suffix' }, 'Morpheme'), h('th', { class: 'suffix' }, 'Meaning'), h('th', { class: 'suffix' }, 'Translated'))),
        h('tbody', {}, ...bodyRows))),
  ));
}

// ---------------------------------------------------------------------------
// MORPHEME DICTIONARY — search any word-part across the whole site
// ---------------------------------------------------------------------------
// The Morpheme Bank above is per-subject: it answers "what pieces are in THIS
// topic". The dictionary is the other direction — one searchable index of every
// piece the site knows, so a student who meets "hydro" in Geography can find it
// again in Chemistry, and see it reaches past the syllabus into "hydrant" and
// "dehydrated" too.
//
// Each result shows two tiers, in this order and never merged:
//   1. words from OUR word lists  — real, tappable, drillable, in full colour
//   2. other everyday English words — lighter, not links, context only
// Tier 2 is curated (data/morpheme_extras.json); a piece with none simply shows
// none, rather than a guess.
const DICT_CAP = 24;        // senses rendered per search
const DICT_WORD_CAP = 30;   // curriculum words listed inside one sense

function dictEntries() {
  const d = (DATA && DATA.morpheme_dictionary) || {};
  return Object.keys(d).map((id) => Object.assign({ id }, d[id]));
}
// Rank a sense against the query. Higher is better; 0 means "no match".
// Deliberately ordered so the piece a student typed lands first, then pieces
// whose MEANING they typed, then pieces found inside a word they typed —
// searching "photosynthesis" should surface photo/syn/thesis.
function dictScore(e, q) {
  // Any spelling of the morpheme should find it: a student who met "col" in
  // "collaborate" types col, not the citation form con-.
  const spellings = e.variants && e.variants.length ? e.variants : [e.surface];
  const surf = spellings.includes(q) ? q : e.surface;
  if (spellings.includes(q)) return 1000 + e.words.length;
  if (spellings.some((s) => s.startsWith(q))) return 800 + e.words.length;
  if (q.length >= 3 && spellings.some((s) => s.includes(q))) return 600 + e.words.length;
  const gloss = (e.gloss + ' ' + e.aka.join(' ')).toLowerCase();
  if (new RegExp(`(^|[^a-z])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(gloss)) {
    return 400 + e.words.length;
  }
  // The query is a whole word — does this piece build it? ("photosynthesis"
  // should surface photo/syn/thesis.) Kept tight, because a loose version of
  // this rule is pure noise: it made a search for the MEANING "water" return
  // "at" and "ate" (both substrings of w-at-er). So: the query must be long
  // enough to really be a word, the piece must be a substantial chunk, and it
  // must be a piece the site actually builds words from — a 1-word entry here
  // is nearly always a bad parse, not a morpheme worth teaching.
  const taught = e.words.length >= 2 || (e.extras && e.extras.length > 0);
  if (q.length >= 6 && taught) {
    const hit = spellings.filter((s) => s.length >= 3 && q.includes(s))
      .sort((a, b) => b.length - a.length)[0];
    if (hit) return 100 + hit.length * 10 + Math.min(e.words.length, 9);
  }
  return 0;
}
function dictSearch(q, typeFilter) {
  const all = dictEntries().filter((e) => !typeFilter || e.type === typeFilter);
  if (!q) {
    // No query: the most generative pieces, as a browsable starting point.
    return all.slice().sort((a, b) => b.words.length - a.words.length).slice(0, DICT_CAP);
  }
  return all
    .map((e) => ({ e, s: dictScore(e, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.surface.localeCompare(b.e.surface))
    .slice(0, DICT_CAP)
    .map((x) => x.e);
}
function dictSenseCard(e, q) {
  const typeLabel = { prefix: 'prefix', root: 'root', suffix: 'suffix' }[e.type] || '';
  const spellings = e.variants && e.variants.length ? e.variants : [e.surface];
  // Latin prefixes assimilate (ad+tract -> attract) and Latin stems alternate
  // (mit/miss), so one morpheme wears several spellings. They're one entry,
  // written the way a grammar reference writes them: con- / com- / col- / cor-.
  // The spelling the student searched is marked, so they can see they landed in
  // the right place even though the headword is the citation form.
  const spellingRow = spellings.length > 1
    ? h('span', { class: 'dict-variants' },
        ...spellings.flatMap((s, i) => [
          i ? h('span', { class: 'dict-slash' }, '/') : null,
          h('span', { class: `dict-variant${q && s === q ? ' hit' : ''}` }, s),
        ].filter(Boolean)))
    : null;

  const card = h('div', { class: 'dict-card' },
    h('div', { class: 'dict-head' },
      h('span', { class: `mo-chip ${e.type} lg` }, e.surface),
      h('div', { class: 'dict-head-text' },
        h('div', { class: 'dict-gloss' }, e.gloss || '—'),
        h('div', { class: 'muted small dict-sub' },
          spellingRow,
          spellingRow ? ' · ' : '',
          typeLabel,
          e.aka.length ? ` · also glossed “${e.aka.slice(0, 2).join('”, “')}”` : ''))));

  // Tier 1 — the site's own curriculum words. Each keeps the spelling IT uses,
  // so a merged family reads as collaborate / combustion / coagulate / correct
  // rather than pretending they all say "con".
  add(card, h('p', { class: 'dict-tier-label' },
    `In your word lists (${e.words.length})`));
  if (!e.words.length) {
    add(card, h('p', { class: 'muted small' }, 'No words in the site use this piece yet.'));
  } else {
    const list = h('div', { class: 'dict-mine' });
    const more = h('p', { class: 'muted small' });
    const fill = (limit) => {
      list.innerHTML = '';
      for (const [wtext, path, surf] of e.words.slice(0, limit)) {
        const { subject, unit } = resolvePath(path);
        add(list, h('a', {
          class: 'dict-word',
          href: unit ? `#/browse/${path}` : '#/',
          title: subject ? `${subject.name}${unit ? ' · ' + unit.name : ''}` : path,
        }, highlightMorph(wtext, surf)));
      }
      more.innerHTML = '';
      if (e.words.length > limit) {
        // Folding spellings together makes families much bigger, so "…and 99
        // more" would be a dead end rather than an invitation.
        add(more, h('button', {
          class: 'linkish', onclick: () => fill(e.words.length),
        }, `Show all ${e.words.length} →`));
      }
    };
    fill(DICT_WORD_CAP);
    add(card, list);
    add(card, more);
  }

  // Tier 2 — everyday English, deliberately quieter: these are for recognition,
  // not study, so they are not links and carry no unit tag. Bold whichever
  // spelling that word actually uses (compel wears "pel", compulsive "puls").
  if (e.extras && e.extras.length) {
    const boldest = (w) => spellings
      .filter((s) => w.toLowerCase().includes(s))
      .sort((a, b) => b.length - a.length)[0] || e.surface;
    add(card, h('p', { class: 'dict-tier-label faint' }, 'Also in everyday English'));
    add(card, h('div', { class: 'dict-extras' },
      ...e.extras.map((w) => h('span', { class: 'dict-word extra' }, highlightMorph(w, boldest(w))))));
  }

  if (e.words.length >= 2) {
    add(card, h('button', {
      class: 'btn ghost small dict-drill',
      onclick: () => startScopedDrill(e.words.slice(0, DICT_WORD_CAP).map(([w, p]) => [p, w])),
    }, `Drill these ${Math.min(e.words.length, DICT_WORD_CAP)} words →`));
  }
  return card;
}
function renderDictionary() {
  let q = (new URLSearchParams((window.location.hash.split('?')[1] || ''))).get('q') || '';
  let typeFilter = '';

  const input = h('input', {
    class: 'field dict-search', type: 'search', value: q,
    placeholder: 'Search a word-part, a meaning, or a whole word…',
    'aria-label': 'Search morphemes',
  });
  const results = h('div', { class: 'dict-results' });
  const summary = h('p', { class: 'muted small' });

  function draw() {
    const term = q.trim().toLowerCase();
    const hits = dictSearch(term, typeFilter);
    results.innerHTML = '';
    summary.textContent = q.trim()
      ? (hits.length ? `${hits.length} matching word-part${hits.length === 1 ? '' : 's'}`
                     : 'Nothing matched — try a shorter piece, or a meaning like “water”.')
      : 'The pieces that build the most words. Start typing to search all '
        + Object.keys((DATA && DATA.morpheme_dictionary) || {}).length + '.';
    for (const e of hits) add(results, dictSenseCard(e, term));
  }
  input.oninput = () => { q = input.value; draw(); };

  const chip = (label, val) => h('button', {
    class: `bin-chip dict-type${typeFilter === val ? ' active' : ''}`,
    onclick: (ev) => {
      typeFilter = typeFilter === val ? '' : val;
      for (const b of ev.target.parentElement.children) b.classList.remove('active');
      if (typeFilter) ev.target.classList.add('active');
      draw();
    },
  }, label);

  render(h('div', { class: 'stack' },
    crumb([['Home', '#/'], ['Morpheme dictionary', null]]),
    h('h1', {}, 'Morpheme dictionary'),
    h('p', { class: 'muted' },
      'Every prefix, root and suffix on the site — what it means, and which words use it.'),
    input,
    h('div', { class: 'bin-filter' }, chip('Prefixes', 'prefix'), chip('Roots', 'root'), chip('Suffixes', 'suffix')),
    summary,
    results));
  draw();
  if (!q) input.focus();
}

// ---------------------------------------------------------------------------
// ACCOUNT
// ---------------------------------------------------------------------------
function renderAccount() {
  const box = h('div', { class: 'card account-card' });
  if (!sb.isConfigured()) {
    box.append(
      h('h2', {}, 'Local mode'),
      h('p', { class: 'muted' },
        'Your progress is saved in this browser (and works offline). No login is set up. ' +
        'To sync across devices and let a teacher see progress, add Supabase keys in config.js.'),
      h('p', { class: 'muted small' }, 'See README.md → “Turning on accounts”.'));
  } else if (currentUser) {
    box.append(h('h2', {}, 'Signed in'), h('p', {}, currentUser.email || currentUser.id),
      h('button', { class: 'btn ghost', onclick: async () => { await sb.signOut(); } }, 'Sign out'));
  } else {
    const email = h('input', { class: 'field', type: 'email', placeholder: 'you@school.edu' });
    const pw = h('input', { class: 'field', type: 'password', placeholder: 'password' });
    const msg = h('div', { class: 'feedback' });
    box.append(
      h('h2', {}, 'Sign in'),
      h('p', { class: 'muted small' }, 'Use the email + password your teacher gave you.'),
      email, pw,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary', onclick: async () => {
          try { await sb.signInWithPassword(email.value.trim(), pw.value); }
          catch (e) { msg.className = 'feedback bad'; msg.textContent = e.message || 'Sign in failed'; } } }, 'Sign in'),
        h('button', { class: 'btn ghost', onclick: async () => {
          try { const { error } = await sb.signUpWithPassword(email.value.trim(), pw.value); if (error) throw error;
            msg.className = 'feedback ok'; msg.textContent = 'Account made — sign in now (confirm email first if required).'; }
          catch (e) { msg.className = 'feedback bad'; msg.textContent = e.message || 'Sign up failed'; } } }, 'Create account')),
      msg);
  }
  render(h('div', { class: 'stack' }, crumb([['Home', '#/'], ['Account', null]]), h('h1', {}, 'Account'), box));
}

// ---------------------------------------------------------------------------
// HOW TO — an animated step-through tutorial, modeled on the teacher's own
// "EAL Morphology book introduction" slide deck (same words, same worked
// example, same "unpredictable" translations).
// ---------------------------------------------------------------------------
function stagger(children, base = 0.08) {
  children.forEach((el, i) => { if (el && el.style) el.style.animationDelay = `${base * i}s`; });
  return children;
}
function wordChip(word, cls) {
  return h('span', { class: `chip lg howto-pop ${cls || ''}` }, word);
}
// A word split into morphemes, each a chip; `share` names a morpheme surface
// to highlight (the shared "dict" root, or "foot") across every example.
function splitWord(parts, share) {
  const chips = parts.map((p) => h('span', {
    class: `chip lg howto-pop ${share && p.toLowerCase() === share ? 'howto-shared' : ''}`,
  }, p));
  return h('div', { class: 'howto-split' }, ...stagger(chips));
}

// A real, playable build task inside the tutorial — the student drags/taps the
// morphemes of "unpredictable" (the same word the tutorial just walked through),
// sees each part's meaning, and watches used pieces fade. Fresh state each visit.
function howtoBuildDemo() {
  const SLOTS = [
    { type: 'prefix', surface: 'un' }, { type: 'prefix', surface: 'pre' },
    { type: 'root', surface: 'dict' }, { type: 'suffix', surface: 'able' },
  ];
  const BANK = {
    prefix: [['un', 'not'], ['pre', 'before'], ['re', 'again']],
    root: [['dict', 'say'], ['port', 'carry']],
    suffix: [['able', 'can / possible'], ['ing', 'action'], ['ful', 'full of']],
  };
  const correct = SLOTS.map((s) => s.surface);
  const placed = correct.map(() => null);
  let dragging = null;
  const wrap = h('div', { class: 'howto-build howto-pop' });

  function place(type, surface) {
    let i = SLOTS.findIndex((s, idx) => s.type === type && placed[idx] === null);
    if (i < 0) i = placed.findIndex((p) => p === null);
    if (i >= 0) { placed[i] = surface; draw(); }
  }
  function draw() {
    wrap.innerHTML = '';
    const done = placed.every((p, i) => p === correct[i]);
    const slotRow = h('div', { class: 'slots center' });
    SLOTS.forEach((s, i) => {
      const slot = h('button', {
        class: `slot ${s.type} ${placed[i] ? 'filled' : 'empty'}`,
        onclick: () => { if (placed[i]) { placed[i] = null; draw(); } },
        ondragover: (e) => { e.preventDefault(); slot.classList.add('dragover'); },
        ondragleave: () => slot.classList.remove('dragover'),
        ondrop: (e) => { e.preventDefault(); if (dragging) { placed[i] = dragging; draw(); } },
      }, placed[i] || s.type);
      slotRow.append(slot);
    });
    const colFor = (title, list, cls) => h('div', { class: 'mbank-col' },
      h('div', { class: `mbank-head ${cls}` }, title),
      h('div', { class: 'mbank-scroll' }, ...list.map(([surface, mean]) => {
        const used = placed.includes(surface);
        return h('div', { class: `mbank-item ${used ? 'dim' : ''}` },
          h('div', { class: `chip ${cls} bank-chip`, draggable: 'true',
            ondragstart: () => { dragging = surface; }, ondragend: () => { dragging = null; },
            onclick: () => place(cls, surface) }, surface),
          h('span', { class: 'mbank-mean' }, h('span', { class: 'mbank-en' }, mean)));
      })));
    add(wrap,
      h('p', { class: 'kicker' }, 'Your turn — build “unpredictable”'),
      h('p', { class: 'build-hint' }, 'Tap a prefix, root and suffix to drop them into the slots.'),
      slotRow,
      done
        ? h('div', { class: 'feedback ok' }, '✓ unpredictable = not able to be said before it happens')
        : h('div', { class: 'howto-demo-hint muted small' }, 'Each morpheme also shows what it means.'),
      h('div', { class: 'mbank' },
        colFor('Prefixes', BANK.prefix, 'prefix'),
        colFor('Roots', BANK.root, 'root'),
        colFor('Suffixes', BANK.suffix, 'suffix')),
      done && h('p', { class: 'howto-demo-hint muted small' },
        'In your own subjects each part also shows its meaning in your language.'));
  }
  draw();
  return wrap;
}

const HOWTO_STEPS = [
  // 0 — title
  () => [
    h('div', { class: 'howto-emoji howto-pop' }, '🧩'),
    h('h2', { class: 'howto-pop' }, 'Morphology and vocab'),
    h('p', { class: 'lead howto-pop' }, 'We are learning to use morphemes to predict the meanings of words.'),
  ],
  // 1 — recognise these words?
  () => [
    h('p', { class: 'kicker' }, 'Which of these words do you recognise?'),
    h('div', { class: 'chips center' },
      ...stagger(['Predicted', 'unpredictable', 'Dictionary', 'Dictator', 'contradictory']
        .map((w) => wordChip(w)))),
  ],
  // 2 — split them: shared "dict" root
  () => [
    h('p', { class: 'kicker' }, 'What do you notice when we break the words up?'),
    splitWord(['pre', 'dict', 'ed'], 'dict'),
    splitWord(['un', 'pre', 'dict', 'able'], 'dict'),
    splitWord(['dict', 'ion', 'ary'], 'dict'),
    splitWord(['dict', 'at', 'or'], 'dict'),
    splitWord(['contra', 'dict', 'ory'], 'dict'),
    h('p', { class: 'muted small howto-pop' }, 'Every one of them shares the same root — "dict" means "say/speak".'),
  ],
  // 3 — what is a morpheme + footpath example
  () => [
    h('p', { class: 'howto-pop' },
      'English words are made of parts that have meaning. These are called ',
      h('b', {}, 'morphemes'), '.'),
    h('p', { class: 'muted howto-pop' },
      'Some morphemes can be words by themselves, like "foot" — and combine with other morphemes to make new words:'),
    splitWord(['foot', 'path'], 'foot'),
    splitWord(['foot', 'baller'], 'foot'),
    splitWord(['foot', 'y'], 'foot'),
    splitWord(['foot', 'ing'], 'foot'),
  ],
  // 4 — labelled breakdown of "unpredictable"
  () => {
    const parts = [
      { m: 'un', label: 'not' }, { m: 'pre', label: 'before' },
      { m: 'dict', label: 'say' }, { m: 'able', label: 'can / possible' },
    ];
    const cols = parts.map((p) => h('div', { class: 'howto-labelcol howto-pop' },
      h('span', { class: 'chip lg' }, p.m), h('span', { class: 'ref-mean' }, p.label)));
    return [
      h('p', { class: 'kicker' }, 'This word has four morphemes. Which do you recognise?'),
      h('div', { class: 'howto-split' }, ...stagger(cols)),
      h('p', { class: 'howto-sentence howto-pop', style: 'animation-delay:.6s' },
        '"Not something you can say before it happens"'),
    ];
  },
  // 5 — translations + example sentence
  () => {
    const translations = {
      'zh-Hans': '不可预测的', 'zh-Hant': '不可預測的', ar: 'غير متوقع', vi: 'khó đoán',
      ml: 'പ്രതീക്ഷിക്കാനാവാത്ത', fa: 'غیرقابل پیش‌بینی', ja: '予測できない',
      am: 'ሊገመት የማይችል', ro: 'imprevizibil', ps: 'نه وړاندوینه کېدونکی', ur: 'ناقابلِ پیش گوئی',
    };
    const lang = getLang();
    const entries = orderedTranslations(translations, lang);
    return [
      splitWord(['un', 'pre', 'dict', 'able']),
      h('div', { class: 'chips center' }, ...stagger(entries.map(([code, t]) =>
        h('span', { class: 'trans-chip howto-pop' }, h('b', {}, t), ' ',
          h('span', { class: 'muted small' }, langLabel(code).split(' ')[0]))), 0.05)),
      h('p', { class: 'howto-sentence howto-pop', style: 'animation-delay:.5s' },
        '“Weather in Melbourne is unpredictable”'),
    ];
  },
  // 6 — interactive: build the word yourself
  () => [
    h('p', { class: 'kicker howto-pop' }, 'This is the real task you’ll do'),
    howtoBuildDemo(),
  ],
  // 7 — CTA
  () => [
    h('div', { class: 'big-emoji howto-pop' }, '🚀'),
    h('h2', { class: 'howto-pop' }, 'Now try it yourself!'),
    h('p', { class: 'muted howto-pop' }, 'Pick a level and start building real words from your own subjects.'),
    h('a', { class: 'btn primary howto-pop', href: '#/' }, 'Choose a unit'),
  ],
];

function renderHowTo() {
  let i = 0;
  const card = h('div', { class: 'card howto-card' });
  const dots = h('div', { class: 'howto-dots' });
  const prevBtn = h('button', { class: 'btn ghost', onclick: () => { if (i > 0) { i--; draw(); } } }, '← Back');
  const nextBtn = h('button', { class: 'btn primary' }, 'Next →');

  function draw() {
    card.innerHTML = '';
    card.className = 'card howto-card';
    add(card, ...HOWTO_STEPS[i]());
    dots.innerHTML = '';
    HOWTO_STEPS.forEach((_, idx) => dots.append(h('span', { class: `howto-dot ${idx === i ? 'active' : ''}` })));
    prevBtn.disabled = i === 0;
    nextBtn.textContent = i === HOWTO_STEPS.length - 1 ? 'Done ✓' : 'Next →';
    nextBtn.onclick = () => {
      if (i < HOWTO_STEPS.length - 1) { i++; draw(); } else { window.location.hash = '/'; }
    };
  }
  draw();

  render(h('div', { class: 'stack' },
    crumb([['Home', '#/'], ['How it works', null]]),
    h('h1', {}, 'How it works'),
    card,
    h('div', { class: 'row gap howto-nav' }, prevBtn, dots, nextBtn)));
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
function buildNav() {
  const nav = document.getElementById('topnav');
  if (!nav) return;
  nav.innerHTML = '';
  nav.append(
    h('a', { class: 'brand', href: '#/' }, '📚 Word Builder'),
    h('div', { class: 'nav-links' },
      h('a', { href: '#/' }, 'Home'),
      h('a', { href: '#/how-to' }, 'How it works'),
      h('a', { href: '#/dictionary' }, 'Dictionary'),
      h('a', { href: '#/words' }, 'My words ', h('span', { class: 'badge', id: 'nav-count' })),
      h('a', { href: '#/pick' }, 'Drill'),
      h('a', { href: '#/progress' }, 'Progress'),
      h('a', { href: '#/account' }, 'Account')));
}

async function boot() {
  const loadingDetail = document.getElementById('loading-detail');
  const slowMessage = setTimeout(() => {
    if (loadingDetail) loadingDetail.textContent = 'Still opening the vocabulary bank — a first visit can take a few seconds.';
  }, 1200);
  try {
    const response = await fetch('data/vocab.json');
    if (!response.ok) throw new Error(`Vocabulary request failed (${response.status})`);
    DATA = await response.json();
  } catch (error) {
    console.error('Could not load vocabulary:', error);
    render(h('section', { class: 'loading-card', role: 'alert' },
      h('div', {},
        h('strong', {}, 'Word Builder could not open the vocabulary bank.'),
        h('p', { class: 'muted small' }, 'Check the connection, then try again. If this device has opened Word Builder before, its offline copy will be used automatically.'),
        h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Try again'))));
    return;
  } finally {
    clearTimeout(slowMessage);
  }
  buildNav();

  route('/', renderHome);
  route('/l/:levelId', renderLevel);
  route('/l/:levelId/:subjectId', renderSubject);
  route('/l/:levelId/:subjectId/f/:folderId', renderFolder);
  route('/learn/:levelId/:subjectId/:unitId', renderBuildBoard);
  route('/browse/:levelId/:subjectId/:unitId', renderBrowse);
  route('/morphemes/:levelId/:subjectId', renderMorphemes);
  route('/dictionary', renderDictionary);
  route('/request/:levelId/:subjectId/:unitId', renderRequest);
  route('/request/:levelId/:subjectId', renderRequest);
  route('/request/:levelId', renderRequest);
  route('/drill', renderDrill);
  route('/pick', renderDrillPicker);
  route('/words', renderWords);
  route('/progress', renderProgress);
  route('/account', renderAccount);
  route('/how-to', renderHowTo);

  window.addEventListener('hashchange', router);
  store.subscribe(updateNavCounts);

  try {
    await sb.initSupabase();
    if (sb.isConfigured()) {
      currentUser = await sb.getUser();
      await store.setUser(currentUser);
      sb.onAuthChange(async (user) => { currentUser = user; await store.setUser(user); router(); });
    }
  } catch (e) { console.warn('Supabase init skipped:', e); }

  router();
  if ('serviceWorker' in navigator) {
    // Register with the build number as a query param, so each release is a NEW
    // worker URL the browser must fetch — this is what makes stubborn caches
    // actually update. update() nudges an immediate check for a newer worker.
    const v = self.__BUILD__ || '';
    navigator.serviceWorker.register('sw.js?v=' + v)
      .then((reg) => { reg.update(); })
      .catch(() => {});
    // Only auto-reload when an EXISTING page's controller is replaced by a new
    // worker (a real update) — never on the very first install (no controller
    // yet), which would double-load the first visit.
    if (navigator.serviceWorker.controller) {
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });
    }
  }
}

boot();
