// The account page's only way to the server (OWNER-SPEC.md, "The contract").
// No DOM here, so test/account-page.test.mjs can load it in node.
//
// Real mode: same origin, credentials 'same-origin', JSON in and out, only the
// contract's routes. Fixture mode (?fixture=1, and only on localhost or
// 127.0.0.1): the same routes answered in the page from fixture.json (sample
// data), so the page can be built and checked before the backend exists.

export const ROUTES = {
  signin: '/api/account/signin',
  signout: '/api/account/signout',
  signoutAll: '/api/account/signout-all',
  password: '/api/account/password',
  me: '/api/account/me',
  profile: '/api/account/profile',
  state: '/api/owner/state',
  hold: '/api/owner/hold',
  block: '/api/owner/block',
  pause: '/api/owner/pause',
  call: '/api/owner/call',
  facts: '/api/owner/facts',
};

export const FACT_FIELDS = ['companyName', 'towns', 'moves', 'never', 'quotes', 'days', 'bookAhead', 'urgent', 'alwaysSay', 'neverSay', 'noticeEmail'];

const LOCAL = new Set(['localhost', '127.0.0.1']);

/** The fixture switch: ?fixture=1, and only on this machine. */
export function fixtureOn(loc) {
  // demo copy: always on sample data, there is no server behind this site
  return true;
}

const NO_SERVER = 'The page could not reach the server. Check your connection and try again.';
const OUR_SIDE = 'Something went wrong on our side. Try again in a minute.';

/**
 * Returns call(route, body?) -> { status, data }. A body means POST. data is
 * always an object; when the server sends no JSON, data.say is a plain sentence.
 */
// B9: no request waits for ever. After this long it is given up, and the page
// says in words that it did not go through (and keeps what he typed).
export const TIMEOUT_MS = 15000;

export function makeApi({ fixture = false, fetchImpl = globalThis.fetch.bind(globalThis), timeoutMs = TIMEOUT_MS } = {}) {
  if (fixture) return fixtureApi(fetchImpl);
  const allowed = new Set(Object.values(ROUTES));
  return async function call(route, body) {
    if (!allowed.has(route)) throw new Error(`not a contract route: ${route}`);
    const post = body !== undefined;
    const init = {
      method: post ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: post ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
    };
    if (post) init.body = JSON.stringify(body);
    // status 0 = it never got an answer (no connection, or too slow): offline is
    // true, so the page can say "Not saved" next to the control
    const gone = () => ({ status: 0, data: { ok: false, say: NO_SERVER, offline: true } });
    const stop = typeof AbortController === 'function' ? new AbortController() : null;
    if (stop) init.signal = stop.signal;
    const timer = setTimeout(() => { if (stop) stop.abort(); }, timeoutMs);
    let res;
    let data = null;
    try {
      try { res = await fetchImpl(route, init); } catch { return gone(); }
      try { data = await res.json(); } catch { if (stop && stop.signal.aborted) return gone(); data = null; }
    } finally { clearTimeout(timer); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = res.ok ? { ok: true } : { ok: false, say: OUR_SIDE };
    if (!res.ok && typeof data.say !== 'string') data.say = OUR_SIDE;
    return { status: res.status, data };
  };
}

// ---------------------------------------------------------------------------
// Fixture mode: the contract's answers from sample data, kept in memory only.
// Sign in with the fixture's email and the password below.
// ---------------------------------------------------------------------------

export const FIXTURE_PASSWORD = 'sample-password';

const MONEY = /\$\s*\d|\d\s*(dollars?|bucks|usd)\b/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fixtureApi(fetchImpl) {
  let db = null;
  let signedIn = false;
  let mustChange = true;
  let password = FIXTURE_PASSWORD;
  const load = async () => {
    if (db) return;
    const res = await fetchImpl('/eivor-account-demo/account/fixture.json', { credentials: 'same-origin', cache: 'no-store' });
    const raw = await res.json();
    db = { me: raw.me, state: raw.state, lineTaken: raw._lineTaken || [] };
    // fixture-only switches on this machine: ?sample=empty (no calls or holds yet)
    // and ?number=<digits> (the line has its own number)
    const q = new URLSearchParams(globalThis.location ? globalThis.location.search : '');
    if (q.get('sample') === 'empty') { db.state.calls = []; db.state.holds = []; }
    if (/^\+?\d{10,11}$/.test(q.get('number') || '')) db.state.lineNumber = q.get('number');
    call.fixture = { now: raw._now || null };
  };
  const ok = (extra) => ({ status: 200, data: { ok: true, ...extra } });
  const bad = (say) => ({ status: 400, data: { ok: false, say } });
  const out = () => ({ status: 401, data: { ok: false, say: 'Sign in to see your account.' } });
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const state = () => ok({ state: copy(db.state) });
  // M2: the sample's day reasons follow a block, a free or a release the way
  // the server's do (a blocked or held day is taken; freed, it is what it was).
  const retake = (date) => {
    const why = db.state.days && db.state.days.why;
    if (!why) return;
    const busy = db.state.blocked.includes(date) || db.lineTaken.includes(date) || db.state.holds.some((x) => x.date === date && x.status !== 'released');
    if (busy && !why[date]) why[date] = 'taken';
    else if (!busy && why[date] === 'taken') delete why[date];
  };

  async function call(route, body) {
    await load();
    const b = body || {};
    if (route === ROUTES.signin) {
      if (String(b.email || '').trim().toLowerCase() !== db.me.email || b.password !== password) {
        return bad('That email and password do not match. Try again.');
      }
      signedIn = true;
      return ok({ mustChangePassword: mustChange });
    }
    if (!signedIn) return out();
    if (mustChange && ![ROUTES.signout, ROUTES.signoutAll, ROUTES.password, ROUTES.me].includes(route)) {
      return { status: 403, data: { ok: false, say: 'Please change your password first.', mustChangePassword: true } };
    }
    switch (route) {
      case ROUTES.signout:
      case ROUTES.signoutAll:
        signedIn = false;
        return ok();
      case ROUTES.password:
        if (b.current !== password) return bad('Your current password is not right.');
        if (typeof b.next !== 'string' || b.next.length < 10) return bad('Choose a password of at least 10 characters.');
        password = b.next;
        mustChange = false;
        return ok();
      case ROUTES.me:
        return { status: 200, data: { ...copy(db.me), mustChangePassword: mustChange } };
      case ROUTES.profile: {
        if (b.noticeEmail !== undefined && !EMAIL.test(b.noticeEmail)) return bad('The notice email does not look like an email address.');
        if (b.name !== undefined && !String(b.name).trim()) return bad('Your name cannot be empty.');
        for (const k of ['name', 'cell', 'noticeEmail']) if (b[k] !== undefined) db.me[k] = String(b[k]).trim();
        return ok({ me: copy(db.me) });
      }
      case ROUTES.state:
        return state();
      case ROUTES.hold: {
        const h = db.state.holds.find((x) => x.date === b.date && x.status !== 'released');
        if (!h) return bad('That date is not held any more.');
        if (b.action === 'confirm') h.status = 'confirmed';
        else if (b.action === 'release') h.status = 'released';
        else return bad('Choose Confirm or Release.');
        const c = db.state.calls.find((x) => x.id === `call-${h.callId}`);
        if (c) c.held = { date: h.date, status: h.status };
        retake(h.date);
        return state();
      }
      case ROUTES.block: {
        if (!DAY.test(b.date || '')) return bad('That is not a date.');
        const set = new Set(db.state.blocked);
        if (b.blocked) set.add(b.date); else set.delete(b.date);
        db.state.blocked = [...set].sort();
        retake(b.date);
        return state();
      }
      case ROUTES.pause:
        db.state.paused = b.paused === true;
        return state();
      case ROUTES.call: {
        const c = db.state.calls.find((x) => x.id === b.id);
        if (!c) return bad('That call is not in your list.');
        c.calledBack = b.calledBack === true;
        return state();
      }
      case ROUTES.facts: {
        const keys = Object.keys(b);
        if (!keys.length) return bad('Nothing to save.');
        for (const k of keys) {
          if (!FACT_FIELDS.includes(k)) return bad(`"${k}" is not something your robot knows.`);
          const v = Array.isArray(b[k]) ? b[k].join(', ') : String(b[k] ?? '');
          if (v.length > 600) return bad('That is too long. Keep each answer under 600 characters.');
          if (v.includes('!')) return bad('Take out the "!". Your robot speaks calmly.');
          if (MONEY.test(v)) return bad('Take out the price. Your robot never says an amount of money.');
          if (k === 'companyName' && !v.trim()) return bad('The company name cannot be empty.');
          if (k === 'noticeEmail' && !EMAIL.test(v)) return bad('The notice email does not look like an email address.');
          if (k === 'days' && (!Array.isArray(b[k]) || !b[k].length || b[k].some((x) => !WEEK.includes(x)))) return bad('Pick at least one working day.');
          const min = db.state.bookAheadMin || 1;
          if (k === 'bookAhead' && (!Number.isInteger(b[k]) || b[k] < min || b[k] > 120)) return bad(`How far ahead you book must be a whole number of days, from ${min} to 120.`);
        }
        for (const k of keys) db.state.facts[k] = b[k];
        if (b.companyName !== undefined) db.state.company = String(b.companyName).trim();
        db.state.factsVersion += 1;
        return state();
      }
      default:
        return { status: 404, data: { ok: false, say: OUR_SIDE } };
    }
  }
  return call;
}
