// TODAY (D2, 30 Sep 2026: calmer): one line that says what needs him ("Good
// afternoon, Sam. 2 people need a call back."); Needs you, one row each
// for an urgent call to call back (Call) and a held date to confirm (Confirm);
// Recent calls, the last three, one line each, and "All calls". The three big
// numbers and the duplicate lists are gone. Before the first call, one tile
// that says what will show here. The line's state lives in the header pill
// (D1); until that pill is there, the old line block stays, so he can always
// pause.
import { $, h, say, now, todayIso, shortDay, clock, callDay, firstName, phoneReadable, phoneHref, dayWords } from './ui.js';
import { ROUTES } from './api.js';
import { openCall, setCallsFilter } from './calls.js';

// the screens' own look (D2): one link, added once, same origin
if (!document.querySelector('link[href$="screens.css"]')) {
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('screens.css', import.meta.url).pathname }));
}

const TOP = 3; // rows of each kind in Needs you; the rest are one link

function greeting(t) {
  const hr = t.getHours();
  return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
}

const byNewest = (a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0);
const live = (x) => x.status === 'held' || x.status === 'confirmed';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The one sentence after the greeting: what needs him, in plain words. */
export function needsSentence({ calls = 0, urgent = 0, toConfirm = 0, paused = false }) {
  if (!calls && !toConfirm) return paused ? 'No calls yet. Your line is paused.' : 'No calls yet. Your robot answers the calls you miss.';
  const people = urgent ? `${urgent === 1 ? '1 person needs' : `${urgent} people need`} a call back` : '';
  const dates = toConfirm ? `${plural(toConfirm, 'held date', 'held dates')} to confirm` : '';
  if (people && dates) return `${people}, and ${dates}.`;
  if (people) return `${people}.`;
  if (dates) return `Nothing urgent. ${dates[0].toUpperCase()}${dates.slice(1)}.`;
  return 'Nothing needs you right now.';
}

/** The header pill (D1) pauses and resumes: then the line block leaves Today. */
const pillWorks = () => {
  const p = $('[data-line-now]');
  return !!p && (p.tagName === 'BUTTON' || p.getAttribute('role') === 'button' || !!p.querySelector('button'));
};

export function renderToday(app) {
  const s = app.state;
  const t = now();
  const today = todayIso();
  const company = s.company || app.me.company || 'your company';
  const calls = [...(s.calls || [])].sort(byNewest);
  const holds = (s.holds || []).filter(live).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const urgent = calls.filter((c) => c.urgent && !c.calledBack);
  const toConfirm = holds.filter((x) => x.status === 'held' && x.date >= today);

  // the one line
  const date = $('[data-today-date]');
  if (date) date.textContent = shortDay(t);
  const name = firstName(app.me.name);
  const line = needsSentence({ calls: calls.length, urgent: urgent.length, toConfirm: toConfirm.length, paused: s.paused });
  const hello = `${name ? `${greeting(t)}, ${name}` : greeting(t)}.`;
  $('[data-greeting]').replaceChildren(hello, ' ', h('span', { class: 'needs-line', text: line }));
  const lineEl = $('[data-today-line]');
  lineEl.textContent = line;
  lineEl.hidden = true; // it is in the heading: one line, read once

  // the three numbers go (the sentence says it)
  const facts = $('[data-today-facts]');
  if (facts) { facts.replaceChildren(); facts.hidden = true; }

  // the line block: only until the header pill does it
  lineBlock(app, company);

  // before the first call: one tile that reads well
  const empty = $('[data-today-empty]');
  const lists = $('[data-today-lists]');
  empty.hidden = calls.length > 0 || holds.length > 0;
  lists.hidden = !empty.hidden;
  const old = $('[data-today-holds]');
  if (old) { old.replaceChildren(); old.hidden = true; }
  if (!empty.hidden) {
    empty.replaceChildren(h('div', { class: 'today-empty' },
      h('p', { class: 'row-title', text: 'Your robot is ready for the first call' }),
      h('p', { class: 'row-sub', text: 'When someone calls, you see their name, their number and what they need here, the ones that need you first.' }),
      h('a', { class: 'bt s', href: '#setup-forward', text: 'Open the setup' })));
    $('[data-today-urgent]').replaceChildren();
    $('[data-today-latest]').replaceChildren();
    return;
  }

  // Needs you: urgent calls to call back, then held dates to confirm
  const out = h('p', { class: 'say note-undo', role: 'status', 'aria-live': 'polite', hidden: true, 'data-today-needs-say': '' });
  const rows = [
    ...urgent.slice(0, TOP).map((c) => urgentRow(app, c, today)),
    ...(urgent.length > TOP ? [moreRow(`${urgent.length - TOP} more urgent ${urgent.length - TOP === 1 ? 'call' : 'calls'}`, '#calls', { 'data-more-urgent': '', onclick: () => setCallsFilter('urgent') })] : []),
    ...toConfirm.slice(0, TOP).map((x) => holdRow(app, x, out)),
    ...(toConfirm.length > TOP ? [moreRow(`${toConfirm.length - TOP} more held ${toConfirm.length - TOP === 1 ? 'date' : 'dates'}`, '#calendar', { 'data-more-held': '' })] : []),
  ];
  $('[data-today-urgent]').replaceChildren(h('section', { class: 'block', 'aria-labelledby': 't-needs-h' },
    h('h3', { class: 'block-h', id: 't-needs-h', tabindex: '-1', text: 'Needs you' }),
    rows.length ? h('ul', { class: 'rows', 'data-needs': '' }, rows) : h('p', { class: 'row-sub quiet', 'data-needs-none': '', text: 'Nothing needs you right now.' }),
    out));

  // Recent calls: the last three, one line each
  $('[data-today-latest]').replaceChildren(h('section', { class: 'block', 'aria-labelledby': 't-recent-h' },
    h('div', { class: 'block-top' }, h('h3', { class: 'block-h', id: 't-recent-h', text: 'Recent calls' }), h('a', { class: 'link', href: '#calls', onclick: () => setCallsFilter('all'), text: 'All calls' })),
    h('ul', { class: 'rows', 'data-recent': '' }, calls.slice(0, 3).map((c) => h('li', { class: 'row', 'data-recent-call': c.id },
      h('button', { class: 'row-main', type: 'button', id: `t-call-${c.id}`, 'aria-label': `${c.name || 'No name given'}${c.urgent && !c.calledBack ? ', urgent' : ''}, ${callDay(c.at) === today ? clock(c.at) : `${shortDay(new Date(c.at))} ${clock(c.at)}`}, see the call`, onclick: (e) => openCall(app, c.id, e.currentTarget) },
        h('span', { class: 'row-title' }, c.name || 'No name given', c.urgent && !c.calledBack ? h('span', { class: 'mark-urgent', text: 'Urgent' }) : null),
        c.what ? h('span', { class: 'row-sub', text: c.what }) : null),
      h('span', { class: 'row-end time', text: callDay(c.at) === today ? clock(c.at) : shortDay(new Date(c.at)) }))))));
}

function moreRow(text, href, attrs) {
  return h('li', { class: 'row more' }, h('a', { class: 'link', href, ...attrs, text }));
}

function urgentRow(app, c, today) {
  const readable = phoneReadable(c.callback);
  const when = callDay(c.at) === today ? clock(c.at) : `${shortDay(new Date(c.at))} ${clock(c.at)}`;
  return h('li', { class: 'row', 'data-urgent-call': c.id },
    h('button', { class: 'row-main', type: 'button', 'aria-label': `${c.name || 'No name given'}, urgent, ${when}, see the call`, onclick: (e) => openCall(app, c.id, e.currentTarget) },
      h('span', { class: 'row-title' }, c.name || 'No name given', h('span', { class: 'mark-urgent', text: 'Urgent' })),
      h('span', { class: 'row-sub', text: [c.what, when].filter(Boolean).join(' · ') })),
    h('span', { class: 'row-end' }, c.callback
      ? h('a', { class: 'bt p', href: phoneHref(c.callback), 'aria-label': `Call ${c.name || 'the caller'} at ${readable}`, text: 'Call' })
      : h('span', { class: 'row-sub', text: 'No number' })));
}

function holdRow(app, x, out) {
  const confirm = h('button', { class: 'bt s', type: 'button', id: `t-confirm-${x.date}`, text: 'Confirm', 'aria-label': `Confirm ${dayWords(x.date)}` });
  confirm.addEventListener('click', async () => {
    if (await app.change(ROUTES.hold, { date: x.date, action: 'confirm' }, $('[data-today-needs-say]'), confirm)) {
      say($('[data-today-needs-say]'), `Done. ${shortDay(x.date)} is confirmed.`, true);
      const hd = $('#t-needs-h');
      if (hd) hd.focus();
    }
  });
  return h('li', { class: 'row', 'data-hold': x.date },
    h('div', { class: 'row-main' },
      h('span', { class: 'row-title' }, `${shortDay(x.date)}, held`),
      h('span', { class: 'row-sub', text: [x.name, x.what].filter(Boolean).join(' · ') || 'Held by your robot' })),
    h('span', { class: 'row-end' }, confirm));
}

/** The old line block: pause from Today, only while the header has no pill. */
function lineBlock(app, company) {
  const tile = $('#tab-today .line-t');
  if (!tile) return;
  const s = app.state;
  if (pillWorks()) { tile.hidden = true; return; }
  tile.hidden = false;
  $('[data-line-word]').textContent = s.paused ? 'Paused' : 'Answering';
  $('[data-pause-sentence]').textContent = s.paused
    ? `Callers hear that ${company} will call them back. Your robot still takes their name, number and what they need, and holds no date.`
    : `If you pause, callers hear that ${company} will call them back. Your robot still takes their name, number and what they need, and holds no date.`;
  const btn = $('[data-today-pause]');
  btn.textContent = s.paused ? 'Turn answering back on' : 'Pause the line';
  btn.className = s.paused ? 'bt p' : 'bt s';
  if (!btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => app.change(ROUTES.pause, { paused: !app.state.paused }, $('[data-today-pause-say]'), btn));
  }
  const raw = s.lineNumber || '';
  $('[data-line-number]').replaceChildren(raw
    ? h('a', { class: 'tel', href: phoneHref(raw), 'data-dial-line': '', 'aria-label': `Call your line, ${phoneReadable(raw)}`, text: phoneReadable(raw) })
    : h('span', { class: 'mut', 'data-no-line-number': '', text: 'Ethan sends you its number.' }));
}
