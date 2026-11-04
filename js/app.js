// app.js: boot, router, event handling, workout flow, rest timer UI,
// backup and service-worker updates.
import { state, store, initState, ctx, saveSettings, saveMeta, saveActive, newWorkout, exportData, validateBackup, importData, resetAll, staleActive, endTimeFor } from './state.js';
import { ui, viewToday, viewWorkout, viewSummary, viewLog, viewHistory, viewSession, viewPlan, swapModal, noteModal, workoutBlocks, restForBlock } from './views.js';
import { exercise } from './program.js';
import { RestTimer, unlockAudio, beep, keepAwake } from './timer.js';
import { lastPerformance } from './stats.js';
import { esc, isoDate, parseDecimal, parseIntSafe, fmtClock, fmtTime, uid, isISODate } from './util.js';

const $ = (sel) => document.querySelector(sel);
const main = $('#view');
let timer = null;
let swReg = null;
let userAskedUpdate = false;
let lastRouteKey = '';
let lastCheckTap = 0;
let lastCheckKey = '';
let restDoneUntil = 0;

/* ================================================================== */
/* Boot                                                                 */
/* ================================================================== */
async function boot() {
  try {
    await initState();
  } catch (e) {
    main.innerHTML = `<section class="card"><h2>Storage problem</h2><p>The app could not open its storage on this device. ${esc(e.message)}</p></section>`;
    return;
  }
  timer = new RestTimer({ onTick: updateRestUI, onDone: restDone });
  if (state.active && !staleActive()) {
    if (state.active.rest) timer.restore(state.active.rest.endsAt, state.active.rest.total, state.active.rest.label);
    keepAwake(true);
  }
  bindEvents();
  render();
  setInterval(clockTick, 1000);
  registerSW();
}

/* ================================================================== */
/* Router (hash based, so it works under any sub-path)                  */
/* ================================================================== */
function route() {
  const h = decodeURIComponent(location.hash.replace(/^#/, '')) || 'today';
  const [name, ...rest] = h.split('/');
  return { name, arg: rest.join('/') };
}
function go(hash) {
  if (location.hash === `#${hash}`) render();
  else location.hash = hash;
}

/** Is the live workout screen showing? (an unfinished but stale workout is not) */
const liveWorkout = () => !!state.active && !staleActive();

function render() {
  const { name, arg } = route();
  let html, tab = name, anchor = null;
  try {
  switch (name) {
    case 'summary': html = viewSummary(arg); tab = 'today'; break;
    case 'log': html = viewLog(); break;
    case 'history': html = viewHistory(); break;
    case 'session': html = viewSession(arg); tab = 'history'; break;
    case 'plan': case 'plan-backup': case 'plan-install':
      html = viewPlan(); tab = 'plan'; anchor = name === 'plan' ? null : name; break;
    default: html = liveWorkout() ? viewWorkout() : viewToday(); tab = 'today';
  }
  } catch (e) {
    // Never leave the app stuck on "Loading…": show a recovery card instead.
    console.error('render failed', e);
    html = `<header class="top"><h1>Something looks off</h1></header><section class="card" data-testid="render-error">
      <p>This screen could not be shown, probably because of unexpected data. Your other screens and data are still there.</p>
      <div class="row"><a class="btn ghost" href="#plan-backup">Backup / import</a><a class="btn ghost" href="#history">History</a></div></section>`;
  }
  const key = `${name}/${arg}/${liveWorkout() ? 'w' : ''}`;
  const y = window.scrollY;
  main.innerHTML = html;
  document.body.dataset.view = tab === 'today' && liveWorkout() && name !== 'summary' ? 'workout' : name;
  document.querySelectorAll('#tabbar a').forEach((a) => {
    const on = a.dataset.tab === tab;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const tLabel = $('#tab-today-label');
  if (tLabel) tLabel.textContent = liveWorkout() ? 'Workout' : 'Today';
  $('#tabbar a[data-tab="today"]')?.classList.toggle('live', liveWorkout());
  if (key === lastRouteKey) window.scrollTo(0, y);
  else if (anchor && document.getElementById(anchor)) document.getElementById(anchor).scrollIntoView();
  else window.scrollTo(0, 0);
  lastRouteKey = key;
  updateRestUI();
  syncKb(); // the focused field may just have been replaced
}

/* ================================================================== */
/* Small UI helpers: toast and modal                                    */
/* ================================================================== */
let toastTimer = null;
function hideToast() { clearTimeout(toastTimer); const t = $('#toast'); if (t) t.hidden = true; }
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function openModal(inner) {
  const root = $('#modal-root');
  return new Promise((resolve) => {
    root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">${inner}</div></div>`;
    root.hidden = false;
    const handler = (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) { if (e.target.classList.contains('modal-back')) close('cancel'); return; }
      e.preventDefault();
      close(b.dataset.m, b.dataset.val);
    };
    function close(action, val) {
      const extra = { text: $('#note-text')?.value, remember: $('#swap-remember')?.checked };
      root.removeEventListener('click', handler);
      root.innerHTML = ''; root.hidden = true;
      resolve({ action, val, ...extra });
    }
    root.addEventListener('click', handler);
  });
}
async function confirmModal(title, body, ok = 'OK', danger = false) {
  const r = await openModal(`<h2>${esc(title)}</h2><p>${body}</p><div class="row end"><button class="ghost" data-m="cancel">Cancel</button><button class="${danger ? 'danger-solid' : 'primary'}" data-m="ok" data-testid="modal-ok">${esc(ok)}</button></div>`);
  return r.action === 'ok';
}

/* ================================================================== */
/* Events (delegated)                                                   */
/* ================================================================== */
function bindEvents() {
  window.addEventListener('hashchange', render);
  document.addEventListener('submit', (e) => e.preventDefault());
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.closest('#modal-root')) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).catch(showError); }
  });
  document.addEventListener('change', (e) => Promise.resolve(onChange(e)).catch(showError));
  document.addEventListener('input', onInput);
  // Hide the bottom bars only while a real keyboard is up. The state is
  // recomputed from scratch on every relevant event (never just toggled),
  // because WebKit fires no focusout when a focused field is removed by a
  // re-render (QA finding 1: the tab bar vanished after picking a date).
  document.addEventListener('focusin', syncKb);
  document.addEventListener('focusout', () => setTimeout(syncKb, 80));
  document.addEventListener('change', () => setTimeout(syncKb, 0), true);
  document.addEventListener('blur', () => setTimeout(syncKb, 80), true);
  window.addEventListener('pageshow', syncKb);
  window.addEventListener('resize', syncKb);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', syncKb);
  setInterval(syncKb, 1500); // watchdog: never leave the tab bar hidden
  // Save promptly when the app goes to the background.
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.active) saveActive(); });
  window.addEventListener('pagehide', () => { if (state.active) saveActive(); });
}
// Fields that bring up a typing keyboard. Date pickers and selects don't.
const isTextInput = (el) => !!el && el.isConnected && ((el.tagName === 'INPUT' && ['text', 'search', 'email', 'tel', 'url', 'password', 'number'].includes(el.type)) || el.tagName === 'TEXTAREA');
/** Keyboard open = a text field is focused AND the visual viewport has shrunk.
 *  (window.__lsFakeKeyboard lets the automated tests simulate the keyboard.) */
function keyboardUp() {
  if (typeof window.__lsFakeKeyboard === 'boolean') return window.__lsFakeKeyboard;
  const vv = window.visualViewport;
  return vv ? vv.height < window.innerHeight - 120 : true;
}
function syncKb() {
  document.body.classList.toggle('kb', isTextInput(document.activeElement) && keyboardUp());
}
function showError(e) { console.error(e); toast('Something went wrong. Your data is safe.'); }

function formVal(form, name) { const el = form.elements[name]; return el ? el.value : ''; }
function readCardio(form, prefix) {
  const minutes = parseIntSafe(formVal(form, `${prefix}min`));
  const speed = parseDecimal(formVal(form, `${prefix}speed`));
  const incline = parseDecimal(formVal(form, `${prefix}incline`));
  if (!minutes || Number.isNaN(minutes) || minutes <= 0 || minutes > 300) { toast('Enter the minutes (1–300).'); return null; }
  if (Number.isNaN(speed) || Number.isNaN(incline)) { toast('Speed and incline must be numbers, e.g. 5,5'); return null; }
  if (speed !== null && (speed < 1 || speed > 25)) { toast('Speed should be between 1 and 25 km/h.'); return null; }
  if (incline !== null && (incline < 0 || incline > 20)) { toast('Incline should be between 0 and 20 %.'); return null; }
  return { minutes, speed: speed ?? null, incline: incline ?? null, talk: formVal(form, `${prefix}talk`) || 'talk' };
}
/** Date from a form field: must be a real date, not in the future. */
function pastDate(v) {
  const d = v || isoDate();
  if (!isISODate(d)) { toast('Pick a valid date.'); return null; }
  if (d > isoDate()) { toast('That date is in the future. Pick today or an earlier day.'); return null; }
  return d;
}
async function addCardio(entry) {
  const c = { id: uid('c'), createdAt: Date.now(), date: isoDate(), type: 'Incline walk', ...entry };
  state.cardio.push(c);
  await store.put('cardio', c);
  return c;
}
function talkNote(t) { return t === 'no' ? ' That was above talking pace: ease off a little next time.' : ''; }

const actions = {
  /* ---------- Today ---------- */
  'dismiss-tip': async () => { state.meta.installTipDismissed = true; await saveMeta(); render(); },
  'start-today': async () => { state.settings.startDate = isoDate(); await saveSettings(); render(); toast('Week 1 starts today. Easy does it.'); },
  'deload-off': async () => { const c = ctx(); state.settings.deloadOverrides[c.w] = false; await saveSettings(); render(); },
  'deload-toggle': async () => { const c = ctx(); state.settings.deloadOverrides[c.w] = !c.deload; await saveSettings(); render(); },
  pick: (el) => { ui.pickDay = el.dataset.day; render(); },
  mode: (el) => { ui.mode = el.dataset.mode; render(); },
  'walk-toggle': () => { ui.walkOpen = !ui.walkOpen; render(); },
  talk: (el) => {
    const seg = el.closest('.seg');
    seg.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === el); b.setAttribute('aria-pressed', String(b === el)); });
    seg.querySelector('input[type=hidden]').value = el.dataset.val;
  },
  'walk-save': async (el) => {
    const v = readCardio(el.closest('form'), 'w-');
    if (!v) return;
    await addCardio({ kind: 'am-walk', ...v });
    ui.walkOpen = false; render(); toast(`Morning walk saved: ${v.minutes} min.${talkNote(v.talk)}`);
  },
  start: async (el) => {
    unlockAudio(state.settings.soundOverSilent); // must run inside the tap
    state.active = newWorkout(el.dataset.day, ui.mode || state.settings.dayMode);
    ui.pickDay = null;
    await saveActive();
    keepAwake(true);
    go('today');
  },

  /* ---------- Workout ---------- */
  warmup: async () => { state.active.warmupDone = !state.active.warmupDone; await saveActive(); render(); },
  check: async (el) => {
    const A = state.active; const i = +el.dataset.ex, j = +el.dataset.set;
    const e = A.exercises[i], st = e.sets[j];
    // Debounce: a second tap on the same set within 700 ms (double tap,
    // sweaty finger) is ignored. Different sets can be ticked quickly.
    const now = Date.now(), key = `${i}-${j}`;
    if (key === lastCheckKey && now - lastCheckTap < 700) return;
    lastCheckTap = now; lastCheckKey = key;
    unlockAudio(state.settings.soundOverSilent);
    if (st.done) {
      // Unticking is deliberate: it needs a confirmation.
      const ok = await confirmModal(`Undo set ${j + 1}?`, `${esc(e.nameEn)}: the set goes back to not done. The numbers stay filled in.`, 'Undo set');
      lastCheckTap = Date.now();
      if (!ok) return;
      st.done = false; st.at = null; await saveActive(); render(); return;
    }
    if (!st.reps || st.reps <= 0) { toast('Enter the reps first.'); main.querySelector(`input.reps[data-ex="${i}"][data-set="${j}"]`)?.focus(); return; }
    st.done = true; st.at = Date.now();
    // Carry this set's numbers into later empty sets (saves typing).
    e.sets.slice(j + 1).forEach((n) => { if (!n.done) { if (n.kg == null) n.kg = st.kg; if (n.reps == null) n.reps = st.reps; } });
    // Rest starts when every exercise of the block (superset) has done this round.
    const block = workoutBlocks(A).find((b) => b.idx.includes(i));
    const members = block.idx.map((k) => A.exercises[k]).filter((x) => !x.skipped);
    const roundDone = members.every((m) => m.sets.length <= j || m.sets[j].done);
    const anyLeft = A.exercises.some((x) => !x.skipped && x.sets.some((s) => !s.done));
    if (roundDone && anyLeft) {
      hideToast(); // e.g. a stale "Now A2…" hint
      const secs = restForBlock(A, block.idx);
      startRest(secs, nextLabel(A));
    } else if (!roundDone) {
      const nxt = members.find((m) => m.sets.length > j && !m.sets[j].done);
      toast(`Now ${nxt.nameEn}, then rest.`);
    }
    await saveActive();
    render();
  },
  apply: async (el) => {
    const e = state.active.exercises[+el.dataset.ex];
    const add = Number(el.dataset.kg);
    e.sets.forEach((s) => { if (!s.done && typeof s.kg === 'number') s.kg = Math.round((s.kg + add) * 100) / 100; });
    e.applied = true; // only once per exercise
    await saveActive(); render();
  },
  swap: async (el) => {
    const i = +el.dataset.ex; const e = state.active.exercises[i];
    const r = await openModal(swapModal(i));
    if (r.action !== 'swap' || !r.val) return;
    if (r.val !== e.exId && e.sets.some((s) => s.done)) {
      if (!(await confirmModal('Swap exercise?', 'The sets you already ticked for this exercise will be cleared.', 'Swap'))) return;
    }
    applySwap(e, r.val);
    if (r.remember) {
      if (r.val === e.baseExId) delete state.settings.swaps[e.slotId];
      else state.settings.swaps[e.slotId] = { exId: r.val, since: isoDate() };
      await saveSettings();
    }
    await saveActive(); render();
  },
  note: async (el) => {
    const i = +el.dataset.ex;
    const r = await openModal(noteModal(i));
    if (r.action !== 'ok') return;
    state.active.exercises[i].note = (r.text || '').trim().slice(0, 500);
    await saveActive(); render();
  },
  skip: async (el) => { state.active.exercises[+el.dataset.ex].skipped = true; await saveActive(); render(); },
  unskip: async (el) => { state.active.exercises[+el.dataset.ex].skipped = false; await saveActive(); render(); },
  'rest-add': async () => { timer.add(30); persistRest(); },
  'rest-skip': async () => { timer.stop(); restDoneUntil = 0; persistRest(); updateRestUI(); },
  finish: async () => {
    const A = state.active;
    const left = A.exercises.reduce((a, e) => a + (e.skipped ? 0 : e.sets.filter((s) => !s.done).length), 0);
    if (left && !(await confirmModal('Finish workout?', `${left} set${left === 1 ? ' is' : 's are'} not ticked. They won’t be saved.`, 'Finish'))) return;
    await saveFinished(A);
  },
  'stale-save': async () => {
    const A = staleActive();
    if (!A) { render(); return; }
    await saveFinished(A, false);
    toast('Saved as finished.');
    go('today');
  },
  discard: async () => {
    if (!(await confirmModal('Discard this workout?', 'Nothing from this session will be saved.', 'Discard', true))) return;
    timer.stop(); state.active = null; await saveActive(); keepAwake(false); render();
  },
  'finisher-save': async (el) => {
    const v = readCardio(el.closest('form'), 'f-');
    if (!v) return;
    const S = state.sessions.find((s) => s.id === el.dataset.id);
    await addCardio({ kind: 'finisher', sessionId: S.id, date: S.date, ...v });
    toast(`Finisher saved: ${v.minutes} min.${talkNote(v.talk)}`);
    go('today');
  },
  'finisher-skip': () => go('today'),

  /* ---------- Log ---------- */
  'cardio-save': async (el) => {
    const f = el.closest('form');
    const v = readCardio(f, 'c-');
    if (!v) return;
    const date = pastDate(formVal(f, 'c-date'));
    if (!date) return;
    await addCardio({ kind: formVal(f, 'c-kind'), type: formVal(f, 'c-type'), date, ...v });
    render(); toast(`Cardio saved.${talkNote(v.talk)}`);
  },
  'weight-save': async (el) => {
    const f = el.closest('form');
    const kg = parseDecimal(formVal(f, 'bw-kg'));
    if (!kg || Number.isNaN(kg) || kg < 30 || kg > 300) { toast('Enter your weight in kg, e.g. 80,4'); return; }
    const date = pastDate(formVal(f, 'bw-date'));
    if (!date) return;
    await putBody(date, { weightKg: Math.round(kg * 100) / 100 });
    render(); toast('Weight saved.');
  },
  'waist-save': async (el) => {
    const f = el.closest('form');
    const cm = parseDecimal(formVal(f, 'w-cm'));
    if (!cm || Number.isNaN(cm) || cm < 40 || cm > 250) { toast('Enter your waist in cm, e.g. 88,5'); return; }
    const date = pastDate(formVal(f, 'w-date'));
    if (!date) return;
    await putBody(date, { waistCm: Math.round(cm * 10) / 10 });
    render(); toast('Waist saved.');
  },
  'del-cardio': async (el) => { state.cardio = state.cardio.filter((c) => c.id !== el.dataset.id); await store.delete('cardio', el.dataset.id); render(); },
  'del-weight': async (el) => { await clearBodyField(el.dataset.date, 'weightKg'); render(); },
  'del-waist': async (el) => { await clearBodyField(el.dataset.date, 'waistCm'); render(); },
  'del-session': async (el) => {
    if (!(await confirmModal('Delete this workout?', 'It will be removed from your history.', 'Delete', true))) return;
    state.sessions = state.sessions.filter((s) => s.id !== el.dataset.id);
    await store.delete('sessions', el.dataset.id);
    go('history');
  },

  /* ---------- Plan ---------- */
  set: async (el) => { state.settings[el.dataset.key] = el.dataset.val; if (el.dataset.key === 'dayMode') ui.mode = null; await saveSettings(); render(); },
  export: async () => exportBackup(),
  reset: async () => {
    if (!(await confirmModal('Reset all data?', 'This erases every workout, cardio entry, weight and setting on this phone.', 'Continue', true))) return;
    if (!(await confirmModal('Are you completely sure?', 'This cannot be undone. Export a backup first if you might want it back.', 'Erase everything', true))) return;
    timer.stop(); keepAwake(false);
    await resetAll();
    ui.pickDay = null; ui.mode = null;
    go('today'); toast('All data erased.');
  },
  'check-update': async () => {
    if (!swReg) { toast('Updates need the app to be online once.'); return; }
    try { await swReg.update(); } catch { toast('Offline: try again later.'); return; }
    if (swReg.waiting || swReg.installing) showUpdateBanner(); else toast('You have the latest version.');
  },
  update: () => {
    userAskedUpdate = true;
    if (swReg && swReg.waiting) swReg.waiting.postMessage({ type: 'SKIP_WAITING' });
    else location.reload();
  },
};

/** Store a workout as finished. The end time is "now", or for a stale
 *  workout the last ticked set plus its rest (capped, see endTimeFor). */
async function saveFinished(A, showSummary = true) {
  timer.stop();
  const S = { ...A, finishedAt: endTimeFor(A) };
  delete S.rest;
  state.sessions.push(S);
  await store.put('sessions', S);
  state.active = null;
  await saveActive();
  keepAwake(false);
  if (showSummary) go(`summary/${S.id}`);
}

function applySwap(e, exId) {
  const x = exercise(exId);
  const last = lastPerformance(state.sessions, exId);
  Object.assign(e, { exId, nameEn: x.nameEn, nameEs: x.nameEs, muscles: x.muscles, equipment: x.equipment, perSide: !!x.perSide });
  e.sets = e.sets.map((_, i) => {
    const ls = last ? last.sets[Math.min(i, last.sets.length - 1)] : null;
    return { kg: ls ? ls.kg : null, reps: ls ? ls.reps : null, done: false, at: null };
  });
}

async function putBody(date, fields) {
  let rec = state.body.find((b) => b.date === date);
  if (!rec) { rec = { date }; state.body.push(rec); }
  Object.assign(rec, fields);
  await store.put('body', rec);
}
async function clearBodyField(date, field) {
  const rec = state.body.find((b) => b.date === date);
  if (!rec) return;
  delete rec[field];
  if (rec.weightKg === undefined && rec.waistCm === undefined) {
    state.body = state.body.filter((b) => b !== rec);
    await store.delete('body', date);
  } else await store.put('body', rec);
}

/* ---------- change / input ---------- */
async function onChange(e) {
  const t = e.target;
  if (t.dataset.actChange === 'pick') { ui.pickDay = t.value; render(); return; }
  if (t.dataset.actChange === 'import') { await importBackup(t); return; }
  const s = state.settings;
  if (t.dataset.setting) {
    const k = t.dataset.setting;
    let v = t.value;
    if (k === 'startDate') { v = v || null; if (v && !isISODate(v)) { toast('Pick a valid date.'); render(); return; } }
    if (k === 'deloadEvery') v = Number(v);
    if (k === 'programId') ui.pickDay = null;
    s[k] = v;
  } else if (t.dataset.settingBool) {
    s[t.dataset.settingBool] = t.checked;
  } else if (t.dataset.sched !== undefined) {
    s.schedule[s.programId][Number(t.dataset.sched)] = t.value || null;
  } else if (t.dataset.inc) {
    const v = parseDecimal(t.value);
    if (v && !Number.isNaN(v) && v > 0 && v <= 50) s.increments[t.dataset.inc] = v; else { toast('Use a step like 2,5'); render(); return; }
  } else if (t.dataset.rest) {
    const v = parseIntSafe(t.value);
    s.restOverride[t.dataset.rest] = v && !Number.isNaN(v) ? Math.max(60, v) : null;
  } else return;
  await saveSettings();
  render();
}

let saveTimer = null;
function onInput(e) {
  const t = e.target;
  if (!t.dataset.field || !state.active) return;
  const st = state.active.exercises[+t.dataset.ex].sets[+t.dataset.set];
  const v = t.dataset.field === 'kg' ? parseDecimal(t.value) : parseIntSafe(t.value);
  const bad = Number.isNaN(v) || (v !== null && v < 0);
  t.classList.toggle('bad', bad);
  if (bad) return;
  st[t.dataset.field] = v;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveActive, 300);
}

/* ================================================================== */
/* Rest timer UI                                                        */
/* ================================================================== */
function nextLabel(A) {
  for (const e of A.exercises) {
    if (e.skipped) continue;
    const k = e.sets.findIndex((s) => !s.done);
    if (k >= 0) return `Next: ${e.nameEn}, set ${k + 1}`;
  }
  return '';
}
function startRest(secs, label) {
  restDoneUntil = 0;
  document.body.classList.remove('flash');
  timer.start(secs, label);
  persistRest();
}
function persistRest() {
  if (!state.active) return;
  state.active.rest = timer.running ? { endsAt: timer.endsAt, total: timer.total, label: timer.label } : null;
  saveActive();
}
function updateRestUI() {
  const bar = $('#restbar'); const mini = $('#mini-rest');
  if (!bar || !timer) return;
  if (timer.running) {
    const rem = timer.remainingMs();
    bar.hidden = false; bar.classList.remove('done');
    $('#rb-time').textContent = fmtClock(rem);
    $('#rb-label').textContent = timer.label || 'Rest';
    $('#rb-fill').style.width = `${Math.max(0, Math.min(100, (rem / (timer.total * 1000)) * 100))}%`;
    if (mini) { mini.hidden = false; mini.textContent = `Rest ${fmtClock(rem)}`; }
  } else if (Date.now() < restDoneUntil && state.active) {
    bar.hidden = false; bar.classList.add('done');
    $('#rb-time').textContent = 'Go';
    $('#rb-label').textContent = 'Rest over. Next set when ready.';
    $('#rb-fill').style.width = '0%';
    if (mini) mini.hidden = true;
  } else {
    bar.hidden = true;
    if (mini) mini.hidden = true;
  }
}
function restDone() {
  if (state.settings.sound) beep();
  document.body.classList.add('flash');
  restDoneUntil = Date.now() + 4000;
  setTimeout(() => { document.body.classList.remove('flash'); updateRestUI(); }, 4000);
  if (state.active) { state.active.rest = null; saveActive(); }
  updateRestUI();
}
function clockTick() {
  if (!state.active) return;
  if (staleActive() && document.body.dataset.view === 'workout') { timer.stop(); keepAwake(false); render(); return; }
  const el = $('#wk-clock');
  if (el) el.textContent = fmtClock(Date.now() - state.active.startedAt);
}

/* ================================================================== */
/* Backup                                                               */
/* ================================================================== */
async function exportBackup() {
  const json = JSON.stringify(exportData(), null, 1);
  const name = `lean-split-backup-${isoDate()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  let shared = false;
  if (navigator.canShare && navigator.share) {
    try {
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Lean Split backup' }); shared = true; }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // user closed the share sheet
    }
  }
  if (!shared) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  state.meta.lastBackupAt = isoDate();
  await saveMeta();
  render();
  toast('Backup exported. Keep it in Files or iCloud Drive.');
}

async function importBackup(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch { toast('That file is not valid JSON.'); return; }
  const v = validateBackup(data);
  if (!v.ok) { toast(v.error); return; }
  const when = data.exportedAt ? data.exportedAt.slice(0, 10) : 'unknown date';
  const ok = await confirmModal('Restore this backup?', `Backup from <b>${esc(when)}</b>: ${v.counts.sessions} workouts, ${v.counts.cardio} cardio entries, ${v.counts.body} body entries.<br>This <b>replaces</b> everything currently on this phone.`, 'Restore');
  if (!ok) return;
  timer.stop();
  await importData(data);
  if (state.active && state.active.rest && !staleActive()) timer.restore(state.active.rest.endsAt, state.active.rest.total, state.active.rest.label);
  ui.pickDay = null; ui.mode = null;
  render(); toast('Backup restored.');
}

/* ================================================================== */
/* Service worker: offline + "Update available" banner                  */
/* ================================================================== */
function showUpdateBanner() { $('#update-banner').hidden = false; }
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (e) { console.warn('Service worker not registered:', e && e.message); return; }
  if (swReg.waiting && navigator.serviceWorker.controller) showUpdateBanner();
  swReg.addEventListener('updatefound', () => {
    const w = swReg.installing;
    if (!w) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (userAskedUpdate) location.reload(); });
  // Check for a new version whenever the app comes back to the foreground.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') swReg.update().catch(() => {}); });
}

// Exposed for automated tests only (no personal data involved).
window.__leanSplit = { state, fmtTime };

boot();
