// state.js: in-memory app state, persistence and backup (export/import).
import { openStore, SCHEMA_VERSION, requestPersist } from './store.js';
import { PROGRAMS, programWeek, isDeload, getDay, exercise, rirFor, setsFor, slotsFor, estimate } from './program.js';
import { isoDate, addDays, daysBetween } from './util.js';
import { lastPerformance } from './stats.js';
import { APP_VERSION } from './version.js';

export const DEFAULT_SETTINGS = {
  startDate: null,              // program week 1 starts here
  programId: 'four',            // 'four' (upper/lower) or 'three' (full body)
  scheduleMode: 'fixed',        // 'fixed' weekdays or 'rotation'
  schedule: { four: [...PROGRAMS.four.schedule], three: [...PROGRAMS.three.schedule] },
  dayMode: 'full',              // default Full (~60 min) or Short (~45 min)
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

/** Merge saved settings over defaults (forward-compatible). */
function mergeSettings(saved) {
  const d = structuredClone(DEFAULT_SETTINGS);
  if (!saved || typeof saved !== 'object') return d;
  const out = { ...d, ...saved };
  out.schedule = { ...d.schedule, ...(saved.schedule || {}) };
  out.increments = { ...d.increments, ...(saved.increments || {}) };
  out.restOverride = { ...d.restOverride, ...(saved.restOverride || {}) };
  out.deloadOverrides = { ...(saved.deloadOverrides || {}) };
  out.swaps = { ...(saved.swaps || {}) };
  if (!PROGRAMS[out.programId]) out.programId = 'four';
  return out;
}

export async function initState() {
  store = await openStore();
  const [settings, meta, active, schema, sessions, cardio, body] = await Promise.all([
    store.get('kv', 'settings'), store.get('kv', 'meta'), store.get('kv', 'active'), store.get('kv', 'schemaVersion'),
    store.getAll('sessions'), store.getAll('cardio'), store.getAll('body'),
  ]);
  state.settings = mergeSettings(settings);
  state.meta = { ...state.meta, ...(meta || {}) };
  state.active = active || null;
  state.sessions = sessions || []; state.cardio = cardio || []; state.body = body || [];
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
  if (sw && sw.exId && daysBetween(sw.since, today) <= SWAP_DAYS) return sw.exId;
  return slot.id;
}

export function swapOptions(baseExId) {
  const base = exercise(baseExId);
  return [baseExId, ...(base ? base.subs : [])].filter((v, i, a) => a.indexOf(v) === i);
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
    slotId: slot.slotId, baseExId: slot.id, exId,
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

/* ---------------- Backup ---------------- */
export function exportData() {
  return {
    app: 'lean-split', schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
    settings: state.settings, sessions: state.sessions, cardio: state.cardio, body: state.body, active: state.active,
  };
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Validate an imported backup. Returns { ok, error, counts }. */
export function validateBackup(d) {
  const fail = (error) => ({ ok: false, error });
  if (!d || typeof d !== 'object') return fail('This is not a Lean Split backup (not a JSON object).');
  if (d.app !== 'lean-split') return fail('This file is not a Lean Split backup.');
  if (typeof d.schemaVersion !== 'number') return fail('The backup has no schema version.');
  if (d.schemaVersion > SCHEMA_VERSION) return fail('This backup comes from a newer app version. Update the app first.');
  for (const k of ['sessions', 'cardio', 'body']) if (!Array.isArray(d[k])) return fail(`The backup is missing "${k}".`);
  for (const s of d.sessions) {
    if (!s || typeof s.id !== 'string' || !ISO_RE.test(s.date || '') || !Array.isArray(s.exercises) || typeof s.startedAt !== 'number') return fail('A workout in the backup is damaged.');
    for (const e of s.exercises) if (!e || typeof e.exId !== 'string' || !Array.isArray(e.sets)) return fail('An exercise in the backup is damaged.');
  }
  for (const c of d.cardio) if (!c || typeof c.id !== 'string' || !ISO_RE.test(c.date || '')) return fail('A cardio entry in the backup is damaged.');
  for (const b of d.body) if (!b || !ISO_RE.test(b.date || '')) return fail('A body entry in the backup is damaged.');
  if (d.settings && typeof d.settings !== 'object') return fail('The settings in the backup are damaged.');
  return { ok: true, counts: { sessions: d.sessions.length, cardio: d.cardio.length, body: d.body.length } };
}

/** Replace everything on this device with the backup (already validated). */
export async function importData(d) {
  state.settings = mergeSettings(d.settings);
  state.sessions = d.sessions; state.cardio = d.cardio; state.body = d.body;
  state.active = d.active && Array.isArray(d.active.exercises) ? d.active : null;
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
