// stats.js: pure functions for history, progression hints, PRs, body
// weight trends and weekly summaries. No DOM here, so it is easy to test.
import { addDays, mondayOf, fmtNum, daysBetween } from './util.js';

const doneSets = (ex) => (ex && !ex.skipped && Array.isArray(ex.sets) ? ex.sets.filter((s) => s && s.done && s.reps > 0) : []);

/** Session length in minutes, capped at 4 h as a safety net (no 900-minute sessions). */
export const MAX_SESSION_MIN = 240;
export function durationMin(s) {
  const m = Math.round(((s.finishedAt ?? Date.now()) - s.startedAt) / 60000);
  return Number.isFinite(m) ? Math.max(0, Math.min(MAX_SESSION_MIN, m)) : 0;
}
/** Time of the last activity in a workout: the last ticked set, or the start. */
export function lastActivity(w) {
  let t = w.startedAt || 0;
  for (const e of w.exercises || []) for (const st of e.sets || []) if (st && st.done && st.at > t) t = st.at;
  return t;
}
/** A workout is stale if it began on an earlier day or saw no activity for 4 h. */
export const STALE_MS = 4 * 3600 * 1000;
export function isStale(w, todayISO, now = Date.now()) {
  return !!w && (w.date !== todayISO || now - lastActivity(w) > STALE_MS);
}
const finished = (sessions) => sessions.filter((s) => s.finishedAt).sort((a, b) => a.startedAt - b.startedAt);

/** Most recent finished performance of an exercise (optionally before a time). */
export function lastPerformance(sessions, exId, beforeTs = Infinity) {
  const list = finished(sessions).filter((s) => s.startedAt < beforeTs);
  for (let i = list.length - 1; i >= 0; i--) {
    const ex = list[i].exercises.find((e) => e.exId === exId && doneSets(e).length);
    if (ex) return { date: list[i].date, sets: doneSets(ex), deload: list[i].deload, week: list[i].week };
  }
  return null;
}

/** Heaviest set (ties broken by reps). */
export function topSet(sets) {
  let best = null;
  for (const s of sets) {
    const kg = s.kg ?? 0;
    if (!best || kg > (best.kg ?? 0) || (kg === (best.kg ?? 0) && s.reps > best.reps)) best = s;
  }
  return best;
}

/**
 * Double-progression hint (review §5.4): add weight only when every set
 * reached the top of the range; use the smallest jump; isolation adds reps first.
 * Returns { text, tone: 'up'|'stay'|'down'|'new', addKg }.
 */
export function progressionHint({ last, reps: [lo, hi], kind, equipment, step, easyWeek }) {
  if (!last) return { tone: 'new', text: 'First time logged: pick a weight that leaves the target reps in reserve.' };
  const sets = last.sets;
  const kg = topSet(sets).kg;
  const kgTxt = kg ? `${fmtNum(kg)} kg` : 'this weight';
  const allTop = sets.every((s) => s.reps >= hi);
  const anyLow = sets.some((s) => s.reps < lo);
  let h;
  if (allTop) {
    if (equipment === 'assisted') h = { tone: 'up', addKg: -step, text: `Last time you hit the top of the range on all sets → try ${fmtNum(step)} kg less assistance.` };
    else h = { tone: 'up', addKg: step, text: `Last time you hit the top of the range on all sets → try +${fmtNum(step)} kg.` };
  } else if (anyLow) {
    h = { tone: 'down', text: `Some sets fell below ${lo} reps last time → stay at ${kgTxt}. If it happens again, drop about 5 %.` };
  } else if (kind === 'I') {
    h = { tone: 'stay', text: `Stay at ${kgTxt} and add reps first. Add weight once every set reaches ${hi}.` };
  } else {
    h = { tone: 'stay', text: `Stay at ${kgTxt} and aim for one more rep on a set. Add weight once every set reaches ${hi}.` };
  }
  if (easyWeek && h.tone === 'up') h = { tone: 'stay', text: `${h.text.replace(/→.*/, '→')} this is an easy week, so keep the weight and save the jump for next week.` };
  if (last.deload && !easyWeek) h.text += ' (Last time was a deload, so expect it to feel lighter.)';
  return h;
}

/** Warm-up ramp on the first lift for a muscle: 50 %×8, 70 %×4, 85 %×2. */
export function warmupRamp(kg, step = 2.5) {
  if (!kg || kg <= 0) return null;
  const r = (v) => Math.max(0, Math.round(v / step) * step);
  return [[0.5, 8], [0.7, 4], [0.85, 2]].map(([f, n]) => ({ kg: r(kg * f), reps: n }));
}

/** Modest personal bests for a just-finished session versus earlier ones. */
export function findPRs(session, sessions) {
  const prev = finished(sessions).filter((s) => s.id !== session.id && s.startedAt < session.startedAt);
  const out = [];
  for (const ex of session.exercises) {
    const mine = doneSets(ex);
    if (!mine.length) continue;
    const before = prev.flatMap((s) => s.exercises.filter((e) => e.exId === ex.exId).flatMap(doneSets));
    if (!before.length) continue; // first time: nothing to compare with
    const top = topSet(mine);
    const maxKg = Math.max(...before.map((s) => s.kg ?? 0));
    if ((top.kg ?? 0) > maxKg && ex.equipment !== 'assisted') {
      out.push({ exId: ex.exId, name: ex.nameEn, type: 'weight', text: `${ex.nameEn}: ${fmtNum(top.kg)} kg × ${top.reps}, the heaviest so far (before: ${fmtNum(maxKg)} kg).` });
      continue;
    }
    // rep best: more reps than ever at this weight or heavier
    for (const s of mine) {
      const kg = s.kg ?? 0;
      const bestAt = Math.max(0, ...before.filter((b) => (b.kg ?? 0) >= kg).map((b) => b.reps));
      if (s.reps > bestAt && bestAt > 0) {
        out.push({ exId: ex.exId, name: ex.nameEn, type: 'reps', text: `${ex.nameEn}: ${s.reps} reps at ${fmtNum(kg)} kg, more than before (${bestAt}).` });
        break;
      }
    }
  }
  return out;
}

/* ---------------- Body weight ---------------- */
function weights(body, upTo = null) {
  return body.filter((b) => b && typeof b.weightKg === 'number' && Number.isFinite(b.weightKg) && (!upTo || b.date <= upTo))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
function meanIn(list, from, to) {
  const v = list.filter((b) => b.date >= from && b.date <= to).map((b) => b.weightKg);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
/** Each weigh-in with the average of all weigh-ins in the 7 days ending that day. */
export function rollingAverage(body, upTo = null) {
  const w = weights(body, upTo);
  return w.map((b) => ({ date: b.date, kg: b.weightKg, avg7: meanIn(w, addDays(b.date, -6), b.date) }));
}
/**
 * Weekly change: this 7-day average vs the previous 7 days, as % of body
 * weight, against the 0.5–0.7 %/week loss band (review §6/§8).
 */
export function weeklyChange(body, today) {
  const w = weights(body, today);
  const avgNow = meanIn(w, addDays(today, -6), today);
  const avgPrev = meanIn(w, addDays(today, -13), addDays(today, -7));
  if (avgNow === null) return { avgNow, avgPrev, pct: null, status: 'none', message: 'Log a few morning weigh-ins this week to see your 7-day average.' };
  if (avgPrev === null) return { avgNow, avgPrev, pct: null, status: 'none', message: 'Your weekly change appears once you have weigh-ins from last week too.' };
  const pct = ((avgNow - avgPrev) / avgPrev) * 100; // negative = loss
  const loss = Math.round(-pct * 100) / 100; // compare at the precision we display
  let status, message;
  if (loss > 0.7) { status = 'fast'; message = 'Losing faster than the 0.5–0.7 % band. Eat a bit more (mostly carbs) so you keep your strength and muscle.'; }
  else if (loss >= 0.5) { status = 'on'; message = 'Right in the 0.5–0.7 % band. You are on track.'; }
  else if (loss > 0) { status = 'slow'; message = 'Slower than the band. That is fine: be patient, weekly averages wobble. Check again next week.'; }
  else if (loss < 0) { status = 'up'; message = 'Trending up this week. That is usually normal day-to-day noise (water, salt, carbs). If it continues for 2+ weeks, trim portions a little.'; }
  else { status = 'flat'; message = 'Holding steady this week. Fine for a week or two; if it stays flat for 2+ weeks, trim portions a little.'; }
  return { avgNow, avgPrev, pct, status, message };
}

/* ---------------- Weeks, cardio, summaries ---------------- */
export function cardioMinutes(cardio, from, to) {
  return cardio.filter((c) => c && c.date >= from && c.date <= to).reduce((a, c) => a + (Number(c.minutes) || 0), 0);
}
export function sessionsBetween(sessions, from, to) {
  return finished(sessions).filter((s) => s.date >= from && s.date <= to);
}
export function setsDone(session) { return session.exercises.reduce((a, e) => a + doneSets(e).length, 0); }
export function setsPlanned(session) { return session.exercises.reduce((a, e) => a + (e.skipped || !Array.isArray(e.sets) ? 0 : e.sets.length), 0); }

/** Summaries for the last n weeks (newest first), Monday to Sunday. */
export function weeklySummaries(state, today, n = 8) {
  const out = [];
  let mon = mondayOf(today);
  for (let i = 0; i < n; i++) {
    const sun = addDays(mon, 6);
    const ss = sessionsBetween(state.sessions, mon, sun);
    const w = weights(state.body).filter((b) => b.date >= mon && b.date <= sun).map((b) => b.weightKg);
    const row = {
      monday: mon, sessions: ss.length,
      sets: ss.reduce((a, s) => a + setsDone(s), 0),
      cardio: cardioMinutes(state.cardio, mon, sun),
      avgWeight: w.length ? w.reduce((a, b) => a + b, 0) / w.length : null,
    };
    if (row.sessions || row.cardio || row.avgWeight) out.push(row);
    mon = addDays(mon, -7);
  }
  return out;
}

/** Top-set weight over time for one exercise. */
export function liftTrend(sessions, exId) {
  return finished(sessions).map((s) => {
    const ex = s.exercises.find((e) => e.exId === exId);
    const t = ex ? topSet(doneSets(ex)) : null;
    return t && typeof t.kg === 'number' && t.kg > 0 ? { date: s.date, y: t.kg, reps: t.reps } : null;
  }).filter(Boolean);
}

/** Next day in the rotation: the one after the last finished day of this program. */
export function nextInRotation(sessions, rotation) {
  const done = finished(sessions).filter((s) => rotation.includes(s.dayId));
  if (!done.length) return rotation[0];
  const last = done[done.length - 1].dayId;
  return rotation[(rotation.indexOf(last) + 1) % rotation.length];
}

export function daysSince(iso, today) { return iso ? daysBetween(iso, today) : null; }
