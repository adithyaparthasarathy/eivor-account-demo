// The setup: one step a screen with a progress line. On the first sign-in it
// starts with his own password (the server asks for that first), then: the
// forwarding code for his carrier, his calendar link, a test call, done. Every
// step after the password can be skipped, and the whole setup opens again from
// Profile. Where he is in it lives only in the page (the #setup-... hash);
// nothing is kept in the browser's storage.
import { $, $$, h } from './ui.js';
import { app, nav } from './app.js';
import { copyLink } from './parts.js';

const ALL = ['password', 'forward', 'calendar', 'test', 'done'];
const steps = () => (app.firstRun ? ALL : ALL.slice(1));

export function stepFromHash(hash) {
  const m = /^setup-(forward|calendar|test|done)$/.exec(hash || '');
  return m ? m[1] : null;
}

export function showStep(name) {
  const list = steps();
  const i = Math.max(0, list.indexOf(name));
  for (const s of $$('[data-step]')) s.hidden = s.dataset.step !== name;
  $('[data-step-label]').textContent = `Step ${i + 1} of ${list.length}`;
  const bar = $('[data-step-bar]');
  bar.setAttribute('aria-valuenow', String(i + 1));
  bar.setAttribute('aria-valuemax', String(list.length));
  bar.querySelector('i').style.width = `${Math.round(((i + 1) / list.length) * 100)}%`;
  const box = $(`[data-step="${name}"]`);
  const back = box.querySelector('[data-step-back]');
  if (back) back.hidden = list[i - 1] === 'password'; // from Profile, Back on the first step goes back there
  if (name === 'forward') renderCode();
  document.title = `Setup · ${(app.state && app.state.company) || 'Your account'}`;
  if (name !== 'password') {
    scrollTo(0, 0);
    const head = box.querySelector('h2');
    if (head) head.focus({ preventScroll: true });
  }
}

export function clearSetup() {
  for (const r of $$('[data-carriers] input')) r.checked = false;
  $('[data-forward-code]').replaceChildren();
  $('[data-forward-code]').hidden = true;
}

function current() {
  const box = $$('[data-step]').find((s) => !s.hidden);
  return box ? box.dataset.step : null;
}
function step(by) {
  const list = steps();
  const i = list.indexOf(current());
  const to = list[i + by];
  if (!to || to === 'password') { nav(by < 0 && !app.firstRun ? '#profile' : '#today'); return; }
  nav(`#setup-${to}`);
}
for (const b of $$('[data-step-next]')) b.addEventListener('click', () => step(1));
for (const b of $$('[data-step-back]')) b.addEventListener('click', () => step(-1));
for (const b of $$('[data-step-skip]')) b.addEventListener('click', () => { app.firstRun = false; nav('#today'); });
$('[data-step-finish]').addEventListener('click', () => { app.firstRun = false; nav('#today'); });
$('[data-copy-setup]').addEventListener('click', () => copyLink($('[data-calendar-url-setup]'), $('[data-copy-setup-say]')));
for (const r of $$('[data-carriers] input')) r.addEventListener('change', renderCode);

// ---------------------------------------------------------------------------
// the forwarding codes (the same codes as the line's own instructions)
// ---------------------------------------------------------------------------

/** The line's own number, 10 digits, once it has one (else null). */
function lineDigits() {
  const raw = app.state && (app.state.lineNumber || app.state.number);
  const d = String(raw || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? d : null;
}

const CODES = {
  verizon: { name: 'Verizon', on: ['*71', ''], more: [], off: [['Turn it off', '*73']] },
  tmobile: {
    name: 'T-Mobile', on: ['**61*1', '#'],
    more: [['When you are busy', '**67*1', '#'], ['Phone off or no signal', '**62*1', '#']],
    off: [['Turn it all off', '##004#']],
  },
};
CODES.att = { ...CODES.tmobile, name: 'AT&T' };

function renderCode() {
  const box = $('[data-forward-code]');
  const pick = $('[data-carriers] input:checked');
  box.hidden = !pick;
  if (!pick) { box.replaceChildren(); return; }
  const n = lineDigits();
  const ph = () => h('span', { class: 'ph', text: '(number here)' });
  // the code in groups that never break inside, so "**61*1 425 555 0100#" reads at a glance
  const ck = (t) => h('span', { class: 'ck', text: t });
  const parts = (pre, post) => (n
    ? [ck(pre), ck(n.slice(0, 3)), ck(n.slice(3, 6)), ck(n.slice(6) + post)]
    : [ck(pre), ph(), post ? ck(post) : null]);
  const codeText = (pre, post) => `${pre}${n || ''}${post}`;
  const dial = (pre, post, label) => (n
    ? h('a', { class: 'bt p', href: `tel:${codeText(pre, post).replace(/#/g, '%23')}`, 'data-dial': '', text: label })
    : null);
  if (pick.value === 'other') {
    box.replaceChildren(h('div', { class: 'tile-in' },
      h('p', { class: 'lbl', text: 'Another carrier' }),
      h('p', {}, 'Call your carrier and ask them to forward the calls you do not answer to ', n ? h('strong', { text: n.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3') }) : h('strong', { text: '(number here)' }), '.')));
    return;
  }
  const c = CODES[pick.value];
  box.replaceChildren(
    h('p', { class: 'lbl', text: `${c.name}: dial this on your cell` }),
    h('p', { class: 'code', 'data-code': '' }, ...parts(c.on[0], c.on[1])),
    n ? h('div', { class: 'acts stretch' }, dial(c.on[0], c.on[1], 'Dial it now')) : h('p', { class: 'hint', 'data-no-number': '', text: 'Your line’s number goes where it says (number here). Ethan gives it to you, and a button to dial it shows here once the line has it.' }),
    c.more.length || c.off.length ? h('dl', { class: 'codes' },
      [...c.more.map(([k, pre, post]) => h('div', {}, h('dt', { text: k }), h('dd', {}, h('code', {}, ...parts(pre, post))))),
        ...c.off.map(([k, code]) => h('div', {}, h('dt', { text: k }), h('dd', {}, h('code', {}, ck(code)))))]) : null);
}
