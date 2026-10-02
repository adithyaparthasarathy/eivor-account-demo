// Calendar (O4b; D2, 30 Sep 2026: calmer): the month opens on the month of
// the next held date; each day carries a small dot (held, confirmed, blocked)
// and today a ring; a tap on a day opens a short sheet with that day's holds
// (Confirm, Release) and Block / Free this day; under the month, Coming up:
// the held and confirmed dates, one row each, a tap opens that day. The month
// counts are gone (D1 moves the calendar link and the phone steps to
// Settings). Every change is one POST on the contract.
import { $, h, say, todayIso, iso, dayWords, shortDay, dateOf, telLink, copyLink } from './ui.js';
import { ROUTES } from './api.js';
import { app } from './app.js';
import { openPanel } from './calls.js';

let month = null;          // { y, m } of the month on show
let focusDay = null;       // the day that takes the Tab stop in the month
let sheetDay = null;       // the day open in the sheet
let sheetNote = '';        // the sentence the sheet shows after a change
const asking = new Set();  // "list:<date>" or "sheet:<date>": "Free this date again?" is open

const live = (x) => x.status === 'held' || x.status === 'confirmed';
const byDate = (a, b) => String(a.date).localeCompare(String(b.date));
const holdsOf = (a) => (a.state.holds || []).filter(live).sort(byDate);
const monthOf = (date) => { const t = dateOf(date); return { y: t.getFullYear(), m: t.getMonth() }; };
const monthsFrom = (a, b) => (b.y - a.y) * 12 + (b.m - a.m);

// M2 (Astra 14): whether the robot would offer a day comes from the server
// (state.days: the robot's own rule, whyNotFree, for today to twelve months
// ahead); a day with no reason there is free. No rule is worked out here.
function whyOf(a, date) {
  const d = a.state.days;
  if (!d || !d.why) return undefined;
  if (date < d.from) return 'past';
  if (date > d.to) return 'far';
  return d.why[date] || null;
}
const WHY_SHORT = { past: 'passed', urgent: 'too soon', soon: 'too soon', far: 'too far ahead', weekend: 'not a working day', taken: 'taken' };
function whyWords(a, date, r) {
  const ahead = a.state.facts && Number.isInteger(a.state.facts.bookAhead) ? a.state.facts.bookAhead : null;
  const notice = Number.isInteger(a.state.bookAheadMin) ? a.state.bookAheadMin - 1 : null;
  const held = holdsOf(a).some((x) => x.date === date);
  return {
    past: 'That day has passed.',
    urgent: 'Too soon. Your robot does not offer this day. A caller who needs it is marked urgent, for you to call back.',
    soon: `Too soon. Your robot offers days${notice ? ` from ${notice} days ahead` : ' a little further ahead'}.`,
    far: `Too far ahead. Your robot books${ahead ? ` up to ${ahead} days ahead` : ' closer dates'}.`,
    weekend: 'Not a working day. Your robot does not offer this day.',
    taken: held ? 'Taken by a caller\'s hold. Your robot does not offer it to anyone else.' : 'Taken. Your robot does not offer this day: it is on your list of taken days.',
  }[r] || 'Free. Your robot can offer this day to callers.';
}

export function renderCalendar(a) {
  renderMonth(a);
  renderList(a);
  $('[data-calendar-url]').value = a.state.calendarUrl || '';
}

export function clearCalendar() {
  month = null; focusDay = null; sheetDay = null; sheetNote = '';
  asking.clear();
}

// ---------------------------------------------------------------------------
// the month
// ---------------------------------------------------------------------------

function renderMonth(a) {
  const today = todayIso();
  const now = monthOf(today);
  if (!month) {
    // D2: open on the month of the next held date (else this month)
    const next = holdsOf(a).find((x) => x.status === 'held' && x.date >= today);
    month = next ? monthOf(next.date) : { ...now };
    if (monthsFrom(now, month) > 12 || monthsFrom(now, month) < 0) month = { ...now };
  }
  const first = new Date(month.y, month.m, 1);
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const name = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  $('#month-name').textContent = name;
  const ahead = monthsFrom(now, month);
  $('[data-month-prev]').disabled = ahead <= 0;
  $('[data-month-next]').disabled = ahead >= 12;
  $('[data-month-today]').hidden = ahead === 0;
  const blocked = new Set(a.state.blocked || []);
  const held = new Map(holdsOf(a).map((x) => [x.date, x]));
  const inMonth = (d) => d.startsWith(`${month.y}-${String(month.m + 1).padStart(2, '0')}-`);
  if (!focusDay || !inMonth(focusDay) || focusDay < today) focusDay = inMonth(today) ? today : iso(month.y, month.m, 1);

  const cells = [];
  for (let i = 0; i < (first.getDay() + 6) % 7; i++) cells.push(h('span', { class: 'gap', 'aria-hidden': 'true' }));
  for (let n = 1; n <= days; n++) {
    const date = iso(month.y, month.m, n);
    const off = blocked.has(date);
    const hold = held.get(date);
    const past = date < today;
    const why = whyOf(a, date);
    const mark = hold ? hold.status : off ? 'blocked' : why ? 'no' : '';
    const words = [dayWords(date), date === today ? 'today' : '',
      hold ? `${hold.status} for ${hold.name || 'a caller'}` : '', off ? 'blocked' : hold ? '' : why ? WHY_SHORT[why] : 'free'].filter(Boolean).join(', ');
    const btn = h('button', {
      type: 'button', id: `cal-${date}`, class: `day${mark ? ` ${mark}` : ''}${date === today ? ' today' : ''}`,
      'aria-label': words, 'aria-haspopup': 'dialog', disabled: past, tabindex: date === focusDay ? '0' : '-1', 'data-date': date,
    }, h('span', { class: 'n', text: String(n) }), hold || off ? h('span', { class: `dot ${hold ? hold.status : 'blocked'}`, 'aria-hidden': 'true' }) : null);
    btn.addEventListener('click', () => { focusDay = date; openDay(date, btn); });
    cells.push(btn);
  }
  $('[data-month]').replaceChildren(...cells);

  // D2: the month counts are gone (the dots and Coming up say it)
  const cnt = $('[data-counts]');
  if (cnt) { cnt.replaceChildren(); const t = cnt.closest('.tile'); if (t) t.hidden = true; }
}

function moveMonth(by) {
  const m = month.m + by;
  month = { y: month.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
  renderMonth(app);
}
$('[data-month-prev]').addEventListener('click', () => moveMonth(-1));
$('[data-month-next]').addEventListener('click', () => moveMonth(1));
$('[data-month-today]').addEventListener('click', () => { month = null; renderMonth(app); $('[data-month] .day[tabindex="0"]').focus(); });

// the keyboard in the month: arrows move a day or a week, Home and End the row
$('[data-month]').addEventListener('keydown', (e) => {
  const at = e.target.closest('.day');
  if (!at) return;
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  const all = [...$('[data-month]').querySelectorAll('.day:not(:disabled)')];
  let to = null;
  if (step) {
    const t = dateOf(at.dataset.date);
    t.setDate(t.getDate() + step);
    to = document.getElementById(`cal-${iso(t.getFullYear(), t.getMonth(), t.getDate())}`);
    if (to && to.disabled) to = null;
  } else if (e.key === 'Home') to = all[0];
  else if (e.key === 'End') to = all[all.length - 1];
  else return;
  e.preventDefault();
  if (!to) return;
  at.tabIndex = -1; to.tabIndex = 0; focusDay = to.dataset.date;
  to.focus();
});

// ---------------------------------------------------------------------------
// one day, in the sheet
// ---------------------------------------------------------------------------

function openDay(date, from) {
  sheetDay = date;
  sheetNote = '';
  asking.delete(`sheet:${date}`);
  openPanel(fillDay, from);
}

function fillDay() {
  const date = sheetDay;
  if (!date || !app.state) return;
  const today = todayIso();
  const off = (app.state.blocked || []).includes(date);
  const holds = holdsOf(app).filter((x) => x.date === date);
  $('[data-sheet-when]').textContent = `${date === today ? 'Today · ' : ''}${dayWords(date, true)}`;
  $('#sheet-h').textContent = shortDay(date);
  const out = h('p', { class: 'say', id: 's-say', role: 'status', 'aria-live': 'polite', hidden: true });
  say(out, sheetNote, true);
  const block = h('button', { class: off ? 'bt p' : 'bt s', type: 'button', id: 's-block', text: off ? 'Free this day' : 'Block this day' });
  block.addEventListener('click', async () => {
    const was = off;
    if (await app.change(ROUTES.block, { date, blocked: !was }, $('#s-say'), block)) {
      const now = whyOf(app, date);
      sheetNote = !was ? `${shortDay(date)} is blocked. Your robot will not offer or hold it.`
        : now ? `${shortDay(date)} is no longer blocked. ${whyWords(app, date, now)}` : `${shortDay(date)} is free again. Your robot can offer it.`;
      fillDay();
      const b = document.getElementById('s-block');
      if (b) b.focus();
    }
  });
  $('[data-sheet-body]').replaceChildren(
    holds.length ? h('ul', { class: 'rows' }, holds.map((x) => holdRow(x, 'sheet', out))) : h('p', { class: 'row-sub', text: 'No caller holds this day.' }),
    h('p', { class: 'row-sub', id: 's-why', text: off ? 'Blocked. Your robot does not offer or hold this day.' : whyWords(app, date, whyOf(app, date)) }),
    out,
    h('div', { class: 'acts' }, block));
}

// ---------------------------------------------------------------------------
// the coming held and confirmed dates, under the month
// ---------------------------------------------------------------------------

function renderList(a) {
  const today = todayIso();
  const list = holdsOf(a).filter((x) => x.date >= today);
  for (const k of [...asking]) if (k.startsWith('list:') && !list.some((x) => `list:${x.date}` === k)) asking.delete(k);
  $('[data-holds-empty]').hidden = list.length > 0;
  $('[data-holds]').classList.add('rows');
  $('[data-holds]').replaceChildren(...list.map((x) => comingRow(x)));
  const hint = $('#holds .hint');
  if (hint) hint.hidden = true;
}

/** Coming up: one row each (the day, who, what); a tap opens that day's sheet. */
function comingRow(x) {
  const open = h('button', { class: 'row-main', type: 'button', id: `coming-${x.date}`, 'aria-haspopup': 'dialog',
    'aria-label': `${dayWords(x.date)}, ${x.status === 'confirmed' ? 'confirmed' : 'held'} for ${x.name || 'a caller'}, open the day` },
    h('span', { class: 'row-title', text: shortDay(x.date) }),
    h('span', { class: 'row-sub', text: [x.name, x.what].filter(Boolean).join(' · ') || 'A caller' }));
  open.addEventListener('click', () => { focusDay = x.date; openDay(x.date, open); });
  return h('li', { class: 'row hold', 'data-hold': x.date }, open,
    h('span', { class: `row-end stat-word ${x.status}`, text: x.status === 'confirmed' ? 'Confirmed' : 'Held' }));
}

/** One hold as a row: the day, its status, the caller, and Confirm / Release (Release asks in the page). */
function holdRow(x, where, sheetOut) {
  const p = where === 'sheet' ? 's-' : '';
  const key = `${where}:${x.date}`;
  const out = sheetOut || h('p', { class: 'say', role: 'status', 'aria-live': 'polite', hidden: true });
  const acts = h('div', { class: 'acts' });
  const redraw = () => (where === 'sheet' ? fillDay() : renderList(app));
  const release = h('button', { class: 'bt s', type: 'button', id: `${p}release-${x.date}`, text: 'Release', 'aria-label': `Release ${dayWords(x.date)}` });
  release.addEventListener('click', () => { asking.add(key); redraw(); document.getElementById(`${p}free-yes-${x.date}`).focus(); });
  if (x.status === 'held') {
    const confirm = h('button', { class: 'bt s', type: 'button', id: `${p}confirm-${x.date}`, text: 'Confirm', 'aria-label': `Confirm ${dayWords(x.date)}` });
    confirm.addEventListener('click', async () => {
      if (await app.change(ROUTES.hold, { date: x.date, action: 'confirm' }, out, confirm)) {
        if (where === 'sheet') { sheetNote = `${shortDay(x.date)} is confirmed for ${x.name || 'the caller'}.`; fillDay(); }
        const r = document.getElementById(`${p}release-${x.date}`); if (r) r.focus();
      }
    });
    acts.append(confirm);
  }
  acts.append(release);
  let ask = null;
  if (asking.has(key)) {
    const yes = h('button', { class: 'bt s', type: 'button', id: `${p}free-yes-${x.date}`, text: 'Yes, free it' });
    const no = h('button', { class: 'bt q', type: 'button', id: `${p}free-no-${x.date}`, text: 'Keep it' });
    yes.addEventListener('click', async () => {
      if (await app.change(ROUTES.hold, { date: x.date, action: 'release' }, out, yes)) {
        asking.delete(key);
        if (where === 'sheet') { sheetNote = `${shortDay(x.date)} is free again.`; fillDay(); $('#sheet-h').focus(); } else { renderList(app); $('#holds-h').focus(); }
      }
    });
    no.addEventListener('click', () => { asking.delete(key); redraw(); document.getElementById(`${p}release-${x.date}`).focus(); });
    ask = h('div', { class: 'ask', role: 'group', 'aria-labelledby': `${p}free-q-${x.date}` },
      h('p', { id: `${p}free-q-${x.date}`, text: 'Free this date again?' }),
      h('p', { text: `${dayWords(x.date)} becomes free, and your robot can offer it to the next caller.` }),
      h('div', { class: 'acts' }, yes, no));
    release.hidden = true;
  }
  const route = [x.from, x.to].filter(Boolean).join(' to ');
  return h('li', { class: 'row hrow hold', 'data-hold': x.date },
    h('div', { class: 'row-main' },
      h('span', { class: 'row-title' }, x.name || 'No name given', h('span', { class: `stat-word ${x.status}`, text: x.status === 'confirmed' ? 'Confirmed' : 'Held' })),
      h('span', { class: 'row-sub', text: [x.what, route].filter(Boolean).join(' · ') }),
      telLink(x.callback, `${p}hold-tel-${x.date}`)),
    h('div', { class: 'row-end' }, acts), ask, sheetOut ? null : out);
}

$('[data-copy]').addEventListener('click', () => copyLink($('[data-calendar-url]'), $('[data-copy-say]')));
