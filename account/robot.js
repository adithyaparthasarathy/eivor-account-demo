// Robot (O4b; D2, 30 Sep 2026: calmer): "Robot updated 2:22 PM" as a quiet
// line at the top; what callers hear as a small preview; what the robot knows
// as a list, each row a title and a one-line summary; a tap opens that group
// as an edit sheet with Save and Cancel (only one at a time; Cancel or Escape
// puts his saved words back). Pause lives in the header pill (D1); until the
// pill is there, the old switch stays. Each group is its own form with its own Save. A bad save puts the server's own
// sentence under the field it is about. Values go back in the server's shapes:
// a list as a list, the working days as days, how far ahead as a number.
import { $, h, say, busy, setField, isDirty, putBack, now } from './ui.js';
import { ROUTES } from './api.js';
import { app } from './app.js';

// [field, label, one-line hint, kind]
const GROUPS = [
  { id: 'company', title: 'Your company', save: 'Save company', fields: [
    ['companyName', 'Your company name, the way the robot says it', 'Callers hear it first, in the greeting above.', 'line']] },
  { id: 'where', title: 'Where you work', save: 'Save towns', fields: [
    ['towns', 'Towns you serve', 'Separate the towns with commas.', 'list,']] },
  { id: 'moves', title: 'What you move and never move', save: 'Save moves', fields: [
    ['moves', 'What you move', 'Homes, offices, heavy single items: what callers can book.', 'text'],
    ['never', 'What you never move or do', 'Your robot kindly says no to these.', 'text']] },
  { id: 'quotes', title: 'Quotes', save: 'Save quotes', fields: [
    ['quotes', 'How quotes work', 'How a caller gets a price. Never an amount: the robot never says one.', 'text']] },
  { id: 'when', title: 'When you work and how far ahead', save: 'Save days', fields: [
    ['days', 'Working days', 'Your robot only offers these days.', 'days'],
    ['bookAhead', 'How far ahead you book, in days', 'From 1 to 120. 90 is about three months.', 'number']] },
  { id: 'urgent', title: 'What is urgent', save: 'Save urgent', fields: [
    ['urgent', 'What counts as urgent', 'Calls like these are marked urgent and shown first.', 'text']] },
  { id: 'words', title: 'Words to say and never say', save: 'Save words', fields: [
    ['alwaysSay', 'Words to always say', 'One a line, for example your licence number.', 'list\n'],
    ['neverSay', 'Words never to say', 'One a line. Your robot keeps away from them.', 'list\n']] },
  { id: 'email', title: 'Where call emails go', save: 'Save email', fields: [
    ['noticeEmail', 'Email for call notices', 'Every call your robot takes is emailed here.', 'email']] },
];
const WEEK = [['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday']];
// the server's own names for the fields, to find which one a sentence is about
const SERVER_LABEL = {
  companyName: 'The company name', towns: 'The towns you serve', moves: 'What you move', never: 'What you never do',
  quotes: 'How quotes work', days: 'Your working days', bookAhead: 'How far ahead you book', urgent: 'What counts as urgent',
  alwaysSay: 'Words to always say', neverSay: 'Words never to say', noticeEmail: 'The notice email',
};

let built = false;
const fieldsOf = (g) => g.fields.map((f) => f[0]);
const current = (k) => (app.state && app.state.facts ? app.state.facts[k] : undefined);
const shown = (k, kind) => {
  const v = current(k);
  if (Array.isArray(v)) return v.join(kind === 'list\n' ? '\n' : ', ');
  return v === null || v === undefined ? '' : String(v);
};
const daysMode = () => Array.isArray(current('days'));

export function renderRobot(a) {
  const t = new Date(a.state.robotUpdatedAt);
  const at = a.state.robotUpdatedAt && !Number.isNaN(t.getTime())
    ? t.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const upd = $('[data-robot-updated]');
  upd.textContent = !at ? 'Your robot has not been updated from this page yet.'
    : `Robot updated ${sameDay(t) ? t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : at}`;
  // D2: the quiet line sits at the top of the tab
  const top = $('#tab-robot .shd');
  if (top && upd.parentElement !== top) { upd.classList.add('quiet-top'); top.append(upd); }
  const pause = $('#tab-robot #pause');
  if (pause) pause.hidden = pillWorks();
  const name = String(current('companyName') || a.state.company || '').trim() || 'Your company';
  $('[data-greeting-preview]').textContent = `“${name}, this is the answering line. How can I help you today?”`;
  $('#pause-switch').setAttribute('aria-checked', a.state.paused ? 'true' : 'false');
  $('[data-pause-text]').textContent = a.state.paused ? 'Paused' : 'Not paused';
  // M2 (Astra 19): the least "how far ahead" is more than the robot's minimum notice.
  const hint = document.getElementById('f-bookAhead-hint');
  if (hint) hint.textContent = bookAheadHint(a);
}
const sameDay = (t) => t.toDateString() === now().toDateString();
/** The header pill (D1) pauses and resumes: then the switch leaves Robot. */
const pillWorks = () => {
  const p = $('[data-line-now]');
  return !!p && (p.tagName === 'BUTTON' || p.getAttribute('role') === 'button' || !!p.querySelector('button'));
};
const bookAheadHint = (a) => `From ${Number.isInteger(a?.state?.bookAheadMin) ? a.state.bookAheadMin : 1} to 120. 90 is about three months.`;

export function clearRobot() {
  built = false;
  $('[data-fact-groups]').replaceChildren();
  $('[data-greeting-preview]').textContent = '';
}

$('#pause-switch').addEventListener('click', (e) => app.change(ROUTES.pause, { paused: !app.state.paused }, $('[data-pause-say]'), e.currentTarget));

// ---------------------------------------------------------------------------
// the groups: built once his facts are known, then only their values change
// ---------------------------------------------------------------------------

function field([k, label, fixedHint, kind]) {
  const hintId = `f-${k}-hint`;
  const hint = k === 'bookAhead' ? bookAheadHint(app) : fixedHint;
  const sayEl = h('p', { class: 'say fsay', id: `f-${k}-say`, role: 'status', 'aria-live': 'polite', hidden: true });
  if (kind === 'days' && daysMode()) {
    return h('fieldset', { class: 'fld', id: `f-${k}`, 'aria-describedby': hintId },
      h('legend', { class: 'fl', text: label }),
      h('div', { class: 'daysel' }, WEEK.map(([d, full]) => h('label', { class: 'dchip' },
        h('input', { type: 'checkbox', name: 'days', value: d, id: `f-days-${d}`, 'aria-label': full }), h('span', { text: d })))),
      h('p', { class: 'hint', id: hintId, text: hint }), sayEl);
  }
  const common = { id: `f-${k}`, name: k, 'aria-describedby': hintId };
  const input = kind === 'text' || kind.startsWith('list')
    ? h('textarea', { ...common, rows: kind === 'list,' ? 2 : 3 })
    : h('input', { ...common, type: kind === 'email' ? 'email' : 'text',
      ...(kind === 'email' ? { autocomplete: 'email', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false' } : {}),
      ...(kind === 'number' ? { inputmode: 'numeric' } : {}),
      ...(k === 'companyName' ? { autocomplete: 'organization' } : {}) });
  return h('div', { class: 'fld' }, h('label', { for: `f-${k}`, text: label }), input, h('p', { class: 'hint', id: hintId, text: hint }), sayEl);
}

// D2: on every screen the eight groups are a short list of rows; one opens at
// a time, as an edit sheet over the list (a bottom sheet on a phone, a side
// panel on a wide screen).
let openId = null; // the group open in the edit sheet
let opener = null; // the row to give the focus back to

function build() {
  const box = $('[data-fact-groups]');
  box.replaceChildren(...GROUPS.map((g) => {
    const note = h('p', { class: 'say', id: `fg-${g.id}-say`, role: 'status', 'aria-live': 'polite', hidden: true });
    const tog = h('button', { class: 'gtog', type: 'button', id: `fg-${g.id}-tog`, 'aria-expanded': 'true', 'aria-controls': `fg-${g.id}-body` },
      h('span', { class: 'rank', id: `fg-${g.id}-h`, text: g.title }),
      h('span', { class: 'gsum', id: `fg-${g.id}-sum`, 'data-sum': g.id }),
      h('span', { class: 'chev', 'aria-hidden': 'true' }));
    tog.addEventListener('click', () => toggle(g.id));
    const form = h('form', { class: 'fm fgroup tile', id: `fg-${g.id}`, novalidate: true, 'aria-labelledby': `fg-${g.id}-h` },
      h('h4', { class: 'gh' }, tog),
      h('p', { class: 'say note-undo rowsay', id: `fg-${g.id}-rowsay`, role: 'status', 'aria-live': 'polite', hidden: true }),
      h('div', { class: 'gbody', id: `fg-${g.id}-body` },
        g.fields.map(field),
        note,
        h('div', { class: 'acts' },
          h('button', { class: 'bt p', type: 'submit', text: g.save }),
          h('button', { class: 'bt q', type: 'button', id: `fg-${g.id}-cancel`, text: 'Cancel', onclick: () => cancel(g.id) }))));
    form.addEventListener('submit', (e) => { e.preventDefault(); save(g, form, e.submitter || form.querySelector('button[type=submit]')); });
    form.addEventListener('input', (e) => { const f = e.target.closest('.fld'); if (f) clearSay(f.querySelector('.fsay')); });
    return form;
  }));
  if (!$('[data-robot-scrim]')) box.after(h('div', { class: 'robot-scrim', 'data-robot-scrim': '', hidden: true, onclick: () => openId && cancel(openId) }));
  built = true;
  openId = null;
  layout();
}

/** Show the groups: on a phone only the open one, on a wide screen all. */
function layout() {
  for (const g of GROUPS) {
    const tog = document.getElementById(`fg-${g.id}-tog`);
    if (!tog) continue;
    const open = openId === g.id;
    tog.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.getElementById(`fg-${g.id}-body`).hidden = !open;
    const form = document.getElementById(`fg-${g.id}`);
    form.classList.toggle('shut', !open);
    form.classList.toggle('editing', open);
    if (open) { form.setAttribute('role', 'dialog'); form.setAttribute('aria-modal', 'false'); } else { form.removeAttribute('role'); form.removeAttribute('aria-modal'); }
  }
  const scrim = $('[data-robot-scrim]');
  if (scrim) scrim.hidden = !openId;
}
function toggle(id) {
  if (openId === id) { cancel(id); return; }
  if (openId) cancel(openId, false);
  opener = document.getElementById(`fg-${id}-tog`);
  openId = id;
  layout();
  const first = document.querySelector(`#fg-${id}-body input, #fg-${id}-body textarea`);
  if (first) first.focus();
}
/** Cancel: his saved words go back in, and the sheet closes. */
function cancel(id, giveBack = true) {
  const g = GROUPS.find((x) => x.id === id);
  if (g && app.state) {
    for (const [k, , , kind] of g.fields) {
      const el = document.getElementById(`f-${k}`);
      if (!el) continue;
      if (el.tagName === 'FIELDSET') { const on = new Set(current(k) || []); for (const box of el.querySelectorAll('input')) setField(box, on.has(box.value)); } else setField(el, shown(k, kind));
      clearSay(document.getElementById(`f-${k}-say`));
    }
    say($(`#fg-${id}-say`), '');
  }
  if (openId === id) openId = null;
  layout();
  const back = document.getElementById(`fg-${id}-tog`);
  if (giveBack && back) back.focus();
  opener = null;
}
/** Close the sheet after a save, keeping the saved note on the row. */
function closeAfterSave(id) {
  openId = null;
  layout();
  const back = document.getElementById(`fg-${id}-tog`);
  if (back) back.focus();
}
/** Open one group in the edit sheet (the others close). */
export function openGroup(id) {
  const t = document.getElementById(`fg-${id}-tog`);
  if (!t) return;
  openId = id;
  layout();
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && openId) { e.preventDefault(); cancel(openId); } });

/** A short line under a closed group's title: what it holds now. */
function summary(g) {
  const parts = [];
  for (const [k, , , kind] of g.fields) {
    const v = current(k);
    if (kind === 'number') parts.push(v ? `${v} days` : '');
    else parts.push(shown(k, kind).replace(/\s*\n\s*/g, ', '));
  }
  const text = parts.filter(Boolean).join(' · ');
  return text.length > 70 ? `${text.slice(0, 68).trimEnd()}…` : (text || 'Not set');
}

function clearSay(el) {
  if (!el) return;
  say(el, '');
  const k = el.id.replace(/^f-|-say$/g, '');
  const input = document.getElementById(`f-${k}`);
  if (input) { input.removeAttribute('aria-invalid'); input.setAttribute('aria-describedby', `f-${k}-hint`); }
}

/** Fill every field from the state (when the account opens and after a save). */
// keepEdits (B7, a refresh): a field he changed and has not saved keeps his
// words (only its saved value moves on); except: fields filled either way.
export function fillFacts(a, keepEdits = false, except = []) {
  if (!a.state) return;
  if (!built) build();
  for (const g of GROUPS) {
    for (const [k, , , kind] of g.fields) {
      const el = document.getElementById(`f-${k}`);
      if (!el) continue;
      const keep = keepEdits && !except.includes(k);
      if (el.tagName === 'FIELDSET') {
        const on = new Set(current(k) || []);
        const boxes = [...el.querySelectorAll('input')];
        const edited = keep && boxes.some(isDirty);
        for (const box of boxes) {
          if (edited) box.defaultChecked = on.has(box.value);
          else setField(box, on.has(box.value));
        }
      } else if (keep && isDirty(el)) el.defaultValue = shown(k, kind);
      else setField(el, shown(k, kind));
    }
    const sum = document.getElementById(`fg-${g.id}-sum`);
    if (sum) sum.textContent = summary(g);
  }
}

/** Put back edits kept over a sign-in (B12): each one's group opens and says so. */
export function putBackFacts(list) {
  const back = putBack(list);
  const groups = new Set(back.map((el) => el.closest('.fgroup')).filter(Boolean));
  for (const form of groups) {
    const id = form.id.replace(/^fg-/, '');
    openGroup(id);
    say($(`#fg-${id}-say`), 'Your change is back here. It is not saved yet: press Save.');
  }
  return back.length;
}

/** The value to send for one field, in the server's shape, or undefined when unchanged. */
function valueOf(k, kind) {
  const el = document.getElementById(`f-${k}`);
  const was = current(k);
  if (el.tagName === 'FIELDSET') {
    const picked = [...el.querySelectorAll('input:checked')].map((x) => x.value);
    return picked.join() === (was || []).join() ? undefined : picked;
  }
  const text = el.value.trim();
  if (text === shown(k, kind).trim()) return undefined;
  if (Array.isArray(was) || kind.startsWith('list')) {
    if (!Array.isArray(was) && typeof was === 'string') return text;
    return text.split(kind === 'list,' ? /[\n,]/ : /\n/).map((x) => x.trim()).filter(Boolean);
  }
  if (kind === 'number' && /^\d+$/.test(text)) return Number(text);
  return text;
}

/** Which field a sentence from the server is about (its own names), else the first one sent. */
function fieldFor(sentence, keys) {
  const s = String(sentence || '').toLowerCase();
  for (const k of keys) if (s.startsWith(SERVER_LABEL[k].toLowerCase())) return k;
  const hints = [[/\btowns?\b/, 'towns'], [/words to always say/, 'alwaysSay'], [/words never to say/, 'neverSay'], [/day of the week|working day/, 'days'], [/how far ahead/, 'bookAhead'], [/notice email/, 'noticeEmail'], [/company name/, 'companyName']];
  for (const [rx, k] of hints) if (rx.test(s) && keys.includes(k)) return k;
  return keys[0];
}

async function save(g, form, btn) {
  const note = $(`#fg-${g.id}-say`);
  say(note, '');
  for (const el of form.querySelectorAll('.fsay')) clearSay(el);
  const body = {};
  for (const [k, , , kind] of g.fields) {
    const v = valueOf(k, kind);
    if (v !== undefined) body[k] = v;
  }
  if (!Object.keys(body).length) { say(note, 'Nothing changed.', true); return; }
  await busy(btn, async () => {
    const r = await app.sendNear(ROUTES.facts, body, note);
    if (!r) return;
    if (r.data.ok && r.data.state) {
      app.state = r.data.state;
      app.render();
      fillFacts(app, true, fieldsOf(g));
      closeAfterSave(g.id);
      say($(`#fg-${g.id}-rowsay`), 'Saved. Changes reach your robot within about 10 minutes.', true);
      say(note, 'Saved. Changes reach your robot within about 10 minutes.', true);
      return;
    }
    // no answer: the sentence goes under Save, and every word he typed stays
    if (r.status === 0) { say(note, r.data.say); return; }
    const k = fieldFor(r.data.say, Object.keys(body));
    const el = document.getElementById(`f-${k}-say`);
    say(el, r.data.say || 'That did not work. Try again.');
    const input = document.getElementById(`f-${k}`);
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `f-${k}-say f-${k}-hint`);
      (input.tagName === 'FIELDSET' ? input.querySelector('input') : input).focus();
    }
  });
}
