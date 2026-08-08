// Pronunciation via the browser's built-in Web Speech API (speechSynthesis).
//
// No network, no dependency, works inside the offline PWA. For newly-arrived
// EAL students, hearing an academic word said aloud — "photosynthesis",
// "coefficient" — matters as much as seeing it, so every English word and every
// home-language translation gets a speaker button wired to speak().

// Our internal language codes -> BCP-47 tags the speech engine understands.
// English defaults to Australian (this is an Australian school program).
const BCP47 = {
  en: 'en-AU',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  ja: 'ja-JP', ko: 'ko-KR', vi: 'vi-VN', ar: 'ar-SA', fa: 'fa-IR',
  ur: 'ur-PK', am: 'am-ET', ml: 'ml-IN', ta: 'ta-IN', tl: 'fil-PH',
  ps: 'ps-AF', ro: 'ro-RO', ru: 'ru-RU', fr: 'fr-FR', hi: 'hi-IN',
  es: 'es-ES',
};

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// The BCP-47 tag for one of our language codes (''/unknown -> ''), so inputs can
// hint the right keyboard/IME via a lang attribute.
export function bcp47(code) {
  return BCP47[code] || '';
}

function voiceFor(bcp47) {
  const voices = window.speechSynthesis.getVoices() || [];
  const lang = bcp47.toLowerCase();
  const base = lang.split('-')[0];
  // Prefer an exact region match, then any voice for the same base language.
  return voices.find((v) => v.lang && v.lang.toLowerCase() === lang)
    || voices.find((v) => v.lang && v.lang.toLowerCase().split('-')[0] === base)
    || null;
}

// Speak `text`. `code` is one of our internal language codes (default English).
// Returns true if it could dispatch to a voice for that language, false if the
// language has no available voice (so callers can hint the student).
export function speak(text, code = 'en') {
  if (!canSpeak() || !text) return false;
  const synth = window.speechSynthesis;
  synth.cancel(); // don't queue up on rapid taps
  const bcp47 = BCP47[code] || 'en-AU';
  const u = new SpeechSynthesisUtterance(String(text));
  u.lang = bcp47;
  u.rate = 0.9; // a touch slower — these are learners
  const v = voiceFor(bcp47);
  if (v) u.voice = v;
  synth.speak(u);
  return !!v || (BCP47[code] === undefined);
}

// Whether a voice exists for a given code right now (voices load async, so this
// can start false and become true — callers should treat false as "maybe").
export function hasVoiceFor(code) {
  if (!canSpeak()) return false;
  return !!voiceFor(BCP47[code] || 'en-AU');
}

// Some engines load their voice list asynchronously; nudge callers to re-render
// once it arrives so speaker buttons can reflect real availability.
export function onVoicesReady(cb) {
  if (!canSpeak()) return;
  if ((window.speechSynthesis.getVoices() || []).length) { cb(); return; }
  window.speechSynthesis.addEventListener('voiceschanged', cb, { once: true });
}
