// Settings (was Profile; O4b, D1): his details (name, cell for urgent calls, notice email),
// the password, his line's own number once the line has one, the "Add to your
// home screen" tile with the iPhone and Android steps, the setup again, Help,
// and signing out (Sign out everywhere asks in the page first; app.js signs out).
import { $, h, say, busy, phoneReadable, phoneHref, setField } from './ui.js';
import { ROUTES } from './api.js';
import { app } from './app.js';

export function renderProfile(a) {
  $('[data-who]').textContent = a.me.name ? `Signed in as ${a.me.name}${a.me.email ? `, ${a.me.email}` : ''}.` : '';
  const raw = a.state.lineNumber || '';
  // D1: Settings, Your line: the number as one row with its Call button
  $('[data-profile-number]').replaceChildren(raw
    ? h('div', { class: 'row' },
      h('span', {}, h('span', { class: 'row-title stat-s', text: phoneReadable(raw) }),
        h('span', { class: 'row-sub', text: 'Callers who reach your robot are on this number. Call it from another phone to hear your robot.' })),
      h('span', { class: 'row-end' }, h('a', { class: 'bt s', href: phoneHref(raw), 'data-dial-line': '', text: 'Call your line' })))
    : h('div', { class: 'row' },
      h('span', {}, h('span', { class: 'row-title', 'data-no-line-number': '', text: 'Ethan sends you your line’s number.' }),
        h('span', { class: 'row-sub', text: 'It shows here on the day your line is switched on, with a button to call it.' }))));
  installed();
}

export function clearProfile() {
  $('[data-all-ask]').hidden = true;
  $('[data-signout-all]').hidden = false;
  $('[data-profile-number]').replaceChildren();
}

export function fillProfile(a) {
  setField($('#p-name'), a.me.name || '');
  setField($('#p-cell'), a.me.cell ? phoneReadable(a.me.cell) : '');
  setField($('#p-noticeEmail'), a.me.noticeEmail || '');
}

$('#profile-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = e.submitter || $('#profile-form button');
  const out = $('#profile-say');
  const body = {};
  const me = app.me;
  const name = $('#p-name').value.trim();
  const cell = $('#p-cell').value.trim();
  const noticeEmail = $('#p-noticeEmail').value.trim();
  const digits = (v) => String(v || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (name !== (me.name || '')) body.name = name;
  if (digits(cell) !== digits(me.cell)) body.cell = cell;
  if (noticeEmail !== (me.noticeEmail || '')) body.noticeEmail = noticeEmail;
  if (!Object.keys(body).length) { say(out, 'Nothing changed.', true); return; }
  busy(btn, async () => {
    const r = await app.sendNear(ROUTES.profile, body, out);
    if (!r) return;
    if (!r.data.ok) { say(out, r.data.say || 'That did not work. Try again.'); return; }
    // the new profile as the server sends it: in "me", as the answer itself, or read again
    let fresh = r.data.me || (r.data.email ? r.data : null);
    if (!fresh) {
      const again = await app.send(ROUTES.me);
      if (!again) return;
      fresh = again.status === 200 ? again.data : null;
    }
    if (fresh) app.me = { ...app.me, ...fresh };
    fillProfile(app);
    app.render();
    say(out, 'Saved.', true);
  });
});

$('#password-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = e.submitter || $('#password-form button');
  const out = $('#password-say');
  const current = $('#pw-current').value;
  const next = $('#pw-next').value;
  if (!current) { say(out, 'Type your current password.'); $('#pw-current').focus(); return; }
  if (next.length < 10) { say(out, 'Use at least 10 characters.'); $('#pw-next').focus(); return; }
  busy(btn, async () => {
    const r = await app.sendNear(ROUTES.password, { current, next }, out);
    if (!r) return;
    if (!r.data.ok) { say(out, r.data.say || 'That did not work. Try again.'); return; }
    $('#password-form').reset();
    say(out, 'Password changed.', true);
  });
});

// Sign out everywhere asks in the page first (app.js does the signing out)
$('[data-signout-all]').addEventListener('click', () => {
  $('[data-all-ask]').hidden = false;
  $('[data-signout-all]').hidden = true;
  $('#all-yes').focus();
});
$('#all-no').addEventListener('click', () => {
  $('[data-all-ask]').hidden = true;
  $('[data-signout-all]').hidden = false;
  $('[data-signout-all]').focus();
});

// ---------------------------------------------------------------------------
// the home screen: the phone's own "Add" when Chrome offers it, else the steps
// ---------------------------------------------------------------------------

let offer = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function installed() {
  $('[data-installed]').hidden = !standalone();
  $('[data-install-now]').hidden = standalone() || !offer;
}
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); offer = e; installed(); });
addEventListener('appinstalled', () => { offer = null; installed(); });
$('[data-install]').addEventListener('click', async () => {
  if (!offer) return;
  const o = offer;
  offer = null;
  o.prompt();
  try { await o.userChoice; } catch { /* the phone said no; the steps stay */ }
  installed();
});
