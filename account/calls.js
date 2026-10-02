// CALLS (D2, 30 Sep 2026: calmer): newest first, grouped by day ("Today",
// "Yesterday", "Mon 28 Sep"), with filter chips (All, Urgent, To call back).
// Each row: name, what they need, the time, a small urgent mark. A tap opens
// the call sheet: name, urgent mark, a big Call button, the "Called back"
// switch, one plain sentence ("Two-bedroom house, Renton to Kent, wants Thu 8
// Oct."), what the robot told them, and the held date with Confirm / Release;
// fields with nothing in them are left out. The sheet is a bottom sheet on a phone and a side panel
// on a wide screen; Escape, Close or a tap outside closes it, and the focus
// goes back to the row it came from.
import { $, $$, h, say, now, todayIso, isoOf, shortDay, clock, callDay, askedWords, phoneReadable, phoneHref, timeWords } from './ui.js';
import { ROUTES } from './api.js';

let filter = 'all';
let sheetId = null;     // the call on show in the sheet
let panel = null;       // or another view's own filling of the sheet (the Calendar's day)
let opener = null;      // what to give the focus back to
let appRef = null;

const byNewest = (a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0);
const FILTERS = {
  all: () => true,
  urgent: (c) => c.urgent,
  open: (c) => !c.calledBack,
};
const CHIP = { all: 'All', urgent: 'Urgent', open: 'To call back' };
const route = (c) => [c.from, c.to].filter(Boolean).join(' to ');

/** Calls opened on one filter (Today's "N more urgent" opens it on Urgent). */
export function setCallsFilter(name) {
  if (FILTERS[name]) filter = name;
  if (appRef) renderCalls(appRef);
}

for (const b of $$('[data-filter]')) {
  b.addEventListener('click', () => {
    filter = b.dataset.filter;
    if (appRef) renderCalls(appRef);
  });
}

function dayLabel(day) {
  const t = now();
  const yesterday = isoOf(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1));
  const words = shortDay(day);
  if (day === todayIso()) return 'Today';
  if (day === yesterday) return 'Yesterday';
  return words;
}

export function renderCalls(app) {
  appRef = app;
  const calls = [...(app.state.calls || [])].sort(byNewest);
  for (const [k, f] of Object.entries(FILTERS)) $(`[data-n="${k}"]`).textContent = String(calls.filter(f).length);
  for (const b of $$('[data-filter]')) {
    b.setAttribute('aria-pressed', b.dataset.filter === filter ? 'true' : 'false');
    // D2: the chip reads "To call back" (the count stays its own part)
    const n = b.querySelector('[data-n]');
    const word = CHIP[b.dataset.filter];
    if (word && n && b.firstChild && b.firstChild.nodeType === 3 && b.firstChild.textContent.trim() !== word) b.firstChild.textContent = `${word} `;
  }
  const shown = calls.filter(FILTERS[filter]);

  const empty = $('[data-calls-empty]');
  empty.hidden = shown.length > 0;
  $('[data-filters]').hidden = calls.length === 0;
  if (!shown.length) {
    empty.replaceChildren(calls.length
      ? h('div', { class: 'tile empty-t' },
        h('p', { class: 'lbl', text: filter === 'urgent' ? 'No urgent calls' : 'All called back' }),
        h('p', { class: 'lede', text: filter === 'urgent' ? 'None of your calls was urgent.' : 'You have called every caller back.' }),
        h('div', { class: 'acts' }, h('button', { class: 'bt s', type: 'button', text: 'Show all calls', onclick: () => { filter = 'all'; renderCalls(app); $('[data-filter="all"]').focus(); } })))
      : h('div', { class: 'tile big empty-t' },
        h('p', { class: 'lbl', text: 'No calls yet' }),
        h('p', { class: 'h2', text: 'Your first call shows here' }),
        h('p', { class: 'lede', text: 'Each caller’s name, number and what they need, newest first. Tap a call to see everything they said.' })));
  }

  // group by the day the call came in, newest day first
  const groups = new Map();
  for (const c of shown) {
    const day = callDay(c.at);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(c);
  }
  $('[data-calls]').replaceChildren(...[...groups].map(([day, list]) => h('section', { class: 'block calls-day', 'aria-labelledby': `day-${day}`, 'data-day': day },
    h('h3', { class: 'block-h', id: `day-${day}`, text: dayLabel(day) }),
    h('ul', { class: 'rows' }, list.map((c) => callRow(app, c))))));

  if (sheetId) fillSheet(app);
  else if (panel && !sheet.hidden) panel();
}

function callRow(app, c) {
  const key = String(c.id).replace(/[^\w-]/g, '_');
  const name = c.name || 'No name given';
  const openBtn = h('button', { class: 'row-main', type: 'button', id: `open-${key}`, 'aria-label': `${name}${c.urgent ? ', urgent' : ''}, ${clock(c.at)}, see the call` },
    h('span', { class: 'row-title' }, h('span', { 'data-call-name': '', text: name }), c.urgent ? h('span', { class: 'mark-urgent', text: 'Urgent' }) : null),
    c.what ? h('span', { class: 'row-sub', text: c.what }) : null);
  openBtn.addEventListener('click', () => openCall(app, c.id, openBtn));
  return h('li', { class: `row${c.calledBack ? ' done' : ''}`, 'data-call': c.id },
    openBtn,
    h('span', { class: 'row-end time', text: clock(c.at) }));
}

/** The call in one plain sentence: "Two-bedroom house, Renton to Kent, wants Thu 8 Oct." */
export function callSentence(c) {
  const parts = [String(c.what || '').trim(), route(c), c.dateAsked ? `wants ${askedWords(c.dateAsked)}` : ''].filter(Boolean);
  if (!parts.length) return '';
  const text = parts.join(', ');
  return /[.?]$/.test(text) ? text : `${text}.`;
}

// ---------------------------------------------------------------------------
// the call sheet
// ---------------------------------------------------------------------------

const sheet = $('#sheet');
const scrim = $('[data-scrim]');
const behind = () => [$('header.hd'), $('#main'), $('nav.bbar')];
export const sheetOpen = () => !sheet.hidden;

// B11: an open sheet is one step in the phone's history, so Back closes the
// sheet only (and Close, Escape or a tap outside take that step back again)
function stepIn() {
  if (!(history.state && history.state.sheet)) history.pushState({ sheet: true }, '');
}
addEventListener('popstate', () => {
  if (!sheet.hidden && !(history.state && history.state.sheet)) closeSheet(true, true);
});

export function openCall(app, id, from) {
  appRef = app;
  sheetId = id;
  opener = from || document.activeElement;
  fillSheet(app);
  stepIn();
  sheet.hidden = false;
  scrim.hidden = false;
  for (const el of behind()) el.inert = true;
  document.documentElement.style.overflow = 'hidden';
  $('#sheet-h').focus();
}

/** The same sheet for another view: fill() writes its label, title and body, and
 *  is run again whenever the state is drawn again while the sheet is open. */
export function openPanel(fill, from) {
  sheetId = null;
  panel = fill;
  opener = from || document.activeElement;
  fill();
  stepIn();
  sheet.hidden = false;
  scrim.hidden = false;
  for (const el of behind()) el.inert = true;
  document.documentElement.style.overflow = 'hidden';
  $('#sheet-h').focus();
}

export function closeSheet(giveBack = true, fromBack = false) {
  if (!sheetId && !panel && sheet.hidden) return;
  // closed by Close, Escape or a tap: take the sheet's history step back too
  if (!fromBack && history.state && history.state.sheet) history.back();
  sheetId = null;
  panel = null;
  sheet.hidden = true;
  scrim.hidden = true;
  for (const el of behind()) el.inert = false;
  document.documentElement.style.overflow = '';
  $('[data-sheet-body]').replaceChildren();
  // the row may have been drawn again while the sheet was open: find it by its id
  const back = opener && (opener.isConnected ? opener : (opener.id && document.getElementById(opener.id)));
  opener = null;
  if (giveBack && back) back.focus();
}

$('[data-sheet-close]').addEventListener('click', () => closeSheet());
scrim.addEventListener('click', () => closeSheet());
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) { e.preventDefault(); closeSheet(); } });

const asking = new Set(); // held dates whose "Free this date again?" is open in the sheet

function fillSheet(app) {
  const c = (app.state.calls || []).find((x) => x.id === sheetId);
  if (!c) { closeSheet(); return; }
  // M2: the server joins the call to its hold (one id) and sends its date and status.
  const hold = c.held && c.held.date ? c.held : null;
  $('[data-sheet-when]').textContent = timeWords(c.at);
  $('#sheet-h').replaceChildren(c.name || 'No name given', c.urgent ? h('span', { class: 'mark-urgent', 'data-sheet-urgent': '', text: 'Urgent' }) : '');
  const readable = c.callback ? phoneReadable(c.callback) : '';
  const out = h('p', { class: 'say note-undo', role: 'status', 'aria-live': 'polite', hidden: true, id: 'sheet-say' });
  // "Called back": a switch; the page shows what the server says, not the tap
  const box = h('input', { type: 'checkbox', role: 'switch', id: 'sheet-called', class: 'sw-input' });
  box.checked = !!c.calledBack;
  box.setAttribute('aria-checked', c.calledBack ? 'true' : 'false');
  box.addEventListener('change', async () => {
    const want = box.checked;
    box.checked = !want;
    if (await app.change(ROUTES.call, { id: c.id, calledBack: want }, out, box)) {
      say($('#sheet-say'), want ? 'Done. Marked as called back.' : 'Done. Back on your list to call.', true);
    }
  });
  const sentence = callSentence(c);
  $('[data-sheet-body]').replaceChildren(...[
    c.callback
      ? h('a', { class: 'bt p big-call', href: phoneHref(c.callback), id: 'sheet-tel', 'aria-label': `Call ${c.name || 'the caller'} at ${readable}` }, 'Call ', h('span', { class: 'time', text: readable }))
      : h('p', { class: 'row-sub', text: 'No number given.' }),
    h('label', { class: 'switch-row', for: 'sheet-called' },
      h('span', { class: 'row-title', text: 'Called back' }), box, h('span', { class: 'sw-track', 'aria-hidden': 'true' }, h('span', { class: 'sw-knob' }))),
    out,
    sentence ? h('p', { class: 'sentence', 'data-sheet-sentence': '', text: sentence }) : null,
    c.promised ? h('p', { class: 'row-sub', 'data-sheet-promised': '', text: `Your robot told them: ${c.promised}` }) : null,
    hold ? heldBlock(app, hold) : null,
  ].filter(Boolean));
}

/** The held date in the sheet, with Confirm and Release right there. */
function heldBlock(app, hold) {
  const word = ({ confirmed: 'confirmed', released: 'released' })[hold.status] || 'held';
  const note = h('p', { class: 'say note-undo', role: 'status', 'aria-live': 'polite', hidden: true, id: 'sheet-hold-say' });
  const acts = h('span', { class: 'row-end' });
  const send = async (action, btn) => {
    if (await app.change(ROUTES.hold, { date: hold.date, action }, note, btn)) {
      asking.delete(hold.date);
      say($('#sheet-hold-say'), action === 'confirm' ? `Done. ${shortDay(hold.date)} is confirmed.` : `Done. ${shortDay(hold.date)} is free again.`, true);
    }
  };
  if (hold.status === 'held') acts.append(h('button', { class: 'bt s', type: 'button', id: 'sheet-confirm', text: 'Confirm', 'aria-label': `Confirm ${shortDay(hold.date)}`, onclick: (e) => send('confirm', e.currentTarget) }));
  if (hold.status === 'held' || hold.status === 'confirmed') {
    acts.append(h('button', { class: 'bt q', type: 'button', id: 'sheet-release', text: 'Release', 'aria-label': `Release ${shortDay(hold.date)}`, hidden: asking.has(hold.date),
      onclick: () => { asking.add(hold.date); fillSheet(app); document.getElementById('sheet-free-yes').focus(); } }));
  }
  // freeing a date cannot be undone from here, so it asks once, in the sheet
  const ask = asking.has(hold.date) ? h('div', { class: 'ask', role: 'group', 'aria-labelledby': 'sheet-free-q' },
    h('p', { id: 'sheet-free-q', class: 'row-title', text: 'Free this date again?' }),
    h('p', { class: 'row-sub', text: `${shortDay(hold.date)} becomes free, and your robot can offer it to the next caller.` }),
    h('div', { class: 'acts' },
      h('button', { class: 'bt s', type: 'button', id: 'sheet-free-yes', text: 'Yes, free it', onclick: (e) => send('release', e.currentTarget) }),
      h('button', { class: 'bt q', type: 'button', id: 'sheet-free-no', text: 'Keep it', onclick: () => { asking.delete(hold.date); fillSheet(app); document.getElementById('sheet-release').focus(); } }))) : null;
  return h('div', { class: 'held', 'data-sheet-held': hold.date },
    h('ul', { class: 'rows' }, h('li', { class: 'row' },
      h('div', { class: 'row-main' }, h('span', { class: 'row-title', text: `Held date: ${shortDay(hold.date)}` }), h('span', { class: 'row-sub', 'data-held-status': '', text: word[0].toUpperCase() + word.slice(1) })),
      acts)),
    ...[ask, note].filter(Boolean));
}

function tick() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 14 14');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M2 7.5 5.5 11 12 3.5');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', '#FFFFFF');
  p.setAttribute('stroke-width', '2');
  svg.append(p);
  return svg;
}
