// Small helpers shared by the owner's app (part O4a): making elements, the note
// lines, busy buttons, dates and phone numbers. Nothing here talks to the server
// or keeps anything in the browser's storage.
import { fixtureOn } from './api.js';
import { phoneReadable, phoneHref } from '/eivor-account-demo/assets/js/contact.js';

export const d = document;
export const $ = (sel, root = d) => root.querySelector(sel);
export const $$ = (sel, root = d) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...kids) {
  const el = d.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

/** A note line: shows the sentence, or hides when there is none. */
export function say(el, text, good = false) {
  if (!el) return;
  el.textContent = text || '';
  el.hidden = !text;
  el.classList.toggle('good', !!good && !!text);
}
export const note = () => h('p', { class: 'say', role: 'status', 'aria-live': 'polite', hidden: true });

/** The shared "Done. Undo" note (D1): a small line at the foot of the screen
 *  instead of an "Are you sure?" box, for changes that can be taken back
 *  (pause, release, block, called back). undo() runs the change back; without
 *  it the note is only the sentence. It goes by itself after 8 seconds. */
let undoTimer = null;
export function undoNote(text, undo) {
  let el = $('[data-undo-note]');
  if (!el) {
    el = h('div', { class: 'note-undo', 'data-undo-note': '', role: 'status', 'aria-live': 'polite', hidden: true });
    d.body.append(el);
  }
  clearTimeout(undoTimer);
  const kids = [h('span', { text: text || 'Done.' })];
  if (undo) {
    kids.push(h('button', {
      class: 'bt q', type: 'button', 'data-undo': '', text: 'Undo',
      onclick: async () => { clearTimeout(undoTimer); el.hidden = true; await undo(); },
    }));
  }
  el.replaceChildren(...kids);
  el.hidden = false;
  undoTimer = setTimeout(() => { el.hidden = true; }, 8000);
  return el;
}
export function hideUndo() {
  clearTimeout(undoTimer);
  const el = $('[data-undo-note]');
  if (el) el.hidden = true;
}

/** Busy while a request is out: the button cannot be pressed twice. */
export async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  try { return await fn(); } finally {
    if (btn && btn.isConnected) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  }
}

// ---------------------------------------------------------------------------
// time: the phone's own clock (the fixture on this machine may set it with ?now=)
// ---------------------------------------------------------------------------
const FIXED = (() => {
  if (!fixtureOn(location)) return null;
  const t = Date.parse(new URLSearchParams(location.search).get('now') || '');
  return Number.isNaN(t) ? null : t;
})();
let fixtureNow = null; // set from fixture.json's "_now" when the fixture is on
export function setFixtureNow(iso) { const t = Date.parse(iso || ''); fixtureNow = Number.isNaN(t) ? null : t; }
export const now = () => new Date(FIXED ?? fixtureNow ?? Date.now());

export const pad = (n) => String(n).padStart(2, '0');
export const iso = (y, m, day) => `${y}-${pad(m + 1)}-${pad(day)}`;
export const isoOf = (t) => iso(t.getFullYear(), t.getMonth(), t.getDate());
export const todayIso = () => isoOf(now());
const DAY_RX = /^(\d{4})-(\d{2})-(\d{2})$/;
export const isDay = (s) => DAY_RX.test(String(s || ''));
export function dateOf(s) {
  const m = DAY_RX.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
/** "Tuesday, October 6" (or with the year) */
export function dayWords(s, withYear = false) {
  const t = dateOf(s);
  if (!t) return String(s || '');
  return t.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
}
/** "Tue 6 Oct" (Confidence's date style) */
export function shortDay(t) {
  if (typeof t === 'string') t = dateOf(t);
  if (!t) return '';
  const wd = t.toLocaleDateString('en-US', { weekday: 'short' });
  const mo = t.toLocaleDateString('en-US', { month: 'short' });
  return `${wd} ${t.getDate()} ${mo}`;
}
/** "7:51 AM" */
export function clock(s) {
  const t = new Date(s);
  if (!s || Number.isNaN(t.getTime())) return '';
  return t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
export function timeWords(s) {
  const t = new Date(s);
  if (!s || Number.isNaN(t.getTime())) return '';
  return t.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
/** The local day ("YYYY-MM-DD") a call came in on. */
export function callDay(at) {
  const t = new Date(at);
  return Number.isNaN(t.getTime()) ? '' : isoOf(t);
}
/** The date he was asked for: a real day reads "Tue 6 Oct", anything else as said. */
export const askedWords = (s) => (isDay(s) ? shortDay(s) : String(s || 'Not given'));

// ---------------------------------------------------------------------------
// phone numbers
// ---------------------------------------------------------------------------
export { phoneReadable, phoneHref };
export function telLink(raw, id, cls = 'tel') {
  if (!raw) return h('span', { class: 'hint', text: 'No number given' });
  return h('a', { class: cls, href: phoneHref(raw), id, text: phoneReadable(raw) });
}
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/** Copy a link, or select it so his phone's own Copy works. */
export async function copyLink(input, out) {
  if (!input.value) { say(out, 'Your calendar link is not ready yet.'); return; }
  try {
    await navigator.clipboard.writeText(input.value);
    say(out, 'Copied. Paste it into your calendar app.', true);
  } catch {
    input.focus();
    input.select();
    say(out, 'The link is selected. Copy it with your phone’s Copy.', true);
  }
}

// ---------------------------------------------------------------------------
// what he typed (B9, B12, B7): a field's saved value is its default, so a
// field he changed and did not save is one whose value is not its default
// ---------------------------------------------------------------------------
/** Put a saved value into a field (and make it the field's default). */
export function setField(el, value) {
  if (!el) return;
  if (el.type === 'checkbox') { el.checked = !!value; el.defaultChecked = !!value; return; }
  el.value = value;
  el.defaultValue = value;
}
export const isDirty = (el) => (el.type === 'checkbox' ? el.checked !== el.defaultChecked : el.value !== el.defaultValue);
/** His unsaved edits under root (never a password), to keep in memory only. */
export function unsavedIn(root) {
  if (!root) return [];
  return [...root.querySelectorAll('input, textarea')]
    .filter((el) => el.id && el.type !== 'password' && isDirty(el))
    .map((el) => ({ id: el.id, value: el.type === 'checkbox' ? el.checked : el.value }));
}
/** Put kept edits back (the saved value stays the default, so they still read as unsaved). */
export function putBack(list) {
  const back = [];
  for (const { id, value } of list || []) {
    const el = d.getElementById(id);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!value; else el.value = value;
    if (isDirty(el)) back.push(el);
  }
  return back;
}
