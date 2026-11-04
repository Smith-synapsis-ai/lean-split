// program.js: the training program, effort targets and time estimates.
//
// Source: the training review (§2 ramp-up, §5.4 programming, §5.6 revised
// routine, §5.7 three-day fallback), reorganised into ~60-minute gym visits:
// ~5 min warm-up -> ~40 min strength (antagonist supersets where sensible)
// -> 10-15 min incline-walk finisher (easy or skipped after leg days).
// Nothing personal lives here: this file is public.

/* ------------------------------------------------------------------ */
/* Equipment types: they decide the default weight step (editable).    */
/* ------------------------------------------------------------------ */
export const EQUIPMENT = {
  barbell:    { label: 'Barbell',             step: 2.5 },
  dumbbell:   { label: 'Dumbbell',            step: 2 },
  machine:    { label: 'Machine (stack)',     step: 5 },
  cable:      { label: 'Cable',               step: 2.5 },
  bodyweight: { label: 'Bodyweight (+ added)', step: 2.5 },
  assisted:   { label: 'Assisted (kg of help)', step: 5 },
};

/* ------------------------------------------------------------------ */
/* Exercise catalogue. Substitutions keep the same movement pattern    */
/* and stretch position (review §5.4).                                 */
/* ------------------------------------------------------------------ */
const EX = {
  // Upper: pushes
  'bench':            { nameEn: 'Bench press', nameEs: 'Press de banca', muscles: ['Chest', 'Front delts', 'Triceps'], equipment: 'barbell',
                        cue: 'Main horizontal press. Control the lowering and use full range. The machine press is equally fine while you come back.',
                        subs: ['machine-press'] },
  'machine-press':    { nameEn: 'Machine chest press', nameEs: 'Press en máquina', muscles: ['Chest', 'Front delts', 'Triceps'], equipment: 'machine',
                        cue: 'Same job as the bench press. Full range, controlled lowering.', subs: ['bench'] },
  'incline-db-press': { nameEn: 'Incline dumbbell press', nameEs: 'Press inclinado con mancuernas', muscles: ['Upper chest', 'Front delts', 'Triceps'], equipment: 'dumbbell',
                        cue: 'Grows the upper chest more than flat pressing. Control the lowering into a good stretch.', subs: ['machine-press'] },
  'db-shoulder-press':{ nameEn: 'Seated dumbbell shoulder press', nameEs: 'Press militar con mancuernas sentado', muscles: ['Front delts', 'Side delts', 'Triceps'], equipment: 'dumbbell',
                        cue: 'Seated, full range: lower the dumbbells to about ear level. Keep the weight heavy.', subs: [] },
  'machine-fly':      { nameEn: 'Machine fly', nameEs: 'Aperturas en máquina', muscles: ['Chest'], equipment: 'machine',
                        cue: 'Full stretch at the open position, smooth squeeze. Add reps before weight.', subs: ['cable-crossover'] },
  'cable-crossover':  { nameEn: 'Cable crossover', nameEs: 'Cruce de poleas', muscles: ['Chest'], equipment: 'cable',
                        cue: 'Same job as the machine fly. Full stretch, smooth squeeze.', subs: ['machine-fly'] },
  // Upper: pulls
  'cs-row':           { nameEn: 'Chest-supported row', nameEs: 'Remo con pecho apoyado', muscles: ['Upper back', 'Lats', 'Rear delts'], equipment: 'machine',
                        cue: 'Chest on the pad: it spares the lower back, which squats, RDLs and hip thrusts already load.', subs: ['barbell-row', 'cable-row'] },
  'barbell-row':      { nameEn: 'Barbell row', nameEs: 'Remo con barra', muscles: ['Upper back', 'Lats', 'Rear delts'], equipment: 'barbell',
                        cue: 'Fine as a swap, but it loads the lower back. Prefer the chest-supported row when you can.', subs: ['cs-row'] },
  'lat-pulldown':     { nameEn: 'Lat pulldown', nameEs: 'Jalón al pecho', muscles: ['Lats', 'Biceps'], equipment: 'cable',
                        cue: 'Grip width barely changes lat work, so use the one that feels best. Full stretch at the top.', subs: ['neutral-pulldown', 'assisted-pullup'] },
  'neutral-pulldown': { nameEn: 'Neutral-grip pulldown', nameEs: 'Jalón agarre neutro', muscles: ['Lats', 'Biceps'], equipment: 'cable',
                        cue: 'Use this or assisted pull-ups until you can do 8 strict pull-ups.', subs: ['assisted-pullup', 'pullup', 'lat-pulldown'] },
  'assisted-pullup':  { nameEn: 'Assisted pull-up', nameEs: 'Dominadas asistidas', muscles: ['Lats', 'Biceps'], equipment: 'assisted',
                        cue: 'Log the assistance in kg. Less assistance means harder.', subs: ['neutral-pulldown', 'pullup'] },
  'pullup':           { nameEn: 'Pull-up', nameEs: 'Dominadas', muscles: ['Lats', 'Biceps'], equipment: 'bodyweight',
                        cue: 'Log only added weight (0 = bodyweight). Full hang at the bottom.', subs: ['assisted-pullup', 'neutral-pulldown'] },
  'cable-row':        { nameEn: 'Seated cable row', nameEs: 'Remo en polea baja', muscles: ['Upper back', 'Lats'], equipment: 'cable',
                        cue: 'Let the shoulders reach forward for the stretch, then row to the lower ribs.', subs: ['one-arm-db-row', 'cs-row'] },
  'one-arm-db-row':   { nameEn: 'One-arm dumbbell row', nameEs: 'Remo con mancuerna a una mano', muscles: ['Upper back', 'Lats'], equipment: 'dumbbell',
                        cue: 'Supported on a bench. Log the dumbbell weight; reps are per arm.', subs: ['cable-row', 'cs-row'] },
  'face-pull':        { nameEn: 'Face pull', nameEs: 'Face pull', muscles: ['Rear delts', 'Upper back'], equipment: 'cable',
                        cue: 'Rear delts were low on volume, hence 3 sets. Pull to the face, elbows high.', subs: [] },
  // Shoulders and arms
  'lateral-raise':    { nameEn: 'Lateral raise', nameEs: 'Elevaciones laterales', muscles: ['Side delts'], equipment: 'dumbbell',
                        cue: 'Side delts were low on volume. Add reps before weight.', subs: ['cable-lateral-raise'] },
  'cable-lateral-raise': { nameEn: 'Cable lateral raise', nameEs: 'Elevación lateral en polea', muscles: ['Side delts'], equipment: 'cable',
                        cue: 'Same job as the dumbbell raise. Add reps before weight.', subs: ['lateral-raise'] },
  'ez-curl':          { nameEn: 'EZ-bar curl', nameEs: 'Curl de bíceps con barra Z', muscles: ['Biceps'], equipment: 'barbell',
                        cue: 'Full range. Add reps before weight.', subs: ['hammer-curl'] },
  'hammer-curl':      { nameEn: 'Hammer curl', nameEs: 'Curl martillo', muscles: ['Biceps', 'Forearms'], equipment: 'dumbbell',
                        cue: 'Neutral grip, full range. Add reps before weight.', subs: ['ez-curl'] },
  'pushdown':         { nameEn: 'Cable triceps pushdown', nameEs: 'Extensión de tríceps en polea', muscles: ['Triceps'], equipment: 'cable',
                        cue: 'Full lockout. The overhead extension covers the long head on the other upper day.', subs: ['overhead-ext'] },
  'overhead-ext':     { nameEn: 'Overhead triceps extension', nameEs: 'Extensión de tríceps sobre la cabeza', muscles: ['Triceps'], equipment: 'cable',
                        cue: 'Get the deep stretch behind the head: overhead work grew the triceps about 1.4x more than arms-down.', subs: ['pushdown'] },
  // Legs
  'squat':            { nameEn: 'Deep back squat', nameEs: 'Sentadilla profunda', muscles: ['Quads', 'Glutes', 'Adductors'], equipment: 'barbell',
                        cue: 'Squat deep: full squats grew the glutes and adductors more than half squats. Never closer than RIR 2.', subs: ['hack-squat'] },
  'hack-squat':       { nameEn: 'Hack squat', nameEs: 'Sentadilla hack', muscles: ['Quads', 'Glutes'], equipment: 'machine',
                        cue: 'Deep range, controlled. Never closer than RIR 2.', subs: ['squat', 'leg-press'] },
  'rdl':              { nameEn: 'Romanian deadlift', nameEs: 'Peso muerto rumano', muscles: ['Hamstrings', 'Glutes', 'Lower back'], equipment: 'barbell',
                        cue: 'Your only hip hinge of the week. Hips back, long hamstrings. Never closer than RIR 2.', subs: [] },
  'leg-ext':          { nameEn: 'Leg extension (deep start)', nameEs: 'Extensión de cuádriceps', muscles: ['Quads'], equipment: 'machine',
                        cue: 'Start each rep from a deep knee bend: that part of the range grew the quads more.', subs: [] },
  'seated-leg-curl':  { nameEn: 'Seated leg curl', nameEs: 'Curl femoral sentado', muscles: ['Hamstrings'], equipment: 'machine',
                        cue: 'The best curl option: seated grew the hamstrings more than lying.', subs: ['lying-leg-curl'] },
  'lying-leg-curl':   { nameEn: 'Lying leg curl', nameEs: 'Curl femoral tumbado', muscles: ['Hamstrings'], equipment: 'machine',
                        cue: 'Fine when the seated machine is busy.', subs: ['seated-leg-curl'] },
  'standing-calf':    { nameEn: 'Standing calf raise', nameEs: 'Elevación de gemelos de pie', muscles: ['Calves'], equipment: 'machine',
                        cue: 'Full stretch at the bottom and pause 1-2 s: the stretched half grew the calf more.', subs: [] },
  'seated-calf':      { nameEn: 'Seated calf raise', nameEs: 'Gemelos sentado', muscles: ['Calves'], equipment: 'machine',
                        cue: 'Same deep-stretch pause at the bottom as the standing raise.', subs: [] },
  'hip-thrust':       { nameEn: 'Hip thrust', nameEs: 'Hip thrust', muscles: ['Glutes'], equipment: 'barbell',
                        cue: 'Grows the glutes about as much as squats; together they cover the hips well. Pause at the top.', subs: [] },
  'leg-press':        { nameEn: 'Leg press (deep)', nameEs: 'Prensa de piernas', muscles: ['Quads', 'Glutes'], equipment: 'machine',
                        cue: 'Use a deep range and rest about 2 min.', subs: ['hack-squat', 'bulgarian'] },
  'bulgarian':        { nameEn: 'Bulgarian split squat', nameEs: 'Sentadilla búlgara', muscles: ['Quads', 'Glutes'], equipment: 'dumbbell', perSide: true,
                        cue: 'Very muscle-damaging: week 1 is 1 light set per leg at RIR 3-4. Never closer than RIR 2. Log dumbbell weight; reps are per leg.', subs: ['leg-press'] },
  // Abs
  'cable-crunch':     { nameEn: 'Cable crunch', nameEs: 'Crunch en polea', muscles: ['Abs'], equipment: 'cable',
                        cue: 'Curl the ribs towards the hips; controlled.', subs: ['reverse-crunch'] },
  'hanging-leg-raise':{ nameEn: 'Hanging leg raise', nameEs: 'Elevación de piernas colgado', muscles: ['Abs'], equipment: 'bodyweight',
                        cue: "If your grip gives out first, use a captain's chair raise or a reverse crunch.", subs: ['captains-chair', 'reverse-crunch'] },
  'captains-chair':   { nameEn: "Captain's chair leg raise", nameEs: 'Elevación de piernas en silla romana', muscles: ['Abs'], equipment: 'bodyweight',
                        cue: 'Same job as the hanging raise without the grip limit.', subs: ['hanging-leg-raise', 'reverse-crunch'] },
  'reverse-crunch':   { nameEn: 'Reverse crunch', nameEs: 'Crunch inverso', muscles: ['Abs'], equipment: 'bodyweight',
                        cue: 'Roll the hips up off the bench; slow on the way down.', subs: ['hanging-leg-raise'] },
};

export function exercise(id) {
  const e = isExerciseId(id) ? EX[id] : null;
  return e ? { id, perSide: false, ...e } : null;
}
export const EXERCISE_IDS = Object.keys(EX);

/* ------------------------------------------------------------------ */
/* Slots. s(exId, sets, lo, hi, kind, tier, restSec, group, extra)      */
/*  kind  M = main lift, C = other compound, I = isolation (review 5.6)  */
/*  tier  core = always; optional = dropped on a Short day (06 §C)      */
/*  restSec = rest after the set, or after the full superset round      */
/*  group = superset letter (consecutive slots with the same letter)    */
/* ------------------------------------------------------------------ */
function s(exId, sets, lo, hi, kind, tier, restSec, group = null, extra = {}) {
  return { exId, sets, reps: [lo, hi], kind, tier, restSec, group, rampUp: false, ...extra };
}
const RAMP = { rampUp: true }; // first lift for a muscle: show the warm-up ramp

const DAYS = {
  // ---------------- 4-day upper/lower (default) ----------------
  upperA: { name: 'Upper A', nameEs: 'Torso A', leg: false, slots: [
    s('bench',             3, 6, 8,   'M', 'core',     120, 'A', RAMP),
    s('cs-row',            3, 8, 10,  'C', 'core',     120, 'A', RAMP),
    s('db-shoulder-press', 3, 8, 10,  'C', 'core',      90, 'B'),
    s('lat-pulldown',      3, 10, 12, 'C', 'core',      90, 'B'),
    s('lateral-raise',     2, 12, 15, 'I', 'optional',  60),
    s('ez-curl',           2, 10, 12, 'I', 'optional',  60, 'C'),
    s('pushdown',          2, 10, 12, 'I', 'optional',  60, 'C'),
  ] },
  lowerA: { name: 'Lower A', nameEs: 'Pierna A', focus: 'quads', leg: true, slots: [
    s('squat',             3, 6, 8,   'M', 'core',     180, null, RAMP),
    s('rdl',               3, 8, 10,  'M', 'core',     150, null, RAMP),
    s('leg-ext',           3, 10, 15, 'I', 'core',      90, 'A'),
    s('seated-leg-curl',   3, 10, 12, 'I', 'core',      90, 'A'),
    s('standing-calf',     3, 10, 15, 'I', 'optional',  60, 'B'),
    s('cable-crunch',      3, 12, 15, 'I', 'optional',  60, 'B'),
  ] },
  upperB: { name: 'Upper B', nameEs: 'Torso B', leg: false, slots: [
    s('incline-db-press',  3, 8, 10,  'C', 'core',     120, 'A', RAMP),
    s('neutral-pulldown',  3, 8, 10,  'C', 'core',     120, 'A', RAMP),
    s('cable-row',         3, 10, 12, 'C', 'core',      90, 'B'),
    s('lateral-raise',     3, 12, 15, 'I', 'core',      90, 'B'),
    s('machine-fly',       2, 12, 15, 'I', 'optional',  60, 'C'),
    s('face-pull',         3, 12, 15, 'I', 'optional',  60, 'C'),
    s('hammer-curl',       2, 10, 12, 'I', 'optional',  60, 'D'),
    s('overhead-ext',      2, 10, 12, 'I', 'optional',  60, 'D'),
  ] },
  lowerB: { name: 'Lower B', nameEs: 'Pierna B', focus: 'glutes and hamstrings', leg: true, slots: [
    s('hip-thrust',        3, 8, 10,  'C', 'core',     120, null, RAMP),
    s('leg-press',         3, 10, 12, 'C', 'core',     120),
    // Review: week 1 = 1 easy set per leg, then 2 sets; week 4+ stays at RIR 2 (M).
    s('bulgarian',         2, 8, 10,  'M', 'optional',  90, null, { week1Sets: 1 }),
    s('seated-leg-curl',   3, 10, 12, 'I', 'core',      90),
    s('seated-calf',       3, 12, 15, 'I', 'optional',  60, 'A'),
    s('hanging-leg-raise', 3, 10, 15, 'I', 'optional',  60, 'A'),
  ] },
  // ---------------- 3-day full-body fallback (review 5.7) ----------------
  fullA: { name: 'Full A', nameEs: 'Día 1 – Full A', leg: true, slots: [
    s('squat',             3, 6, 8,   'M', 'core',     180, null, RAMP),
    s('bench',             3, 6, 8,   'M', 'core',     120, 'A', RAMP),
    s('cs-row',            3, 8, 10,  'C', 'core',     120, 'A', RAMP),
    s('seated-leg-curl',   2, 10, 12, 'I', 'core',      90),
    s('lateral-raise',     2, 12, 15, 'I', 'optional',  60, 'B'),
    s('overhead-ext',      2, 10, 12, 'I', 'optional',  60, 'B'),
    s('standing-calf',     2, 10, 15, 'I', 'optional',  60),
  ] },
  fullB: { name: 'Full B', nameEs: 'Día 2 – Full B', leg: true, slots: [
    s('rdl',               3, 8, 10,  'M', 'core',     150, null, RAMP),
    s('incline-db-press',  3, 8, 10,  'C', 'core',     120, 'A', RAMP),
    s('neutral-pulldown',  3, 8, 10,  'C', 'core',     120, 'A', RAMP),
    s('leg-press',         2, 10, 12, 'C', 'core',     120),
    s('face-pull',         2, 12, 15, 'I', 'optional',  60, 'B'),
    s('ez-curl',           2, 10, 12, 'I', 'optional',  60, 'B'),
    s('cable-crunch',      2, 12, 15, 'I', 'optional',  60),
  ] },
  fullC: { name: 'Full C', nameEs: 'Día 3 – Full C', leg: true, slots: [
    s('hip-thrust',        3, 8, 10,  'C', 'core',     120, null, RAMP),
    s('db-shoulder-press', 3, 8, 10,  'C', 'core',      90, 'A', RAMP),
    s('lat-pulldown',      3, 10, 12, 'C', 'core',      90, 'A', { rampUp: true, extraSubs: ['cable-row'] }),
    s('leg-ext',           2, 10, 15, 'I', 'core',      90, 'B'),
    s('seated-leg-curl',   2, 10, 12, 'I', 'core',      90, 'B'),
    s('lateral-raise',     2, 12, 15, 'I', 'optional',  60),
    s('hammer-curl',       2, 10, 12, 'I', 'optional',  60, 'C'),
    s('pushdown',          2, 10, 12, 'I', 'optional',  60, 'C'),
    s('seated-calf',       2, 12, 15, 'I', 'optional',  60),
  ] },
};

export const PROGRAMS = {
  four:  { id: 'four',  name: '4-day upper/lower', rotation: ['upperA', 'lowerA', 'upperB', 'lowerB'],
           // Mon..Sun. Default: Mon Upper A, Wed Lower A, Fri Upper B, Sat Lower B.
           schedule: ['upperA', null, 'lowerA', null, 'upperB', 'lowerB', null] },
  three: { id: 'three', name: '3-day full body (busy weeks)', rotation: ['fullA', 'fullB', 'fullC'],
           schedule: ['fullA', null, 'fullB', null, 'fullC', null, null] },
};

/** A day with its slots merged with catalogue data. Every slot carries the
 *  full exercise spec: id, names, muscles, sets, reps, rest, group, tier,
 *  cue, substitutions, equipment and per-side flag. */
export function getDay(dayId) {
  const d = DAYS[dayId];
  if (!d) return null;
  const slots = d.slots.map((sl, i) => {
    const ex = exercise(sl.exId);
    // Slot-specific alternatives (e.g. Full C pull: pulldown or cable row, review 5.7).
    const subs = [...ex.subs, ...(sl.extraSubs || [])].filter((v, k, a) => a.indexOf(v) === k);
    return { slotId: `${dayId}-${i}`, ...sl, ...ex, subs, id: sl.exId };
  });
  return { id: dayId, ...d, slots };
}
export function dayName(dayId) {
  const d = DAYS[dayId];
  return d ? d.name : dayId;
}
export function allDayIds() { return Object.keys(DAYS); }
export function isDayId(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(DAYS, id); }
export function isExerciseId(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(EX, id); }

/* ------------------------------------------------------------------ */
/* Effort: ramp-up, RIR and deload (review §2, §5.4, §5.6)              */
/* ------------------------------------------------------------------ */

/** Program week from the start date: 1 = first week. 0 = not started / unset. */
export function programWeek(startISO, todayISO) {
  if (!startISO || !/^\d{4}-\d{2}-\d{2}$/.test(startISO)) return 0;
  const a = Date.UTC(...isoParts(startISO));
  const b = Date.UTC(...isoParts(todayISO));
  const days = Math.round((b - a) / 86400000);
  if (days < 0) return 0;
  return Math.floor(days / 7) + 1;
}
function isoParts(iso) { const [y, m, d] = iso.split('-').map(Number); return [y, m - 1, d]; }

/** Is this program week a deload? Auto every N weeks, overridable per week. */
export function isDeload(settings, week) {
  if (!week) return false;
  const o = settings.deloadOverrides && settings.deloadOverrides[week];
  if (o === true || o === false) return o;
  const every = Number(settings.deloadEvery) || 7;
  return week % every === 0;
}

/** Min–max total minutes over a program's days for a mode (labels like "Short ≈31–40 min"). */
export function estimateRange(programId, opts) {
  const p = PROGRAMS[programId] || PROGRAMS.four;
  const t = p.rotation.map((d) => estimate(getDay(d), opts).total);
  const lo = Math.min(...t), hi = Math.max(...t);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

/** Short phase description shown on Today. */
export function phase(week, deload) {
  if (deload) return { label: 'Deload week', note: 'About half the sets at RIR 3–4, and cardio cut by about a third. Lighter on purpose.' };
  if (week <= 1) return { label: 'Ramp-up week', note: 'About 2/3 of the sets at RIR 3–4. No failure. Easing back in is the plan.' };
  if (week <= 3) return { label: 'Build weeks', note: 'Full sets at RIR 2–3. Start adding reps or weight.' };
  return { label: 'Normal weeks', note: 'RIR 1–2 on most sets. Main lifts stay at RIR 2. Keep the weight heavy.' };
}

/** Target reps in reserve for a slot kind in a given week. */
export function rirFor(kind, week, deload) {
  if (deload || week <= 1) return '3–4';
  if (week <= 3) return '2–3';
  if (kind === 'M') return '2';
  if (kind === 'C') return '1–2';
  return '1–2, last set 0–1';
}
/** Week-level headline RIR (Today screen). */
export function weekRir(week, deload) {
  if (deload || week <= 1) return '3–4';
  if (week <= 3) return '2–3';
  return '1–2';
}

/** Working sets for a slot this week. Week 1 ≈ 2/3 (3→2, 2→1); deload ≈ half. */
export function setsFor(slot, week, deload) {
  if (deload) return Math.max(1, Math.ceil(slot.sets / 2));
  if (week <= 1) return slot.week1Sets ?? Math.max(1, Math.round(slot.sets * 2 / 3));
  return slot.sets;
}

/* ------------------------------------------------------------------ */
/* Blocks, rest and time estimate                                       */
/* ------------------------------------------------------------------ */

/** Group consecutive slots with the same superset letter into blocks. */
export function buildBlocks(slots) {
  const blocks = [];
  for (const sl of slots) {
    const last = blocks[blocks.length - 1];
    if (sl.group && last && last.group === sl.group) last.items.push(sl);
    else blocks.push({ group: sl.group, items: [sl] });
  }
  return blocks;
}

const KIND_RANK = { M: 3, C: 2, I: 1 };
/** Rest after a set (straight) or after a superset round. Never below 60 s. */
export function blockRest(items, restOverride = {}) {
  const kind = items.reduce((k, it) => (KIND_RANK[it.kind] > KIND_RANK[k] ? it.kind : k), 'I');
  const base = Math.max(...items.map((it) => it.restSec));
  const o = restOverride && Number(restOverride[kind]);
  return Math.max(60, o > 0 ? o : base);
}

// Estimate constants (seconds). Tuned so a Full day lands near 60 min.
export const EST = {
  work: 40,        // one working set
  switch: 30,      // walking between the two stations of a superset
  changeover: 120, // setting up / loading the next exercise
  ramp: 150,       // warm-up sets on the first lift for a muscle
  warmup: 5,       // minutes of general warm-up
};

/** Finisher suggestion for a day and mode (minutes + friendly text). */
export function finisherFor(day, mode, deload = false) {
  let min, text;
  if (!day.leg) {
    min = mode === 'short' ? 10 : 15;
    text = mode === 'short' ? '10 min incline walk, talking pace' : '10–15 min incline walk, talking pace';
  } else {
    min = mode === 'short' ? 0 : 5;
    text = mode === 'short' ? 'Skip the finisher after legs today' : '5–10 min easy, flat walk (or skip) after legs';
  }
  if (deload && min) { min = Math.round(min * 2 / 3); text += ' (deload: about a third less)'; }
  return { min, text };
}

/** Slots used in a mode: Short day drops optional exercises. */
export function slotsFor(day, mode) {
  return mode === 'short' ? day.slots.filter((s) => s.tier === 'core') : day.slots;
}

/** Estimated minutes: sets × (≈40 s work + rest), supersets accounted for,
 *  plus changeovers, warm-up ramps, general warm-up and finisher. */
export function estimate(day, { mode = 'full', week = 1, deload = false, restOverride = {} } = {}) {
  const blocks = buildBlocks(slotsFor(day, mode));
  let sec = 0;
  for (const b of blocks) {
    const counts = b.items.map((it) => setsFor(it, week, deload));
    const rounds = Math.max(...counts);
    const rest = blockRest(b.items, restOverride);
    for (let r = 0; r < rounds; r++) {
      const active = b.items.filter((_, i) => counts[i] > r);
      sec += active.reduce((a, it) => a + EST.work * (it.perSide ? 2 : 1), 0);
      sec += EST.switch * (active.length - 1);
      if (r < rounds - 1) sec += rest;
    }
    sec += EST.changeover + (b.items.some((it) => it.rampUp) ? EST.ramp : 0);
  }
  const strength = Math.round(sec / 60);
  const fin = finisherFor(day, mode, deload).min;
  return { strength, warmup: EST.warmup, finisher: fin, total: strength + EST.warmup + fin };
}

/* ------------------------------------------------------------------ */
/* Cardio ramp and cap (review §2)                                      */
/* ------------------------------------------------------------------ */
export function cardioCap(week, deload) {
  let cap, label;
  if (week <= 2) { cap = 180; label = 'about 2–3 h'; }
  else if (week <= 4) { cap = 270; label = 'about 3.5–4.5 h'; }
  else { cap = 300; label = 'up to about 5 h'; }
  if (deload) { cap = Math.round(cap * 2 / 3); label += ', minus a third (deload)'; }
  return { cap, label };
}
