// The owner's app (OWNER-SPEC.md; O2 made it work, O4a gives it the new shell).
// Views, one at a time: the sign-in (signed out), the setup (first sign-in, and
// from Profile), and the app with five tabs on hash routes (#today, #calls,
// #calendar, #robot, #profile), so the phone's back button works and each tab
// keeps its own scroll. Every change goes through api.js to the contract's
// routes and the page then shows the state the server sends back. A 401
// anywhere goes back to the sign-in; a 400 shows its sentence next to the
// thing that failed. Nothing is kept in the browser's storage or cookies here.
import { makeApi, fixtureOn, ROUTES } from './api.js';
import { d, $, $$, say, busy, setFixtureNow, clock, unsavedIn, undoNote, hideUndo } from './ui.js';
import { renderToday } from './today.js';
import { renderCalls, closeSheet, sheetOpen } from './calls.js';
import { renderParts, fillFacts, fillProfile, clearParts, fillCalendarLink, putBackFacts } from './parts.js';
import { showStep, stepFromHash, clearSetup } from './setup.js';

const FIXTURE = fixtureOn(location);
const api = makeApi({ fixture: FIXTURE });
export const TABS = ['today', 'calls', 'calendar', 'robot', 'profile'];
const TAB_NAMES = { today: 'Today', calls: 'Calls', calendar: 'Calendar', robot: 'Robot', profile: 'Settings' };
const VIEWS = ['opening', 'signin', 'setup', 'account'];

/** What every part of the page shares: who he is, his line, and how to change it. */
export const app = {
  me: null,
  state: null,
  fixture: FIXTURE,
  firstRun: false,      // this sign-in started with "Choose your own password" (page only)
  firstPassword: null,  // only in memory, only between the sign-in and the new password
  send, sendNear, change, render, nav, signedOut, refresh,
};

const scrolls = new Map(); // tab -> its scroll, so each tab keeps its place
let tab = null;            // the tab on show

// ---------------------------------------------------------------------------
// views and routes
// ---------------------------------------------------------------------------

function showView(name) {
  for (const v of VIEWS) $(`#${v}`).hidden = v !== name;
  for (const n of $$('[data-tabs]')) n.hidden = name !== 'account';
  $('[data-line-now]').hidden = name !== 'account';
  if (name !== 'account') hideUndo();
}
const shownView = () => VIEWS.find((v) => !$(`#${v}`).hidden);

/** Go to a hash; the route follows (also when it is the hash already). */
export function nav(hash, replace = false) {
  if (location.hash === hash) { route(); return; }
  if (replace) { history.replaceState(null, '', hash); route(); return; }
  location.hash = hash;
}

function route(fromUser = false) {
  if (!app.me || !app.state) return; // signed out or still opening
  if (app.me.mustChangePassword) { showChoose(); return; }
  const hash = location.hash.slice(1);
  const step = stepFromHash(hash);
  if (step) { leaveTab(); closeSheet(false); showView('setup'); showStep(step); return; }
  if (!TABS.includes(hash)) { nav('#today', true); return; }
  showTab(hash, fromUser);
}

function leaveTab() {
  if (tab && shownView() === 'account') scrolls.set(tab, scrollY);
}

function showTab(name, fromUser) {
  const was = tab;
  leaveTab();
  closeSheet(false);
  showView('account');
  tab = name;
  for (const s of $$('[data-tab]')) s.hidden = s.dataset.tab !== name;
  for (const a of $$('[data-tabs] a')) {
    if (a.dataset.to === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  document.title = `${TAB_NAMES[name]} · ${companyName()}`;
  scrollTo(0, scrolls.get(name) || 0);
  // a tap on a tab moves the reading place to that tab's heading
  if (fromUser && was !== name) {
    const head = $(`#tab-${name} h2`);
    if (head) { head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); }
  }
}

addEventListener('hashchange', () => route(true));

const companyName = () => (app.state && app.state.company) || (app.me && app.me.company) || 'Your account';

// ---------------------------------------------------------------------------
// talking to the server
// ---------------------------------------------------------------------------

let writes = 0;   // changes sent so far (a refresh that raced one is dropped)
let writing = 0;  // changes still waiting for their answer

/** One call to the server. 401: back to the sign-in, keeping in memory what he
 *  was typing (B12). Otherwise the answer. */
async function send(route, body, quiet = false) {
  const post = body !== undefined;
  if (post) { writes += 1; writing += 1; }
  let r;
  try { r = await api(route, body); } finally { if (post) writing -= 1; }
  if (r.status === 401 && route !== ROUTES.signin) {
    signedOut(quiet ? '' : 'You are signed out. Sign in again.', true);
    return null;
  }
  // the server wants the first password changed before anything else
  if (r.status === 403 && r.data.mustChangePassword === true && route !== ROUTES.password) {
    if (app.me) app.me.mustChangePassword = true;
    showChoose();
    return null;
  }
  return r;
}

const NOT_SAVED = 'Not saved: no connection. Try again.';
const STILL = 'Still trying. Your change is not saved yet.';

/** A change that says in words, next to its control, when it is slow (after
 *  5 seconds) and when it did not get through (no answer in 15 seconds, B9).
 *  What he typed is never touched here. */
async function sendNear(route, body, sayEl) {
  const slow = setTimeout(() => say(sayEl, STILL), 5000);
  let r;
  try { r = await send(route, body); } finally {
    clearTimeout(slow);
    if (sayEl && sayEl.textContent === STILL) say(sayEl, '');
  }
  if (r && r.status === 0) r.data.say = NOT_SAVED;
  return r;
}

/** A POST that answers { ok, state }: show the new state, or the sentence. */
async function change(route, body, sayEl, btn) {
  return busy(btn, async () => {
    const r = await sendNear(route, body, sayEl);
    if (!r) return false;
    if (r.data.ok && r.data.state) {
      say(sayEl, '');
      app.state = r.data.state;
      render();
      return true;
    }
    say(sayEl, r.data.say || 'That did not work. Try again.');
    return false;
  });
}

// ---------------------------------------------------------------------------
// signing in and out
// ---------------------------------------------------------------------------

// B12: when the session ends by itself (a 401), his unsaved edits are kept in
// memory only (never a password, never in the browser's storage) and put back
// after he signs in again as the same person. Signing out on purpose keeps none.
let kept = null; // { email, edits }

function signedOut(message, keepEdits = false) {
  const edits = keepEdits && app.me && app.me.email
    ? [...unsavedIn($('[data-fact-groups]')), ...unsavedIn($('#profile-form'))] : [];
  kept = edits.length ? { email: String(app.me.email).toLowerCase(), edits } : null;
  app.me = null; app.state = null; app.firstPassword = null; app.firstRun = false;
  lastLoad = 0; loadFailed = false;
  tab = null; scrolls.clear();
  closeSheet(false);
  for (const f of d.querySelectorAll('form')) f.reset();
  clearParts();
  clearSetup();
  for (const s of d.querySelectorAll('.say')) say(s, '');
  $('#company').textContent = 'Your account';
  document.title = 'Your account · Aivorlabs';
  showView('signin');
  say($('#si-say'), message || '');
  scrollTo(0, 0);
  $('#si-email').focus();
}

$('#signin-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = e.submitter || $('#signin-form button');
  const email = $('#si-email').value.trim();
  const password = $('#si-password').value;
  const out = $('#si-say');
  if (!email || !password) { say(out, 'Type your email and your password.'); return; }
  busy(btn, async () => {
    const r = await api(ROUTES.signin, { email, password });
    if (!r.data.ok) { say(out, r.data.say || 'That did not work. Try again.'); $('#si-password').value = ''; $('#si-password').focus(); return; }
    say(out, '');
    $('#si-password').value = '';
    if (r.data.mustChangePassword) {
      app.firstPassword = password;
      app.firstRun = true;
      app.me = { mustChangePassword: true };
      showChoose();
      return;
    }
    await open();
  });
});

/** Step 1 of the setup: his own password (the server asks for it first). */
function showChoose() {
  app.firstRun = true;
  $('#choose-form').reset();
  say($('#ch-say'), '');
  // right after the sign-in the page still has the password he typed, so it
  // does not ask for it again; after a reload it does
  $('#ch-current-wrap').hidden = app.firstPassword !== null;
  showView('setup');
  showStep('password');
  scrollTo(0, 0);
  (app.firstPassword !== null ? $('#ch-next') : $('#ch-current')).focus();
}

$('#choose-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = e.submitter || $('#choose-form button');
  const out = $('#ch-say');
  const current = app.firstPassword !== null ? app.firstPassword : $('#ch-current').value;
  const next = $('#ch-next').value;
  if (!current) { say(out, 'Type the password you signed in with.'); $('#ch-current').focus(); return; }
  if (next.length < 10) { say(out, 'Use at least 10 characters.'); $('#ch-next').focus(); return; }
  if (next !== $('#ch-again').value) { say(out, 'The two new passwords are not the same.'); $('#ch-again').focus(); return; }
  busy(btn, async () => {
    const r = await send(ROUTES.password, { current, next });
    if (!r) return;
    if (!r.data.ok) { say(out, r.data.say || 'That did not work. Try again.'); return; }
    app.firstPassword = null;
    await open({ setup: true });
  });
});

async function signOut(route, btn) {
  await busy(btn, async () => {
    const r = await send(route, {});
    if (!r) return;
    if (!r.data.ok) { say($('[data-signout-say]'), r.data.say || 'That did not work. Try again.'); return; }
    signedOut(route === ROUTES.signoutAll ? 'You are signed out on every phone and computer.' : 'You are signed out.');
  });
}
$('[data-signout]').addEventListener('click', (e) => signOut(ROUTES.signout, e.currentTarget));
// Sign out everywhere asks in the page first (profile.js); its Yes signs out here
$('#all-yes').addEventListener('click', (e) => signOut(ROUTES.signoutAll, e.currentTarget));
$('[data-unpause]').addEventListener('click', (e) => change(ROUTES.pause, { paused: false }, $('[data-pause-say]'), e.currentTarget));

// The line pill in the header (D1): tapping it pauses or resumes the line at
// once through the same route, with a "Done. Undo" note instead of a question.
async function setPaused(paused, btn) {
  const out = $('[data-pill-say]');
  return change(ROUTES.pause, { paused }, out, btn);
}
$('[data-line-now]').addEventListener('click', async (e) => {
  if (!app.state) return;
  const to = !app.state.paused;
  if (await setPaused(to, e.currentTarget)) {
    undoNote(to ? 'Done. Your line is paused.' : 'Done. Your line is answering.', () => setPaused(!to, null));
  }
});

/** Load who he is and his line's state, then show the right view. */
async function open({ first = false, setup = false } = {}) {
  const a = await send(ROUTES.me, undefined, first);
  if (!a) return;
  if (!a.data || a.status !== 200 || a.data.ok === false) { signedOut(a.data.say || ''); return; }
  app.me = a.data;
  if (api.fixture && api.fixture.now) setFixtureNow(api.fixture.now);
  if (app.me.mustChangePassword) { showChoose(); return; }
  const b = await send(ROUTES.state);
  if (!b) return;
  if (b.status !== 200 || b.data.ok === false) {
    showView('opening');
    $('#opening-text').textContent = b.data.say || 'Your account could not be opened. Try again in a minute.';
    return;
  }
  app.state = stateOf(b);
  lastLoad = Date.now();
  loadFailed = false;
  fillFacts(app);
  fillProfile(app);
  render();
  if (setup) nav('#setup-forward');
  else if (!location.hash || location.hash === '#') nav('#today', true);
  else route();
  putBackKept();
}

const stateOf = (b) => (b.data.state && typeof b.data.state === 'object' ? b.data.state : b.data);

/** After a sign-in, the edits the ended session was holding go back (B12). */
function putBackKept() {
  if (!kept || !app.me) return;
  const mine = String(app.me.email || '').toLowerCase() === kept.email;
  const { edits } = kept;
  kept = null;
  if (!mine) return;
  const inRobot = putBackFacts(edits.filter((x) => x.id.startsWith('f-')));
  const inProfile = edits.filter((x) => x.id.startsWith('p-'));
  for (const { id, value } of inProfile) { const el = d.getElementById(id); if (el) el.value = value; }
  if (inProfile.length) say($('#profile-say'), 'Your change is back here. It is not saved yet: press Save.');
  if (inRobot) nav('#robot', true);
  else if (inProfile.length) nav('#profile', true);
}

// ---------------------------------------------------------------------------
// keeping it fresh (B7): the state is read again when the app comes back to
// the screen and every minute while it is on screen, one request each time
// (only the state, never "me" again: B18)
// ---------------------------------------------------------------------------

let lastLoad = 0;       // when the state last came in (the phone's clock)
let loadFailed = false; // the last refresh got no answer
let loading = false;
const EVERY_MS = 60000;
const QUIET_MS = 5000;  // two reasons at once make one request

async function refresh(force = false) {
  if (!app.me || !app.state || app.me.mustChangePassword || loading) return;
  if (!force && (Date.now() - lastLoad < QUIET_MS || sheetOpen())) return;
  loading = true;
  const before = writes;
  try {
    const r = await send(ROUTES.state);
    if (!r) return;
    if (r.status !== 200 || r.data.ok === false) { loadFailed = true; showUpdated(); return; }
    // a change sent meanwhile answers with a newer state: keep that one
    if (writes !== before || writing > 0) return;
    app.state = stateOf(r);
    lastLoad = Date.now();
    loadFailed = false;
    fillFacts(app, true);
    render();
  } finally { loading = false; }
}

// D1: no Refresh button and no "Updated" line; it refreshes by itself, and
// only when a refresh gets no answer does one quiet line say so.
function showUpdated() {
  const at = lastLoad ? clock(new Date(lastLoad).toISOString()) : '';
  const el = $('[data-offline]');
  el.textContent = loadFailed ? `Not refreshed: no connection. Showing ${at}.` : '';
  el.hidden = !loadFailed;
}
d.addEventListener('visibilitychange', () => { if (d.visibilityState === 'visible') refresh(); });
addEventListener('pageshow', (e) => { if (e.persisted) refresh(); });
setInterval(() => { if (d.visibilityState === 'visible') refresh(); }, EVERY_MS);

// ---------------------------------------------------------------------------
// drawing the state
// ---------------------------------------------------------------------------

function render() {
  if (!app.state || !app.me) return;
  const keep = d.activeElement && d.activeElement.id;
  $('#company').textContent = companyName();
  if (tab && shownView() === 'account') document.title = `${TAB_NAMES[tab]} · ${companyName()}`;
  const now = $('[data-line-now]');
  now.textContent = app.state.paused ? 'Paused' : 'Answering';
  now.classList.toggle('paused', !!app.state.paused);
  now.setAttribute('aria-label', app.state.paused ? 'Your line is paused. Tap to turn answering back on.' : 'Your line is answering. Tap to pause it.');
  $('[data-fixture]').hidden = !FIXTURE;
  $('[data-paused-flag]').hidden = !app.state.paused;
  renderToday(app);
  renderCalls(app);
  renderParts(app);
  fillCalendarLink(app);
  showUpdated();
  if (keep && d.activeElement !== d.getElementById(keep)) {
    const back = d.getElementById(keep);
    if (back) back.focus({ preventScroll: true });
  }
}

// start: signed in or not
open({ first: true }).catch(() => {
  showView('opening');
  $('#opening-text').textContent = 'Your account could not be opened. Try again in a minute.';
});
