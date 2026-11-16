// Focus guard: keeps a student in the builder, in fullscreen, so they cannot
// flip to a word list in another tab and copy the answers across.
//
//   enter(restart)  start guarding. `restart` is called on the second leave.
//   release()       stop guarding and leave fullscreen (no penalty).
//
// First time the student leaves fullscreen (or hides the tab): warning.
// Second time: restart(). Browsers without the Fullscreen API (iPhone Safari)
// are not guarded, because they cannot be asked to go fullscreen.
// Nothing is stored or sent anywhere.

const root = document.documentElement;
const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const fsOk = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled)
  && !!(root.requestFullscreen || root.webkitRequestFullscreen);

let active = false;
let wasFs = false;       // has been fullscreen since the last (re)start
let strikes = 0;
let lastStrikeAt = 0;
let restartFn = null;
let overlay = null;

function requestFs() {
  try {
    const p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* the overlay button retries with a fresh click */ }
}
function exitFs() {
  if (!fsOn()) return;
  try {
    const p = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* ignore */ }
}

function hideOverlay() { if (overlay) { overlay.remove(); overlay = null; } }
function showOverlay(title, lines, button) {
  hideOverlay();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn primary';
  btn.textContent = button;
  btn.addEventListener('click', requestFs);
  const box = document.createElement('div');
  box.className = 'focus-guard-box';
  const h = document.createElement('h2');
  h.textContent = title;
  box.append(h);
  for (const t of lines) { const p = document.createElement('p'); p.textContent = t; box.append(p); }
  box.append(btn);
  overlay = document.createElement('div');
  overlay.className = 'focus-guard';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.append(box);
  document.body.append(overlay);
  btn.focus();
}

function strike() {
  const now = Date.now();
  if (now - lastStrikeAt < 1500) return;   // leaving fullscreen and hiding the tab are one event
  lastStrikeAt = now;
  wasFs = false;
  strikes += 1;
  if (strikes === 1) {
    showOverlay('Do not cheat',
      ['Stay in this tab, in fullscreen, until you finish the words.',
       'If you leave again, you will have to start the unit again.'],
      'Go back to fullscreen');
  } else {
    strikes = 0;
    const again = restartFn;
    showOverlay('Unit restarted',
      ['You left fullscreen twice, so you start again from the beginning.'],
      'Start again in fullscreen');
    if (again) again();
  }
}

function onFsChange() {
  if (!active) return;
  if (fsOn()) { wasFs = true; hideOverlay(); }
  else if (wasFs) strike();
}
function onVisibility() {
  if (active && wasFs && document.hidden) strike();
}

document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);
document.addEventListener('visibilitychange', onVisibility);

export function enter(restart) {
  restartFn = restart;
  if (active || !fsOk()) return;
  active = true;
  wasFs = false;
  strikes = 0;
  if (fsOn()) { wasFs = true; return; }
  requestFs();
  // If the browser refused (no recent click, e.g. after a page reload), ask
  // for a click. This is not a strike: they were never in fullscreen.
  setTimeout(() => {
    if (active && !fsOn() && !overlay) {
      showOverlay('Fullscreen needed',
        ['The word builder runs in fullscreen so you cannot look at the word list while you build.'],
        'Start in fullscreen');
    }
  }, 400);
}

export function release() {
  active = false;
  wasFs = false;
  strikes = 0;
  restartFn = null;
  hideOverlay();
  exitFs();
}
