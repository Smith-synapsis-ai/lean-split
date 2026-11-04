// state.js: in-memory app state, persistence and backup (export/import).
import { openStore, SCHEMA_VERSION, requestPersist } from './store.js';
import { PROGRAMS, EQUIPMENT, programWeek, isDeload, getDay, exercise, rirFor, setsFor, slotsFor, estimate, blockRest, isDayId, isExerciseId } from './program.js';
import { isoDate, addDays, daysBetween, isISODate } from './util.js';
import { lastPerformance, lastActivity, isStale, MAX_SESSION_MIN } from './stats.js';
import { APP_VERSION } from './version.js';

export const DEFAULT_SETTINGS = {
  startDate: null,              // program week 1 starts here
  programId: 'four',            // 'four' (upper/lower) or 'three' (full body)
  scheduleMode: 'fixed',        // 'fixed' weekdays or 'rotation'
  schedule: { four: [...PROGRAMS.four.schedule], three: [...PROGRAMS.three.schedule] },
  dayMode: 'full',              // default Full or Short (labels show the computed estimate)
  deloadEvery: 7,               // suggest a deload in week 7, 14, …
  deloadOverrides: {},          // { [week]: true|false } manual on/off
  increments: { barbell: 2.5, dumbbell: 2, machine: 5, cable: 2.5, bodyweight: 2.5, assisted: 5 },
  restOverride: { M: null, C: null, I: null },
  sound: true,
  soundOverSilent: false,
  swaps: {},                    // { [slotId]: { exId, since } } remembered ~6 weeks
};
const SWAP_DAYS = 42;

export const state = {
  settings: structuredClone(DEFAULT_SETTINGS),
  sessions: [], cardio: [], body: [],
  active: null,                 // the unfinished workout (survives reloads)
  meta: { lastBackupAt: null, installTipDismissed: false, persisted: null, storeKind: null },
};
export let store = null;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isInt = (v, lo, hi) => isNum(v, lo, hi) && Number.isInteger(v);
const optStr = (v, max = 1000) => v === undefined || v === null || (typeof v === 'string' && v.length <= max);

/** First problem in a settings object, or null. Used to reject bad backups. */
function settingsError(x) {
  if (x === undefined || x === null) return null;
  if (!isObj(x)) return 'The settings in the backup are damaged.';
  if (x.startDate !== undefined && x.startDate !== null && !isISODate(x.startDate)) return 'The program start date in the backup is not a date.';
  if (x.programId !== undefined && !PROGRAMS[x.programId]) return 'The backup uses an unknown program.';
  if (x.scheduleMode !== undefined && !['fixed', 'rotation'].includes(x.scheduleMode)) return 'The schedule mode in the backup is invalid.';
  if (x.dayMode !== undefined && !['full', 'short'].includes(x.dayMode)) return 'The day length in the backup is invalid.';
  if (x.deloadEvery !== undefined && !isInt(Number(x.deloadEvery), 2, 12)) return 'The deload interval in the backup is invalid.';
  if (x.schedule !== undefined) {
    if (!isObj(x.schedule)) return 'The weekly schedule in the backup is damaged.';
    for (const [pid, arr] of Object.entries(x.schedule)) {
      if (!PROGRAMS[pid]) return 'The weekly schedule mentions an unknown program.';
      if (!Array.isArray(arr) || arr.length !== 7 || !arr.every((v) => v === null || v === '' || PROGRAMS[pid].rotation.includes(v))) return 'The weekly schedule in the backup is damaged.';
    }
  }
  if (x.deloadOverrides !== undefined && (!isObj(x.deloadOverrides) || !Object.entries(x.deloadOverrides).every(([k, v]) => /^\d+$/.test(k) && typeof v === 'boolean'))) return 'The deload settings in the backup are damaged.';
  if (x.increments !== undefined && (!isObj(x.increments) || !Object.entries(x.increments).every(([k, v]) => EQUIPMENT[k] && isNum(v, 0.01, 50)))) return 'The weight steps in the backup are invalid.';
  if (x.restOverride !== undefined && (!isObj(x.restOverride) || !Object.entries(x.restOverride).every(([k, v]) => ['M', 'C', 'I'].includes(k) && (v === null || isNum(v, 60, 900))))) return 'The rest times in the backup are invalid.';
  for (const k of ['sound', 'soundOverSilent']) if (x[k] !== undefined && typeof x[k] !== 'boolean') return 'The sound settings in the backup are invalid.';
  if (x.swaps !== undefined) {
    if (!isObj(x.swaps)) return 'The exercise swaps in the backup are damaged.';
    for (const v of Object.values(x.swaps)) if (!isObj(v) || !isExerciseId(v.exId) || !isISODate(v.since)) return 'The backup swaps to an exercise this app does not know.';
  }
  return null;
}

/** Settings merged over defaults; anything invalid falls back to the default. Never throws. */
function cleanSettings(x) {
  const d = structuredClone(DEFAULT_SETTINGS);
  if (!isObj(x)) return d;
  if (x.startDate === null || isISODate(x.startDate)) d.startDate = x.startDate;
  if (PROGRAMS[x.programId]) d.programId = x.programId;
  if (['fixed', 'rotation'].includes(x.scheduleMode)) d.scheduleMode = x.scheduleMode;
  if (['full', 'short'].includes(x.dayMode)) d.dayMode = x.dayMode;
  if (isInt(Number(x.deloadEvery), 2, 12)) d.deloadEvery = Number(x.deloadEvery);
  if (isObj(x.schedule)) for (const pid of Object.keys(PROGRAMS)) {
    const arr = x.schedule[pid];
    if (Array.isArray(arr) && arr.length === 7 && arr.every((v) => v === null || v === '' || PROGRAMS[pid].rotation.includes(v))) d.schedule[pid] = arr.map((v) => v || null);
  }
  if (isObj(x.deloadOverrides)) for (const [k, v] of Object.entries(x.deloadOverrides)) if (/^\d+$/.test(k) && typeof v === 'boolean') d.deloadOverrides[k] = v;
  if (isObj(x.increments)) for (const [k, v] of Object.entries(x.increments)) if (EQUIPMENT[k] && isNum(v, 0.01, 50)) d.increments[k] = v;
  if (isObj(x.restOverride)) for (const k of ['M', 'C', 'I']) if (isNum(x.restOverride[k], 60, 900)) d.restOverride[k] = x.restOverride[k];
  for (const k of ['sound', 'soundOverSilent']) if (typeof x[k] === 'boolean') d[k] = x[k];
  if (isObj(x.swaps)) for (const [k, v] of Object.entries(x.swaps)) if (isObj(v) && isExerciseId(v.exId) && isISODate(v.since)) d.swaps[k] = { exId: v.exId, since: v.since };
  return d;
}

/** First problem in a workout (finished session or the active one), or null. */
function workoutError(w, finished) {
  if (!isObj(w)) return 'is damaged';
  if (typeof w.id !== 'string' || !w.id || w.id.length > 120) return 'has no valid id';
  if (!isISODate(w.date)) return 'has no valid date';
  if (!isNum(w.startedAt, 1, 1e14)) return 'has no valid start time';
  if (finished && !(isNum(w.finishedAt, 1, 1e14) && w.finishedAt >= w.startedAt)) return 'has no valid end time';
  if (!finished && w.finishedAt !== undefined && w.finishedAt !== null) return 'is marked both active and finished';
  if (!isDayId(w.dayId)) return 'uses an unknown training day';
  if (w.mode !== undefined && !['full', 'short'].includes(w.mode)) return 'has an invalid day length';
  if (w.week !== undefined && !isInt(w.week, 0, 1000)) return 'has an invalid program week';
  if (!Array.isArray(w.exercises) || w.exercises.length > 40) return 'has no exercise list';
  for (const e of w.exercises) {
    if (!isObj(e) || !isExerciseId(e.exId)) return 'contains an exercise this app does not know';
    if (e.baseExId !== undefined && !isExerciseId(e.baseExId)) return 'contains an exercise this app does not know';
    if (!Array.isArray(e.sets) || e.sets.length > 20) return 'has an exercise without a set list';
    for (const st of e.sets) {
      if (!isObj(st)) return 'has an empty set';
      if (!(st.kg === null || st.kg === undefined || isNum(st.kg, 0, 1000))) return 'has a set with an invalid weight';
      if (!(st.reps === null || st.reps === undefined || isInt(st.reps, 0, 1000))) return 'has a set with invalid reps';
      if (typeof st.done !== 'boolean') return 'has a set without a done flag';
    }
    if (e.reps !== undefined && !(Array.isArray(e.reps) && e.reps.length === 2 && isInt(e.reps[0], 1, 100) && isInt(e.reps[1], e.reps[0], 100))) return 'has an invalid rep range';
    if (!optStr(e.note) || !optStr(e.nameEn, 200)) return 'has an invalid note';
  }
  if (!finished && w.rest !== undefined && w.rest !== null && !(isObj(w.rest) && isNum(w.rest.endsAt, 0, 1e14) && isNum(w.rest.total, 0, 3600))) return 'has a damaged rest timer';
  return null;
}
function cardioError(c) {
  if (!isObj(c) || typeof c.id !== 'string' || !c.id) return 'has no valid id';
  if (!isISODate(c.date)) return 'has no valid date';
  if (!isNum(c.minutes, 1, 300)) return 'has invalid minutes';
  if (!(c.speed === null || c.speed === undefined || isNum(c.speed, 0, 30))) return 'has an invalid speed';
  if (!(c.incline === null || c.incline === undefined || isNum(c.incline, -10, 30))) return 'has an invalid incline';
  if (c.kind !== undefined && !['am-walk', 'finisher', 'other'].includes(c.kind)) return 'has an invalid type';
  if (c.talk !== undefined && !['talk', 'phrases', 'no'].includes(c.talk)) return 'has an invalid talk test';
  if (!optStr(c.type, 50)) return 'has an invalid type';
  return null;
}
function bodyError(b) {
  if (!isObj(b) || !isISODate(b.date)) return 'has no valid date';
  if (b.weightKg !== undefined && !isNum(b.weightKg, 30, 300)) return 'has an invalid weight';
  if (b.waistCm !== undefined && !isNum(b.waistCm, 40, 250)) return 'has an invalid waist';
  if (b.weightKg === undefined && b.waistCm === undefined) return 'is empty';
  return null;
}

/** Fill display fields from the catalogue so screens never see undefined. */
function normalizeWorkout(w) {
  const day = getDay(w.dayId);
  w.dayName = typeof w.dayName === 'string' ? w.dayName : day.name;
  w.dayNameEs = typeof w.dayNameEs === 'string' ? w.dayNameEs : day.nameEs;
  w.leg = typeof w.leg === 'boolean' ? w.leg : day.leg;
  w.mode = w.mode === 'short' ? 'short' : 'full';
  w.week = Number.isInteger(w.week) ? w.week : 1;
  w.deload = w.deload === true;
  for (const e of w.exercises) {
    const x = exercise(e.exId);
    e.baseExId = isExerciseId(e.baseExId) ? e.baseExId : e.exId;
    if (typeof e.nameEn !== 'string') e.nameEn = x.nameEn;
    if (typeof e.nameEs !== 'string') e.nameEs = x.nameEs;
    if (!Array.isArray(e.muscles)) e.muscles = x.muscles;
    if (!EQUIPMENT[e.equipment]) e.equipment = x.equipment;
    if (!['M', 'C', 'I'].includes(e.kind)) e.kind = 'C';
    if (!Array.isArray(e.reps)) e.reps = [8, 12];
    if (typeof e.rir !== 'string') e.rir = '2–3';
    if (!isNum(e.restSec, 30, 900)) e.restSec = 90;
    if (typeof e.group !== 'string') e.group = null;
    e.skipped = e.skipped === true;
    e.note = typeof e.note === 'string' ? e.note : '';
    e.sets = e.sets.map((st) => ({ kg: isNum(st.kg, 0, 1000) ? st.kg : null, reps: isInt(st.reps, 0, 1000) ? st.reps : null, done: st.done, at: isNum(st.at, 0, 1e14) ? st.at : null }));
  }
  return w;
}

export async function initState() {
  store = await openStore();
  const [settings, meta, active, schema, sessions, cardio, body] = await Promise.all([
    store.get('kv', 'settings'), store.get('kv', 'meta'), store.get('kv', 'active'), store.get('kv', 'schemaVersion'),
    store.getAll('sessions'), store.getAll('cardio'), store.getAll('body'),
  ]);
  // Defensive load: anything malformed is ignored in memory (left untouched on disk).
  state.settings = cleanSettings(settings);
  state.meta = { ...state.meta, ...(isObj(meta) ? meta : {}) };
  state.active = active && !workoutError(active, false) ? normalizeWorkout(active) : null;
  state.sessions = (sessions || []).filter((x) => !workoutError(x, true)).map(normalizeWorkout);
  state.cardio = (cardio || []).filter((x) => !cardioError(x));
  state.body = (body || []).filter((x) => !bodyError(x));
  if (!schema) await store.put('kv', SCHEMA_VERSION, 'schemaVersion');
  state.meta.storeKind = store.kind;
  state.meta.persisted = await requestPersist();
  await saveMeta();
}

export const saveSettings = () => store.put('kv', state.settings, 'settings');
export const saveMeta = () => store.put('kv', state.meta, 'meta');
export const saveActive = () => store.put('kv', state.active, 'active');

/* ---------------- Context: today, program week, deload ---------------- */
export function ctx(today = isoDate()) {
  const week = programWeek(state.settings.startDate, today);
  const w = Math.max(1, week);
  return { today, week, w, deload: isDeload(state.settings, w), program: PROGRAMS[state.settings.programId] };
}

export function estimateFor(dayId, mode, c = ctx()) {
  return estimate(getDay(dayId), { mode, week: c.w, deload: c.deload, restOverride: state.settings.restOverride });
}

/* ---------------- Building a workout ---------------- */
export function swappedExId(slot, today) {
  const sw = state.settings.swaps[slot.slotId];
  if (sw && isExerciseId(sw.exId) && isISODate(sw.since) && daysBetween(sw.since, today) <= SWAP_DAYS) return sw.exId;
  return slot.id;
}

/** Swap choices for a workout entry: the planned exercise plus its slot's alternatives. */
export function swapOptions(e) {
  const base = isExerciseId(e.baseExId) ? e.baseExId : e.exId;
  const subs = Array.isArray(e.subs) ? e.subs : (exercise(base)?.subs || []);
  return [base, ...subs].filter((v, i, a) => isExerciseId(v) && a.indexOf(v) === i);
}

/** One exercise entry of a session, with sets prefilled from last time. */
export function makeExercise(slot, exId, c) {
  const ex = exercise(exId);
  const n = setsFor(slot, c.w, c.deload);
  const last = lastPerformance(state.sessions, exId);
  const sets = Array.from({ length: n }, (_, i) => {
    const ls = last ? last.sets[Math.min(i, last.sets.length - 1)] : null;
    return { kg: ls ? ls.kg : null, reps: ls ? ls.reps : null, done: false, at: null };
  });
  return {
    slotId: slot.slotId, baseExId: slot.id, exId, subs: slot.subs,
    nameEn: ex.nameEn, nameEs: ex.nameEs, muscles: ex.muscles, equipment: ex.equipment, perSide: !!ex.perSide,
    kind: slot.kind, tier: slot.tier, reps: slot.reps, restSec: slot.restSec, group: slot.group, rampUp: slot.rampUp,
    rir: rirFor(slot.kind, c.w, c.deload), sets, skipped: false, note: '',
  };
}

export function newWorkout(dayId, mode) {
  const c = ctx();
  const day = getDay(dayId);
  const exercises = slotsFor(day, mode).map((sl) => makeExercise(sl, swappedExId(sl, c.today), c));
  return {
    id: `s-${Date.now().toString(36)}`, programId: state.settings.programId, dayId, dayName: day.name, dayNameEs: day.nameEs,
    leg: day.leg, mode, week: c.w, deload: c.deload, date: c.today, startedAt: Date.now(), finishedAt: null,
    estimateMin: estimateFor(dayId, mode, c).total, warmupDone: false, exercises, rest: null,
  };
}

/* ---------------- Finishing and stale workouts ---------------- */
/** Indices of the block (superset) that exercise i belongs to. */
export function blockIndices(A, i) {
  const g = A.exercises[i].group;
  if (!g) return [i];
  let a = i, b = i;
  while (a > 0 && A.exercises[a - 1].group === g) a--;
  while (b < A.exercises.length - 1 && A.exercises[b + 1].group === g) b++;
  return Array.from({ length: b - a + 1 }, (_, k) => a + k);
}
export function blockRestFor(A, idx) {
  const items = idx.map((i) => A.exercises[i]).filter((e) => !e.skipped);
  return blockRest(items.length ? items : idx.map((i) => A.exercises[i]), state.settings.restOverride);
}
export function staleActive(now = Date.now()) {
  return state.active && isStale(state.active, isoDate(new Date(now)), now) ? state.active : null;
}
/**
 * End time for a workout. Normally "now"; for a stale one, the last ticked
 * set plus its rest (never "now"). Always capped at MAX_SESSION_MIN.
 */
export function endTimeFor(A, now = Date.now()) {
  let end = now;
  if (isStale(A, isoDate(new Date(now)), now)) {
    const last = lastActivity(A);
    let rest = 0;
    A.exercises.forEach((e, i) => { if (e.sets.some((st) => st.done && st.at === last)) rest = blockRestFor(A, blockIndices(A, i)); });
    end = last + rest * 1000;
  }
  return Math.max(A.startedAt, Math.min(end, A.startedAt + MAX_SESSION_MIN * 60000));
}

/* ---------------- Backup ---------------- */
export function exportData() {
  return {
    app: 'lean-split', schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
    settings: state.settings, sessions: state.sessions, cardio: state.cardio, body: state.body, active: state.active,
  };
}

/** Validate an imported backup deeply. Returns { ok, error, counts }. */
export function validateBackup(d) {
  const fail = (error) => ({ ok: false, error });
  if (!isObj(d)) return fail('This is not a Lean Split backup (not a JSON object).');
  if (d.app !== 'lean-split') return fail('This file is not a Lean Split backup.');
  if (typeof d.schemaVersion !== 'number') return fail('The backup has no schema version.');
  if (d.schemaVersion > SCHEMA_VERSION) return fail('This backup comes from a newer app version. Update the app first.');
  for (const k of ['sessions', 'cardio', 'body']) if (!Array.isArray(d[k])) return fail(`The backup is missing "${k}".`);
  const se = settingsError(d.settings);
  if (se) return fail(se);
  for (let i = 0; i < d.sessions.length; i++) { const e = workoutError(d.sessions[i], true); if (e) return fail(`Workout ${i + 1} in the backup ${e}.`); }
  if (d.active !== undefined && d.active !== null) { const e = workoutError(d.active, false); if (e) return fail(`The unfinished workout in the backup ${e}.`); }
  for (let i = 0; i < d.cardio.length; i++) { const e = cardioError(d.cardio[i]); if (e) return fail(`Cardio entry ${i + 1} in the backup ${e}.`); }
  for (let i = 0; i < d.body.length; i++) { const e = bodyError(d.body[i]); if (e) return fail(`Body entry ${i + 1} in the backup ${e}.`); }
  return { ok: true, counts: { sessions: d.sessions.length, cardio: d.cardio.length, body: d.body.length } };
}

/** Replace everything on this device with the backup (already validated). */
export async function importData(d) {
  state.settings = cleanSettings(d.settings);
  state.sessions = d.sessions.map(normalizeWorkout); state.cardio = d.cardio; state.body = d.body;
  state.active = d.active ? normalizeWorkout(d.active) : null;
  await Promise.all([
    store.replaceAll('sessions', state.sessions), store.replaceAll('cardio', state.cardio), store.replaceAll('body', state.body),
    saveSettings(), saveActive(),
  ]);
}

export async function resetAll() {
  for (const s of ['sessions', 'cardio', 'body', 'kv']) await store.clear(s);
  state.settings = structuredClone(DEFAULT_SETTINGS);
  state.sessions = []; state.cardio = []; state.body = []; state.active = null;
  state.meta = { lastBackupAt: null, installTipDismissed: false, persisted: state.meta.persisted, storeKind: store.kind };
  await Promise.all([store.put('kv', SCHEMA_VERSION, 'schemaVersion'), saveMeta(), saveSettings()]);
}

export function backupAgeDays(today = isoDate()) {
  return state.meta.lastBackupAt ? daysBetween(state.meta.lastBackupAt.slice(0, 10), today) : null;
}
export function hasData() { return state.sessions.length + state.cardio.length + state.body.length > 0; }
export { addDays };
