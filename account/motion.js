// The account's motion, its quick-jump command and the name at the foot of the
// side menu (1 Oct 2026). It watches the page the other modules draw and never
// changes any data itself (Sign out and the pause are the page's own buttons,
// pressed for him), so the account works the same without it. GSAP, SplitText and Lenis are the
// unchanged copies in /assets/vendor, loaded as classic scripts before this
// file; the curve and the timings are the home page's own (assets/js/motion.js):
// expo-out, rising a little, a short stagger, once per screen.
//
// Nothing here runs under prefers-reduced-motion except the command, which
// is not motion. Nothing here is needed to read or use the page.
import { app, nav } from './app.js';

const d = document;
const root = d.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const wide = matchMedia('(min-width: 1024px)');
const { gsap, SplitText, Lenis } = window;
const $ = (s, r = d) => r.querySelector(s);
const $$ = (s, r = d) => [...r.querySelectorAll(s)];
const live = !reduce && !!gsap;
if (live && SplitText) gsap.registerPlugin(SplitText);
if (live) root.classList.add('motion');

// ---------------------------------------------------------------- smooth scroll
// Lenis on a laptop with a mouse; not on a phone, where the OS scroll is better.
let lenis = null;
if (live && Lenis && fine && wide.matches) {
  lenis = new Lenis({ lerp: 0.12, autoRaf: false });
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
const freeze = (on) => { if (lenis) (on ? lenis.stop() : lenis.start()); };

// ---------------------------------------------------------------- the side menu's moving mark
const seg = $('.hd .seg');
let mark = null;
if (seg) {
  mark = d.createElement('span');
  mark.className = 'seg-mark';
  mark.setAttribute('aria-hidden', 'true');
  seg.prepend(mark);
}
let markSeen = false;
function moveMark(instant) {
  if (!mark) return;
  const cur = $('a[aria-current="page"]', seg);
  if (!cur || !wide.matches || !cur.offsetHeight) { mark.style.display = 'none'; markSeen = false; return; }
  mark.style.display = '';
  mark.style.height = `${cur.offsetHeight}px`;
  if (!live || instant || !markSeen) gsap ? gsap.set(mark, { y: cur.offsetTop }) : (mark.style.transform = `translateY(${cur.offsetTop}px)`);
  else gsap.to(mark, { y: cur.offsetTop, duration: 0.7, ease: 'expo.out', overwrite: true });
  markSeen = true;
}
if (seg) {
  new MutationObserver(() => moveMark(false)).observe(seg, { attributes: true, subtree: true, attributeFilter: ['aria-current'] });
  new MutationObserver(() => moveMark(true)).observe(seg, { attributes: true, attributeFilter: ['hidden'] });
  wide.addEventListener('change', () => moveMark(true));
  addEventListener('resize', () => moveMark(true));
  d.fonts && d.fonts.ready.then(() => moveMark(true));
}

// ---------------------------------------------------------------- screens come in
const ease = 'expo.out';
const splitDone = new WeakSet();

/** The tab on show: heading rises out of a mask, the cards and rows follow. */
function tabIn(tab) {
  if (!live) return;
  const head = $('.shd .h2, [data-greeting]', tab);
  const sub = $$('.shd .lede, .needs-line, .chips, .hear', tab);
  const cards = $$('.block, .tile.cal, .tile.list, .fgroups, .set-s, .today-empty', tab).filter((el) => !el.hidden && el.offsetParent !== null);
  const tl = gsap.timeline({ defaults: { ease } });
  // the heading rises out of its own box (a clip, not a split: the screens
  // redraw their headings, and a split put back later could bring old words back)
  if (head) tl.fromTo(head, { clipPath: 'inset(0 0 100% 0)', y: 28 }, { clipPath: 'inset(0 0 -20% 0)', y: 0, duration: 1, clearProps: 'clipPath,transform' }, 0);
  if (sub.length) tl.from(sub, { y: 14, opacity: 0, duration: 0.7, stagger: 0.06, clearProps: 'transform,opacity' }, 0.12);
  cards.forEach((c, i) => {
    tl.from(c, { y: 26, opacity: 0, duration: 0.85, clearProps: 'transform,opacity' }, 0.16 + i * 0.07);
    const rows = $$(':scope .row, :scope .crow, :scope .day', c).slice(0, 40);
    if (rows.length) tl.from(rows, { y: 10, opacity: 0, duration: 0.55, stagger: { each: 0.035, amount: 0.5 }, ease: 'power3.out', clearProps: 'transform,opacity' }, 0.3 + i * 0.07);
  });
  // the little counts on the filter chips tick up
  $$('.fchip .n', tab).forEach((n) => {
    const to = Number(n.textContent);
    if (!Number.isFinite(to) || to < 2) return;
    const o = { v: 0 };
    let shown = n.textContent;
    const tw = gsap.to(o, { v: to, duration: 1.1, ease: 'power3.out',
      onUpdate: () => {
        if (n.textContent !== shown) { tw.kill(); return; } // the screen drew a new count: it wins
        shown = String(Math.round(o.v)); n.textContent = shown;
      },
      onComplete: () => { if (n.textContent === shown) n.textContent = String(to); } });
  });
}

/** The first password and each setup step: the card settles in. */
function cardIn(el) {
  if (!live) return;
  const parts = [...el.children].filter((c) => !c.hidden);
  gsap.fromTo(parts, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.06, ease, clearProps: 'transform,opacity' });
}

/** The sign-in: the headline's letters rise out of a mask, the card draws in, the call ticks. */
function signinIn() {
  const art = $('[data-si-art]');
  if (!live || !art) return;
  const tl = gsap.timeline({ defaults: { ease } });
  const h = $('[data-chars]', art);
  if (h && SplitText) {
    const sp = SplitText.create(h, { type: 'words,chars', mask: 'words' });
    tl.from(sp.chars, { yPercent: 110, duration: 1.1, stagger: 0.016 }, 0.1);
  }
  tl.from($$('[data-in]', art).filter((e) => !e.classList.contains('si-card')), { y: 20, opacity: 0, duration: 0.9, stagger: 0.09, clearProps: 'transform,opacity' }, 0.3);
  tl.from($('.si-card', art), { y: 34, opacity: 0, duration: 1.1, clearProps: 'transform,opacity' }, 0.5);
  tl.from($$('.si-calls li', art), { y: 10, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out', clearProps: 'transform,opacity' }, 0.85);
  tl.from('#signin .card-c > *', { y: 14, opacity: 0, duration: 0.8, stagger: 0.05, clearProps: 'transform,opacity' }, 0.25);
  // the sample call ticks on for a few seconds, then holds
  const clock = $('[data-si-clock]');
  if (clock) {
    let t = 43;
    const tick = setInterval(() => { t += 1; clock.textContent = `0:${String(t).padStart(2, '0')}`; if (t >= 49) clearInterval(tick); }, 1000);
  }
  // the sign-in button leans toward the pointer
  const go = $('#signin-form .bt.p');
  if (fine && go) lean(go);
}

function lean(b) {
  const bx = gsap.quickTo(b, 'x', { duration: 0.6, ease: 'power3.out' });
  const by = gsap.quickTo(b, 'y', { duration: 0.6, ease: 'power3.out' });
  b.addEventListener('pointermove', (e) => {
    const r = b.getBoundingClientRect();
    bx((e.clientX - (r.left + r.width / 2)) * 0.12);
    by((e.clientY - (r.top + r.height / 2)) * 0.2);
  });
  b.addEventListener('pointerleave', () => { bx(0); by(0); });
}

/** The sheet (a call, a day) and the robot's editor: a spring in from the edge. */
function sheetIn(el, scrimEl) {
  if (!live) return;
  const side = wide.matches || matchMedia('(min-width: 861px)').matches;
  gsap.fromTo(el, side ? { xPercent: 100 } : { yPercent: 100 }, { xPercent: 0, yPercent: 0, duration: 0.75, ease, clearProps: 'transform' });
  if (scrimEl) gsap.fromTo(scrimEl, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out', clearProps: 'opacity' });
  const kids = [...el.querySelectorAll('.sheet-body > *, .top-row, #sheet-h')];
  gsap.from(kids, { y: 14, opacity: 0, duration: 0.7, stagger: 0.05, ease, delay: 0.1, clearProps: 'transform,opacity' });
}

/** The "Done. Undo" toast: rises and settles, a little spring. */
function toastIn(el) {
  if (!live) return;
  gsap.fromTo(el, { y: 24, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.5)', clearProps: 'transform,opacity' });
}

// ---------------------------------------------------------------- what to watch
const wasHidden = new WeakMap();
function watch(el, onShow) {
  wasHidden.set(el, el.hidden);
  new MutationObserver(() => {
    const was = wasHidden.get(el);
    wasHidden.set(el, el.hidden);
    if (was && !el.hidden) onShow(el);
  }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
}

$$('[data-tab]').forEach((t) => watch(t, tabIn));
$$('#setup .step').forEach((s) => watch(s, cardIn));
const choose = $('#choose');
if (choose) watch(choose, cardIn);
const signin = $('#signin');
if (signin) { watch(signin, signinIn); if (!signin.hidden) signinIn(); }
const sheet = $('#sheet');
if (sheet) {
  sheet.setAttribute('data-lenis-prevent', '');
  watch(sheet, () => { freeze(true); sheetIn(sheet, $('[data-scrim]')); });
  new MutationObserver(() => { if (sheet.hidden) freeze(false); }).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
}
// the robot's editor opens as a class on its group
$$('[data-fact-groups]').forEach((box) => {
  new MutationObserver((list) => {
    for (const m of list) {
      const el = m.target;
      if (m.type === 'attributes' && el.classList && el.classList.contains('fgroup') && el.classList.contains('editing') && !(m.oldValue || '').includes('editing')) {
        el.setAttribute('data-lenis-prevent', '');
        sheetIn(el, $('.robot-scrim'));
      }
    }
  }).observe(box, { attributes: true, attributeOldValue: true, attributeFilter: ['class'], subtree: true });
});
// a sentence from the server (saved, or what to fix) settles in; a wrong
// sign-in or password gives its card a small shake, as a phone does
const shakeIn = { 'si-say': '#signin .card-c', 'ch-say': '#choose' };
function sayIn(el) {
  if (!live || !el.textContent.trim()) return;
  gsap.fromTo(el, { y: -6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out', clearProps: 'transform,opacity' });
  const card = shakeIn[el.id] && $(shakeIn[el.id]);
  if (card && !/^You are signed out/.test(el.textContent)) gsap.fromTo(card, { x: 0 }, { keyframes: { x: [-9, 8, -6, 4, -2, 0] }, duration: 0.5, ease: 'power2.out', clearProps: 'transform' });
}
new MutationObserver((list) => {
  for (const m of list) {
    const el = m.target;
    if (el.classList && el.classList.contains('say') && !el.hidden && m.oldValue !== null) sayIn(el);
  }
}).observe(d.body, { attributes: true, attributeOldValue: true, attributeFilter: ['hidden'], subtree: true });
const pausedFlag = $('[data-paused-flag]');
if (pausedFlag) watch(pausedFlag, (el) => { if (live) gsap.from(el, { y: -10, opacity: 0, duration: 0.6, ease, clearProps: 'transform,opacity' }); });

// the toast is made on first use
new MutationObserver((list) => {
  for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches('[data-undo-note]')) { watch(n, toastIn); wasHidden.set(n, true); if (!n.hidden) toastIn(n); }
}).observe(d.body, { childList: true });

// press feedback for the things a finger lands on, beyond what CSS does
if (live && fine) $$('.big-call, [data-step-next], [data-step-finish]').forEach(lean);

// ---------------------------------------------------------------- the command (Ctrl K)
const ICON = {
  today: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
  calls: '<path d="M6.6 3.5h3l1.6 4-2 1.3a11 11 0 0 0 5.9 5.9l1.3-2 4 1.6v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  robot: '<rect x="4.5" y="7.5" width="15" height="12" rx="3"/><path d="M12 7.5V4M9 13h.01M15 13h.01M9.5 16.5h5"/>',
  profile: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  out: '<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9M16 8l4 4-4 4M20 12H9"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const accountOn = () => { const a = $('#account'); return !!a && !a.hidden; };

let box = null;
let items = [];
let sel = 0;
let from = null;

function actions() {
  const go = (to, label) => ({ id: `go-${to}`, label, group: 'Go to', icon: to, run: () => { const a = $(`[data-tabs] a[data-to="${to}"]`); if (a) a.click(); } });
  const list = [go('today', 'Today'), go('calls', 'Calls'), go('calendar', 'Calendar'), go('robot', 'Your robot'), go('profile', 'Settings')];
  const pill = $('[data-line-now]');
  if (pill && !pill.hidden) {
    const paused = pill.classList.contains('paused');
    list.push({ id: 'pause', label: paused ? 'Turn answering back on' : 'Pause the line', group: 'Line', icon: 'pause', run: () => pill.click() });
  }
  list.push({ id: 'out', label: 'Sign out', group: 'Account', icon: 'out', run: () => { const b = $('[data-signout]'); if (b) b.click(); } });
  return list;
}

function build() {
  const scrimEl = d.createElement('div');
  scrimEl.className = 'cmdk-scrim';
  scrimEl.hidden = true;
  scrimEl.innerHTML = `<div class="cmdk" role="dialog" aria-modal="true" aria-label="Jump to" data-lenis-prevent>
    <div class="cmdk-in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
      <input type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" aria-label="Jump to" placeholder="Jump to a screen or an action" autocomplete="off" spellcheck="false"><kbd aria-hidden="true">Esc</kbd></div>
    <div class="cmdk-list" id="cmdk-list" role="listbox" aria-label="Results"></div></div>`;
  d.body.append(scrimEl);
  const input = $('input', scrimEl);
  input.addEventListener('input', paint);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); pick(sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pick(sel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); fire(sel); }
    else if (e.key === 'Tab') e.preventDefault();
  });
  scrimEl.addEventListener('mousedown', (e) => { if (e.target === scrimEl) closeCmd(); });
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !scrimEl.hidden) { e.stopPropagation(); closeCmd(); } }, true);
  return scrimEl;
}

function paint() {
  const q = $('input', box).value.trim().toLowerCase();
  items = actions().filter((a) => !q || a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q));
  sel = 0;
  const list = $('.cmdk-list', box);
  if (!items.length) { list.innerHTML = '<p class="cmdk-empty">Nothing matches that.</p>'; $('input', box).removeAttribute('aria-activedescendant'); return; }
  let html = '';
  let g = '';
  items.forEach((a, i) => {
    if (a.group !== g) { g = a.group; html += `<p class="cmdk-grp" role="presentation">${g}</p>`; }
    html += `<button type="button" class="cmdk-item" role="option" id="cmdk-${i}" data-i="${i}" aria-selected="${i === 0}" tabindex="-1">${svg(a.icon)}<span>${a.label}</span></button>`;
  });
  list.innerHTML = html;
  $('input', box).setAttribute('aria-activedescendant', 'cmdk-0');
  $$('.cmdk-item', list).forEach((b) => {
    b.addEventListener('click', () => fire(Number(b.dataset.i)));
    b.addEventListener('mousemove', () => pick(Number(b.dataset.i), true));
  });
}

function pick(i, keepScroll) {
  if (!items.length) return;
  sel = (i + items.length) % items.length;
  $$('.cmdk-item', box).forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.i) === sel)));
  const el = $(`#cmdk-${sel}`, box);
  $('input', box).setAttribute('aria-activedescendant', `cmdk-${sel}`);
  if (el && !keepScroll) el.scrollIntoView({ block: 'nearest' });
}

function fire(i) {
  const a = items[i];
  closeCmd(false);
  if (a) a.run();
}

function openCmd() {
  if (!accountOn() || ($('#sheet') && !$('#sheet').hidden)) return;
  if (!box) box = build();
  from = d.activeElement;
  $('input', box).value = '';
  paint();
  box.hidden = false;
  freeze(true);
  const card = $('.cmdk', box);
  if (live) {
    gsap.fromTo(box, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out', clearProps: 'opacity' });
    gsap.fromTo(card, { y: -14, scale: 0.97, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.55, ease: 'expo.out', clearProps: 'transform,opacity' });
  }
  $('input', box).focus();
}

function closeCmd(giveBack = true) {
  if (!box || box.hidden) return;
  box.hidden = true;
  freeze(false);
  if (giveBack && from && from.isConnected) from.focus();
  from = null;
}

addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (box && !box.hidden) closeCmd(); else openCmd();
  }
});
const kbar = $('[data-cmdk]');
if (kbar) {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const kbd = $('kbd', kbar);
  if (kbd) kbd.textContent = mac ? '⌘ K' : 'Ctrl K';
  kbar.addEventListener('click', openCmd);
  // shown with the app, like the tabs
  const tabsNav = $('[data-tabs]');
  const sync = () => { kbar.hidden = !accountOn(); };
  const acct = $('#account');
  if (acct) new MutationObserver(sync).observe(acct, { attributes: true, attributeFilter: ['hidden'] });
  sync();
  if (tabsNav) moveMark(true);
}

// ---------------------------------------------------------------- his name at the foot of the side menu
const who = $('[data-side-who]');
if (who) {
  const initials = (name) => String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const fill = () => {
    const me = app.me;
    const name = me && !me.mustChangePassword ? String(me.name || '').trim() : '';
    who.hidden = !accountOn() || !name;
    $('[data-side-name]', who).textContent = name;
    $('[data-side-initials]', who).textContent = initials(name);
  };
  // the account's own lines change when it is drawn: follow them
  const whoLine = $('[data-who]');
  if (whoLine) new MutationObserver(fill).observe(whoLine, { childList: true, characterData: true, subtree: true });
  const acct = $('#account');
  if (acct) new MutationObserver(fill).observe(acct, { attributes: true, attributeFilter: ['hidden'] });
  fill();
  // Sign out is Settings' own button; if it cannot sign him out, its sentence is shown there
  $('[data-side-signout]', who).addEventListener('click', () => {
    const b = $('[data-signout]');
    if (b) b.click();
  });
  const outSay = $('[data-signout-say]');
  if (outSay) new MutationObserver(() => {
    if (!outSay.hidden && outSay.textContent.trim() && accountOn() && location.hash !== '#profile') nav('#profile');
  }).observe(outSay, { attributes: true, attributeFilter: ['hidden'] });
}
