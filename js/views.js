// views.js: screens rendered as HTML strings. Event handling lives in app.js
// (elements carry data-act="…" attributes).
import { state, ctx, estimateFor, backupAgeDays, hasData, swapOptions, staleActive, blockRestFor, endTimeFor } from './state.js';
import { PROGRAMS, getDay, dayName, slotsFor, setsFor, buildBlocks, finisherFor, phase, weekRir, cardioCap, isDeload, exercise, EQUIPMENT, estimateRange } from './program.js';
import { esc, fmtDate, fmtNum, fmtClock, fmtRest, fmtTime, addDays, mondayOf, weekdayIndex, WEEKDAYS, isStandalone } from './util.js';
import { lastPerformance, progressionHint, warmupRamp, findPRs, topSet, rollingAverage, weeklyChange, cardioMinutes, sessionsBetween, setsDone, setsPlanned, weeklySummaries, liftTrend, nextInRotation, durationMin, lastActivity } from './stats.js';
import { lineChart } from './charts.js';
import { APP_VERSION } from './version.js';

export const ui = {
  pickDay: null,          // Today: a day chosen manually ("train anyway")
  mode: null,             // Today: full/short toggle (defaults to settings)
  walkOpen: false,        // Today: morning-walk form open
  resetStep: 0,
};

const head = (title, sub = '') => `<header class="top"><h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</header>`;
const TALK = { talk: 'Could talk', phrases: 'Short phrases', no: "Couldn't talk" };
const KIND_LABEL = { 'am-walk': 'Morning walk', finisher: 'Finisher', other: 'Other' };

/* ================================================================== */
/* Shared pieces                                                       */
/* ================================================================== */
function weekLine(c) {
  if (!state.settings.startDate) return 'Program start date not set';
  if (c.week === 0) return `Program starts ${esc(fmtDate(state.settings.startDate))}`;
  return `Week ${c.week} · ${esc(phase(c.w, c.deload).label)}`;
}

function cardioMeter(c, compact = false) {
  const mon = mondayOf(c.today), sun = addDays(mon, 6);
  const min = cardioMinutes(state.cardio, mon, sun);
  const { cap, label } = cardioCap(c.w, c.deload);
  const pct = Math.min(100, Math.round((min / cap) * 100));
  let note;
  if (min > cap) note = 'Above this week’s cap. Keep the rest of the week easy; more is not better here.';
  else if (min >= cap * 0.85) note = 'Close to this week’s cap. Easy does it.';
  else note = 'Plenty of room. All of it optional.';
  return `<div class="meter-block" data-testid="cardio-meter">
    <div class="meter-row"><span>Cardio this week</span><strong><span data-testid="cardio-min">${min}</span> / ${cap} min</strong></div>
    <div class="meter ${min > cap ? 'over' : ''}"><span style="width:${pct}%"></span></div>
    ${compact ? '' : `<p class="muted small">Target ${esc(label)}. ${esc(note)} Keep one full rest day a week.</p>`}
  </div>`;
}

function talkButtons(name, value = 'talk') {
  return `<div class="seg seg3" role="radiogroup" aria-label="Talk test">${Object.entries(TALK).map(([k, v]) =>
    `<button type="button" class="${k === value ? 'on' : ''}" data-act="talk" data-name="${name}" data-val="${k}" aria-pressed="${k === value}">${v}</button>`).join('')}
    <input type="hidden" name="${name}" value="${value}"></div>`;
}

function cardioFields(prefix, { minutes = '', speed = '5.5', incline = '6' } = {}) {
  return `<div class="grid3">
    <label>Minutes<input name="${prefix}min" inputmode="numeric" autocomplete="off" value="${esc(minutes)}" data-testid="${prefix}min"></label>
    <label>Speed km/h<input name="${prefix}speed" inputmode="decimal" autocomplete="off" value="${esc(speed)}" data-testid="${prefix}speed"></label>
    <label>Incline %<input name="${prefix}incline" inputmode="decimal" autocomplete="off" value="${esc(incline)}" data-testid="${prefix}incline"></label>
  </div>`;
}

/* ================================================================== */
/* TODAY                                                                */
/* ================================================================== */
function todayChoice(c) {
  const rot = c.program.rotation;
  const next = nextInRotation(state.sessions, rot);
  if (ui.pickDay && rot.includes(ui.pickDay)) return { dayId: ui.pickDay, reason: 'picked', next };
  if (state.settings.scheduleMode === 'rotation') return { dayId: next, reason: 'rotation', next };
  const sched = (state.settings.schedule[state.settings.programId] || [])[weekdayIndex(c.today)];
  if (sched && rot.includes(sched)) return { dayId: sched, reason: 'scheduled', next };
  return { dayId: null, reason: 'rest', next };
}

export function viewToday() {
  const c = ctx();
  const s = state.settings;
  const mode = ui.mode || s.dayMode;
  let html = head('Today', `${esc(fmtDate(c.today))} · ${weekLine(c)}`);

  if (!isStandalone() && !state.meta.installTipDismissed) {
    html += `<section class="card tip" data-testid="install-tip"><h2>Put it on your Home Screen</h2>
      <p>In Safari: Share → <b>Add to Home Screen</b> → keep “Open as Web App” on. Data logged in a Safari tab stays in Safari and won’t move to the app, so start logging from the icon.</p>
      <div class="row"><a class="btn ghost" href="#plan-install">How to install</a><button class="ghost" data-act="dismiss-tip">Got it</button></div></section>`;
  }
  if (!s.startDate) {
    html += `<section class="card" data-testid="start-card"><h2>When did you start?</h2>
      <p>Set your program start date so the app can ease you in. Week 1 is lighter on purpose.</p>
      <div class="row"><button class="primary" data-act="start-today">I start today</button><a class="btn ghost" href="#plan">Pick a date</a></div></section>`;
  }
  if (c.deload) {
    html += `<section class="card banner deload" data-testid="deload-banner"><h2>Deload week</h2>
      <p>${esc(phase(c.w, true).note)} Don’t stop completely.</p>
      <button class="ghost" data-act="deload-off">Not this week</button></section>`;
  } else if (c.week && isDeload(s, c.w + 1)) {
    html += `<p class="note-line">Next week is a deload week: lighter on purpose.</p>`;
  }

  const stale = staleActive();
  const doneToday = state.sessions.filter((x) => x.finishedAt && x.date === c.today);
  if (stale) {
    html += staleCard(stale);
  } else if (doneToday.length && !ui.pickDay) {
    const last = doneToday[doneToday.length - 1];
    html += `<section class="card done-card" data-testid="done-today"><h2>Done for today</h2>
      <p class="big-num">${esc(last.dayName)} · ${durationMin(last)} min · ${setsDone(last)} sets</p>
      <p>Nice work. Eat, rest and sleep well.</p>
      <div class="row"><a class="btn ghost" href="#summary/${esc(last.id)}">See summary</a><button class="ghost" data-act="pick" data-day="${esc(todayChoice(c).next)}">Train again</button></div></section>`;
  } else {
    const ch = todayChoice(c);
    if (!ch.dayId) {
      html += `<section class="card rest-card" data-testid="rest-day"><h2>Rest day</h2>
        <p>An easy walk is fine. Recovery is where the work turns into results.</p>
        <button class="ghost wide" data-act="pick" data-day="${esc(ch.next)}" data-testid="train-anyway">Train anyway: ${esc(dayName(ch.next))} (next in rotation)</button></section>`;
    } else {
      html += sessionCard(ch, mode, c);
    }
  }

  // Morning walk quick action (always optional).
  html += `<section class="card"><div class="row between"><h2>Morning walk</h2>
    <button class="${ui.walkOpen ? 'ghost' : 'primary'}" data-act="walk-toggle" data-testid="walk-toggle">${ui.walkOpen ? 'Close' : 'Log a walk'}</button></div>
    ${ui.walkOpen ? `<form data-form="walk" class="stack" data-testid="walk-form">
      ${cardioFields('w-', { minutes: '30', speed: '5.5', incline: c.w <= 2 ? '4' : '6' })}
      ${talkButtons('w-talk')}
      <button class="primary wide" data-act="walk-save" data-testid="walk-save">Save walk</button></form>`
      : `<p class="muted small">Optional, never required. Talking pace, hands off the rails.</p>`}
  </section>`;

  // This week
  const mon = mondayOf(c.today), sun = addDays(mon, 6);
  const planned = state.settings.scheduleMode === 'rotation' ? c.program.rotation.length
    : s.schedule[s.programId].filter(Boolean).length;
  const done = sessionsBetween(state.sessions, mon, sun).length;
  html += `<section class="card" data-testid="week-card"><h2>This week</h2>
    <div class="meter-row"><span>Sessions</span><strong data-testid="week-sessions">${done} / ${planned}</strong></div>
    ${cardioMeter(c)}
  </section>`;

  const age = backupAgeDays(c.today);
  if (hasData() && (age === null || age >= 14)) {
    html += `<div class="note-row"><span class="note-line">${age === null ? 'No backup yet.' : `Last backup ${age} days ago.`} It takes a few seconds.</span><a class="btn ghost" href="#plan-backup" data-testid="backup-nudge">Export</a></div>`;
  }
  return html;
}

function staleCard(A) {
  const done = A.exercises.reduce((a, e) => a + (e.skipped ? 0 : e.sets.filter((x) => x.done).length), 0);
  const last = lastActivity(A);
  const end = endTimeFor(A);
  return `<section class="card banner stale" data-testid="stale-card">
    <h2>Unfinished workout from ${esc(fmtDate(A.date))}</h2>
    <p>${esc(A.dayName)} · ${done} set${done === 1 ? '' : 's'} ticked${done ? `, the last one at ${fmtTime(last)}` : ''}.</p>
    <p class="muted small">${done ? `Save as finished records it as ${Math.max(1, Math.round((end - A.startedAt) / 60000))} min, ending after the last ticked set and its rest.` : 'Nothing was ticked, so there is nothing to save.'} Then today’s session appears here.</p>
    <div class="row">${done ? `<button class="primary" data-act="stale-save" data-testid="stale-save">Save as finished</button>` : ''}
      <button class="ghost danger" data-act="discard" data-testid="stale-discard">Discard</button></div></section>`;
}

function sessionCard(ch, mode, c) {
  const day = getDay(ch.dayId);
  const full = estimateFor(ch.dayId, 'full', c), short = estimateFor(ch.dayId, 'short', c);
  const est = mode === 'short' ? short : full;
  const slots = slotsFor(day, mode);
  const dropped = day.slots.filter((sl) => !slots.includes(sl));
  const blocks = buildBlocks(slots);
  const fin = finisherFor(day, mode, c.deload);
  const reason = { scheduled: 'Scheduled for today', rotation: 'Next in rotation', picked: 'Chosen for today' }[ch.reason];
  const list = blocks.map((b) => {
    const items = b.items.map((sl, i) => {
      const exId = sl.id; const n = setsFor(sl, c.w, c.deload);
      return `<li><span class="lbl">${b.group && b.items.length > 1 ? `${esc(b.group)}${i + 1}` : ''}</span><span class="nm">${esc(exercise(exId).nameEn)}${sl.tier === 'optional' ? ' <em class="opt">optional</em>' : ''}</span><span class="sx">${n}×${sl.reps[0]}–${sl.reps[1]}${sl.perSide ? '/leg' : ''}</span></li>`;
    }).join('');
    return b.group && b.items.length > 1 ? `<li class="ss-group"><span class="ss-tag">Superset</span><ul>${items}</ul></li>` : items;
  }).join('');
  return `<section class="card session" data-testid="session-card" data-day="${esc(ch.dayId)}">
    <p class="eyebrow">${esc(reason)}</p>
    <h2 class="day-title">${esc(day.name)} <span class="es">${esc(day.nameEs)}</span></h2>
    <div class="seg" role="radiogroup" aria-label="Day length">
      <button class="${mode === 'full' ? 'on' : ''}" data-act="mode" data-mode="full" data-testid="mode-full" aria-pressed="${mode === 'full'}">Full day ≈${full.total} min</button>
      <button class="${mode === 'short' ? 'on' : ''}" data-act="mode" data-mode="short" data-testid="mode-short" aria-pressed="${mode === 'short'}">Short day ≈${short.total} min</button>
    </div>
    <div class="stat-row">
      <div class="stat"><span class="big-num" data-testid="estimate">${est.total}</span><span class="unit">min</span><span class="cap">≈ ${est.warmup} warm-up · ${est.strength} strength · ${est.finisher} finisher</span></div>
      <div class="stat"><span class="big-num rir" data-testid="target-rir">${weekRir(c.w, c.deload)}</span><span class="unit">RIR</span><span class="cap">reps in reserve this week</span></div>
    </div>
    <ul class="exlist" data-testid="exlist">${list}</ul>
    ${dropped.length ? `<p class="muted small">Short day skips: ${dropped.map((d) => esc(exercise(d.id).nameEn)).join(', ')}.</p>` : ''}
    <p class="small"><b>Warm-up:</b> 5 min easy cardio or mobility. <b>Finisher:</b> ${esc(fin.text)}.</p>
    <button class="primary huge" data-act="start" data-day="${esc(ch.dayId)}" data-testid="start">Start workout</button>
    <label class="other">Other session
      <select data-act-change="pick" data-testid="pick-day">${c.program.rotation.map((d) => `<option value="${d}" ${d === ch.dayId ? 'selected' : ''}>${esc(dayName(d))}</option>`).join('')}</select>
    </label>
  </section>`;
}

/* ================================================================== */
/* WORKOUT                                                              */
/* ================================================================== */
export function workoutBlocks(A) {
  // indices of exercises grouped by consecutive superset letter
  const blocks = [];
  A.exercises.forEach((e, i) => {
    const last = blocks[blocks.length - 1];
    if (e.group && last && last.group === e.group) last.idx.push(i);
    else blocks.push({ group: e.group, idx: [i] });
  });
  return blocks;
}
export const restForBlock = blockRestFor;

export function viewWorkout() {
  const A = state.active;
  const total = A.exercises.reduce((a, e) => a + (e.skipped ? 0 : e.sets.length), 0);
  const done = A.exercises.reduce((a, e) => a + (e.skipped ? 0 : e.sets.filter((x) => x.done).length), 0);
  let html = `<header class="wk-head" data-testid="workout-head">
    <div class="wk-title"><b>${esc(A.dayName)}</b> <span class="muted">${A.mode === 'short' ? 'Short' : 'Full'} · week ${A.week}${A.deload ? ' · deload' : ''}</span></div>
    <div class="wk-stats"><span class="clock" id="wk-clock" data-testid="clock">${fmtClock(Date.now() - A.startedAt)}</span>
      <span class="muted small" id="wk-eta">planned ≈${A.estimateMin ?? '–'} min · ends ~${fmtTime(A.startedAt + (A.estimateMin || 60) * 60000)}</span>
      <span class="muted small"><span data-testid="sets-done">${done}</span>/${total} sets</span>
      <span class="mini-rest" id="mini-rest" hidden></span></div>
  </header>`;
  html += `<section class="card warm ${A.warmupDone ? 'is-done' : ''}"><div class="row between"><div><h3>Warm-up · 5 min</h3><p class="muted small">Easy cardio or mobility. Then warm-up sets on the first lift for each muscle.</p></div>
    <button class="check ${A.warmupDone ? 'on' : ''}" data-act="warmup" aria-label="Warm-up done">✓</button></div></section>`;

  for (const b of workoutBlocks(A)) {
    const isSS = b.group && b.idx.length > 1;
    const rest = restForBlock(A, b.idx);
    const cards = b.idx.map((i, k) => exerciseCard(A, i, isSS ? `${b.group}${k + 1}` : '', rest, isSS)).join('');
    html += isSS
      ? `<section class="superset" data-testid="superset-${esc(b.group)}"><p class="ss-label">Superset ${esc(b.group)} · alternate ${b.idx.map((_, k) => `${esc(b.group)}${k + 1}`).join(' → ')}, then rest ${fmtRest(rest)}</p>${cards}</section>`
      : cards;
  }
  const fin = finisherFor({ leg: A.leg }, A.mode, A.deload);
  html += `<section class="card"><h3>Finisher</h3><p class="muted small">${esc(fin.text)}. You can log it after you finish.</p></section>
    <div class="stack finish-zone"><button class="primary huge" data-act="finish" data-testid="finish">Finish workout</button>
    <button class="ghost" data-act="discard">Discard this workout</button></div>`;
  return html;
}

function exerciseCard(A, i, label, rest, isSS) {
  const e = A.exercises[i];
  if (e.skipped) {
    return `<article class="ex-card skipped" data-testid="ex-${i}"><div class="row between"><div><h3>${esc(e.nameEn)}</h3><p class="es">${esc(e.nameEs)} · skipped</p></div>
      <button class="ghost" data-act="unskip" data-ex="${i}">Undo</button></div></article>`;
  }
  const step = Number(state.settings.increments[e.equipment]) || EQUIPMENT[e.equipment]?.step || 2.5;
  const last = lastPerformance(state.sessions, e.exId, A.startedAt);
  const hint = progressionHint({ last, reps: e.reps, kind: e.kind, equipment: e.equipment, step, easyWeek: A.week <= 1 || A.deload });
  const ramp = e.rampUp && !A.deload ? warmupRamp(e.sets[0]?.kg, step) : null;
  const rows = e.sets.map((st, j) => `<div class="set-row ${st.done ? 'done' : ''}" data-testid="set-${i}-${j}">
      <span class="n">${j + 1}</span>
      <input class="kg" inputmode="decimal" autocomplete="off" enterkeyhint="next" aria-label="kg set ${j + 1}" placeholder="kg" data-field="kg" data-ex="${i}" data-set="${j}" value="${st.kg == null ? '' : fmtNum(st.kg, 2)}">
      <span class="x">kg ×</span>
      <input class="reps" inputmode="numeric" autocomplete="off" enterkeyhint="done" aria-label="reps set ${j + 1}" placeholder="reps" data-field="reps" data-ex="${i}" data-set="${j}" value="${st.reps ?? ''}">
      <button class="check ${st.done ? 'on' : ''}" data-act="check" data-ex="${i}" data-set="${j}" aria-label="Set ${j + 1} done" data-testid="check-${i}-${j}">✓</button>
    </div>`).join('');
  return `<article class="ex-card" data-testid="ex-${i}" data-exid="${esc(e.exId)}">
    <div class="ex-head">${label ? `<span class="tag">${esc(label)}</span>` : ''}<div><h3>${esc(e.nameEn)}</h3><p class="es">${esc(e.nameEs)}</p></div></div>
    <p class="meta">${esc(e.muscles.join(', '))} · <b>${e.sets.length}×${e.reps[0]}–${e.reps[1]}${e.perSide ? ' per leg' : ''}</b> · <span class="rir-chip">RIR ${esc(e.rir)}</span> · rest ${fmtRest(rest)}${isSS ? ' after the pair' : ''}</p>
    ${last ? `<p class="last">Last time (${esc(fmtDate(last.date, false))}): ${last.sets.map((x) => `${fmtNum(x.kg)}×${x.reps}`).join(' · ')}</p>` : `<p class="last">First time: enter kg and reps, then tap ✓. Aim for ${e.reps[0]}–${e.reps[1]} reps.</p>`}
    <p class="hint tone-${hint.tone}" data-testid="hint-${i}">${esc(hint.text)}${hint.addKg && !e.applied && !e.sets.some((x) => x.done) ? ` <button class="mini" data-act="apply" data-ex="${i}" data-kg="${hint.addKg}">Apply</button>` : ''}</p>
    ${ramp ? `<p class="ramp">Warm-up sets: ${ramp.map((r) => `${fmtNum(r.kg)}×${r.reps}`).join(' · ')}</p>` : ''}
    <div class="sets">${rows}</div>
    ${e.note ? `<p class="ex-note">Note: ${esc(e.note)}</p>` : ''}
    <div class="ex-actions">
      <details class="cue"><summary>Technique</summary><p>${esc(exercise(e.exId)?.cue || '')}</p></details>
      <button class="ghost" data-act="swap" data-ex="${i}">Swap</button>
      <button class="ghost" data-act="note" data-ex="${i}">Note</button>
      <button class="ghost" data-act="skip" data-ex="${i}">Skip</button>
    </div>
  </article>`;
}

export function swapModal(i) {
  const e = state.active.exercises[i];
  const opts = swapOptions(e);
  return `<h2>Swap ${esc(e.nameEn)}</h2><p class="muted small">Same movement pattern and stretch position. Keep a swap for 4–6 weeks so you can track progress.</p>
    <div class="stack">${opts.map((id) => { const x = exercise(id); return `<button class="${id === e.exId ? 'primary' : 'ghost'} wide left" data-m="swap" data-val="${id}"><b>${esc(x.nameEn)}</b><br><span class="es">${esc(x.nameEs)}${id === e.baseExId ? ' · in the plan' : ''}</span></button>`; }).join('')}</div>
    <label class="check-line"><input type="checkbox" id="swap-remember" checked> Remember for the next 6 weeks</label>
    <div class="row end"><button class="ghost" data-m="cancel">Cancel</button></div>`;
}

export function noteModal(i) {
  const e = state.active.exercises[i];
  return `<h2>Note: ${esc(e.nameEn)}</h2><textarea id="note-text" rows="4" placeholder="e.g. seat at 4, felt easy">${esc(e.note)}</textarea>
    <div class="row end"><button class="ghost" data-m="cancel">Cancel</button><button class="primary" data-m="ok">Save</button></div>`;
}

/* ================================================================== */
/* SUMMARY                                                              */
/* ================================================================== */
export function viewSummary(id) {
  const S = state.sessions.find((s) => s.id === id);
  if (!S) return head('Summary') + `<p class="muted">Workout not found.</p>`;
  const dur = durationMin(S);
  const prs = findPRs(S, state.sessions);
  const tops = S.exercises.filter((e) => !e.skipped && e.sets.some((x) => x.done)).map((e) => {
    const t = topSet(e.sets.filter((x) => x.done)) || {};
    return `<li><span>${esc(e.nameEn)}</span><b>${fmtNum(t.kg)} kg × ${t.reps ?? '–'}</b></li>`;
  }).join('');
  const fin = finisherFor({ leg: S.leg }, S.mode, S.deload);
  const logged = state.cardio.find((c) => c.sessionId === S.id);
  return head('Workout done', `${esc(S.dayName)} · ${esc(fmtDate(S.date))}`) + `
    <section class="card" data-testid="summary">
      <div class="stat-row">
        <div class="stat"><span class="big-num" data-testid="sum-duration">${dur}</span><span class="unit">min</span></div>
        <div class="stat"><span class="big-num" data-testid="sum-sets">${setsDone(S)}</span><span class="unit">/ ${setsPlanned(S)} sets</span></div>
      </div>
      <h3>Top sets</h3><ul class="kv">${tops || '<li>No sets logged.</li>'}</ul>
      ${prs.length ? `<h3>Small wins</h3><ul class="wins" data-testid="prs">${prs.map((p) => `<li>${esc(p.text)}</li>`).join('')}</ul>` : ''}
      <p class="muted small">Good session. Consistency beats intensity.</p>
    </section>
    <section class="card" data-testid="finisher-card"><h2>Finisher cardio</h2>
      ${logged ? `<p data-testid="finisher-logged">Logged: ${logged.minutes} min at ${fmtNum(logged.speed)} km/h, ${fmtNum(logged.incline)} %.</p><a class="btn primary wide" href="#today">Back to Today</a>` : `
      <p class="muted small">Suggested: ${esc(fin.text)}.</p>
      <form data-form="finisher" class="stack">
        ${cardioFields('f-', { minutes: String(fin.min || ''), speed: S.leg ? '5' : '5.5', incline: S.leg ? '0' : '6' })}
        ${talkButtons('f-talk')}
        <div class="row"><button class="ghost" data-act="finisher-skip">Skipped it</button><button class="primary" data-act="finisher-save" data-id="${esc(S.id)}" data-testid="finisher-save">Save finisher</button></div>
      </form>`}
    </section>`;
}

/* ================================================================== */
/* LOG                                                                  */
/* ================================================================== */
export function viewLog() {
  const c = ctx();
  const recentCardio = [...state.cardio].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)).slice(0, 12);
  const wc = weeklyChange(state.body, c.today);
  const ra = rollingAverage(state.body, c.today);
  const latest = ra[ra.length - 1];
  const weights = ra.slice(-10).reverse();
  const waists = state.body.filter((b) => typeof b.waistCm === 'number').sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  return head('Log', 'Cardio, body weight and waist. Everything stays on this phone.') + `
  <section class="card" id="log-cardio"><h2>Cardio</h2>${cardioMeter(c, true)}
    <form data-form="cardio" class="stack" data-testid="cardio-form">
      <div class="grid2">
        <label>Type<select name="c-type"><option>Incline walk</option><option>Walk</option><option>Bike</option><option>Other</option></select></label>
        <label>When<select name="c-kind"><option value="am-walk">Morning walk</option><option value="finisher">Finisher</option><option value="other">Other</option></select></label>
      </div>
      <label>Date<input type="date" name="c-date" value="${c.today}" max="${c.today}"></label>
      ${cardioFields('c-', { minutes: '', speed: '5.5', incline: '6' })}
      ${talkButtons('c-talk')}
      <button class="primary wide" data-act="cardio-save" data-testid="cardio-save">Save cardio</button>
    </form>
    <ul class="entries" data-testid="cardio-list">${recentCardio.map((x) => `<li><span>${esc(fmtDate(x.date))} · ${esc(KIND_LABEL[x.kind] || x.kind)}<br><small class="muted">${esc(x.type || '')} · ${x.minutes} min · ${fmtNum(x.speed)} km/h · ${fmtNum(x.incline)} % · ${esc(TALK[x.talk] || '')}</small></span><button class="icon" data-act="del-cardio" data-id="${esc(x.id)}" aria-label="Delete">×</button></li>`).join('') || '<li class="muted">No cardio logged yet.</li>'}</ul>
  </section>

  <section class="card" id="log-weight"><h2>Body weight</h2>
    <p class="muted small">3–4 morning weigh-ins a week, same routine. The 7-day average matters, not single days.</p>
    <form data-form="weight" class="grid2 align-end" data-testid="weight-form">
      <label>Date<input type="date" name="bw-date" value="${c.today}" max="${c.today}"></label>
      <label>Weight kg<input name="bw-kg" inputmode="decimal" autocomplete="off" placeholder="e.g. 80,4" data-testid="bw-kg"></label>
      <button class="primary wide span2" data-act="weight-save" data-testid="weight-save">Save weight</button>
    </form>
    ${latest ? `<div class="stat-row">
      <div class="stat"><span class="big-num" data-testid="avg7">${fmtNum(latest.avg7, 1)}</span><span class="unit">kg</span><span class="cap">7-day average</span></div>
      <div class="stat"><span class="big-num ${wc.status}" data-testid="weekly-pct">${wc.pct === null ? '—' : (wc.pct > 0 ? '+' : '') + fmtNum(wc.pct, 2)}</span><span class="unit">%/wk</span><span class="cap">target −0.5 to −0.7</span></div>
    </div>` : ''}
    <p class="guidance ${wc.status}" data-testid="weight-guidance">${esc(wc.message)}</p>
    <ul class="entries" data-testid="weight-list">${weights.map((w) => `<li><span>${esc(fmtDate(w.date))}<br><small class="muted">7-day avg ${fmtNum(w.avg7, 1)}</small></span><b>${fmtNum(w.kg)} kg</b><button class="icon" data-act="del-weight" data-date="${w.date}" aria-label="Delete">×</button></li>`).join('')}</ul>
  </section>

  <section class="card" id="log-waist"><h2>Waist <span class="muted small">(optional, weekly)</span></h2>
    <p class="muted small">Once a week, at the navel, same morning routine.</p>
    <form data-form="waist" class="grid2 align-end">
      <label>Date<input type="date" name="w-date" value="${c.today}" max="${c.today}"></label>
      <label>Waist cm<input name="w-cm" inputmode="decimal" autocomplete="off" placeholder="e.g. 88,5" data-testid="waist-cm"></label>
      <button class="primary wide span2" data-act="waist-save" data-testid="waist-save">Save waist</button>
    </form>
    <ul class="entries">${waists.map((w) => `<li><span>${esc(fmtDate(w.date))}</span><b>${fmtNum(w.waistCm)} cm</b><button class="icon" data-act="del-waist" data-date="${w.date}" aria-label="Delete">×</button></li>`).join('')}</ul>
  </section>`;
}

/* ================================================================== */
/* HISTORY                                                              */
/* ================================================================== */
const TREND_LIFTS = ['bench', 'squat', 'rdl', 'incline-db-press', 'hip-thrust', 'leg-press', 'cs-row', 'db-shoulder-press', 'lat-pulldown', 'neutral-pulldown', 'cable-row', 'machine-press', 'hack-squat'];

export function viewHistory() {
  const c = ctx();
  const weeks = weeklySummaries(state, c.today, 8);
  const ra = rollingAverage(state.body, c.today);
  const sessions = state.sessions.filter((s) => s.finishedAt).sort((a, b) => b.startedAt - a.startedAt);
  const bwChart = lineChart({ label: 'Body weight', unit: 'kg', series: [
    { points: ra.map((r) => ({ date: r.date, y: r.kg })), cls: 'raw', dots: true, line: false },
    { points: ra.map((r) => ({ date: r.date, y: r.avg7 })), cls: 'avg' },
  ] });
  const trends = TREND_LIFTS.map((id) => ({ id, pts: liftTrend(state.sessions, id) })).filter((t) => t.pts.length >= 2);
  return head('History') + `
  <section class="card"><h2>Weeks</h2>${weeks.length ? `<table class="weeks" data-testid="weeks"><thead><tr><th>Week of</th><th>Sessions</th><th>Sets</th><th>Cardio</th><th>Avg kg</th></tr></thead><tbody>
    ${weeks.map((w) => `<tr><td>${esc(fmtDate(w.monday, false))}</td><td>${w.sessions}</td><td>${w.sets}</td><td>${w.cardio}′</td><td>${w.avgWeight ? fmtNum(w.avgWeight, 1) : '—'}</td></tr>`).join('')}
    </tbody></table>` : '<p class="muted">Nothing logged yet.</p>'}</section>
  <section class="card" data-testid="bw-chart"><h2>Body weight</h2><p class="legend"><span class="dot raw"></span> weigh-ins <span class="dot avg"></span> 7-day average</p>${bwChart}</section>
  <section class="card" data-testid="lift-charts"><h2>Top sets</h2><p class="muted small">Heaviest set per workout. Slow and steady is the goal while you lose fat.</p>
    ${trends.length ? trends.map((t) => { const l = t.pts[t.pts.length - 1]; return `<div class="trend"><p class="row between"><b>${esc(exercise(t.id).nameEn)}</b><span class="muted small">latest ${fmtNum(l.y)} kg × ${l.reps}</span></p>${lineChart({ label: exercise(t.id).nameEn, series: [{ points: t.pts, cls: 'lift', dots: true }], height: 120 })}</div>`; }).join('') : '<p class="muted small">Charts appear after two workouts with the same lift.</p>'}
  </section>
  <section class="card"><h2>Workouts</h2><ul class="entries" data-testid="session-list">${sessions.map((s) => `<li><a class="row-link" href="#session/${esc(s.id)}"><span>${esc(fmtDate(s.date))} · <b>${esc(s.dayName)}</b><br><small class="muted">${s.mode === 'short' ? 'Short' : 'Full'} · ${durationMin(s)} min · ${setsDone(s)} sets${s.deload ? ' · deload' : ''}</small></span><span aria-hidden="true">›</span></a></li>`).join('') || '<li class="muted">No workouts yet.</li>'}</ul></section>`;
}

export function viewSession(id) {
  const S = state.sessions.find((s) => s.id === id);
  if (!S) return head('Workout') + `<p class="muted">Not found.</p>`;
  const cardio = state.cardio.filter((x) => x.sessionId === S.id);
  return head(S.dayName, `${esc(fmtDate(S.date))} · week ${S.week} · ${S.mode === 'short' ? 'Short' : 'Full'} · ${durationMin(S)} min`) + `
    <section class="card" data-testid="session-detail">${S.exercises.map((e) => `<div class="det-ex"><p><b>${esc(e.nameEn)}</b> <span class="es">${esc(e.nameEs)}</span></p>
      ${e.skipped ? '<p class="muted small">Skipped</p>' : `<p class="small">${e.sets.filter((x) => x.done).map((x) => `${fmtNum(x.kg)}×${x.reps}`).join(' · ') || '<span class="muted">no sets</span>'} <span class="muted">· RIR ${esc(e.rir)}</span></p>`}
      ${e.note ? `<p class="ex-note">Note: ${esc(e.note)}</p>` : ''}</div>`).join('')}
      ${cardio.map((x) => `<p class="small">Finisher: ${x.minutes} min · ${fmtNum(x.speed)} km/h · ${fmtNum(x.incline)} %</p>`).join('')}
    </section>
    <div class="row"><a class="btn ghost" href="#history">Back</a><button class="ghost danger" data-act="del-session" data-id="${esc(S.id)}">Delete workout</button></div>`;
}

/* ================================================================== */
/* PLAN / SETTINGS                                                      */
/* ================================================================== */
export function viewPlan() {
  const c = ctx();
  const s = state.settings;
  const prog = PROGRAMS[s.programId];
  const sched = s.schedule[s.programId];
  const age = backupAgeDays(c.today);
  const dayOpts = (cur) => `<option value="">Rest</option>` + prog.rotation.map((d) => `<option value="${d}" ${d === cur ? 'selected' : ''}>${esc(dayName(d))}</option>`).join('');
  const overview = prog.rotation.map((d) => {
    const day = getDay(d); const f = estimateFor(d, 'full', c), sh = estimateFor(d, 'short', c);
    return `<details class="plan-day"><summary><b>${esc(day.name)}</b> <span class="es">${esc(day.nameEs)}</span><span class="right">Full ≈${f.total} · Short ≈${sh.total} min</span></summary>
      <ul class="plain">${day.slots.map((sl) => `<li>${sl.group ? `<span class="tag sm">${esc(sl.group)}</span> ` : ''}${esc(sl.nameEn)} <span class="muted">${sl.sets}×${sl.reps[0]}–${sl.reps[1]}${sl.perSide ? '/leg' : ''} · ${sl.kind}${sl.tier === 'optional' ? ' · optional' : ''}</span></li>`).join('')}</ul></details>`;
  }).join('');
  return head('Plan', 'Settings, backup and help') + `
  <section class="card" id="plan-program"><h2>Program</h2>
    <label>Program start date<input type="date" data-setting="startDate" value="${esc(s.startDate || '')}" data-testid="start-date"></label>
    <p class="muted small">${weekLine(c)}. Week 1 is about 2/3 of the sets at RIR 3–4; weeks 2–3 full sets at RIR 2–3; week 4+ RIR 1–2 (squat, RDL, Bulgarian and bench stay at 2).</p>
    <label>Program<select data-setting="programId" data-testid="program">
      ${Object.values(PROGRAMS).map((p) => `<option value="${p.id}" ${p.id === s.programId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <p class="label">Which session when</p>
    <div class="seg"><button class="${s.scheduleMode === 'fixed' ? 'on' : ''}" data-act="set" data-key="scheduleMode" data-val="fixed">Fixed weekdays</button><button class="${s.scheduleMode === 'rotation' ? 'on' : ''}" data-act="set" data-key="scheduleMode" data-val="rotation" data-testid="mode-rotation">Next in rotation</button></div>
    <p class="muted small">${s.scheduleMode === 'rotation' ? 'Today always shows the session after the last one you did. Missed days just shift.' : 'Missed a day? On a rest day, “Train anyway” picks up the next session in the rotation.'}</p>
    ${s.scheduleMode === 'fixed' ? `<div class="sched">${WEEKDAYS.map((wd, i) => `<label>${wd}<select data-sched="${i}">${dayOpts(sched[i])}</select></label>`).join('')}</div>` : ''}
    <p class="label">Default day length</p>
    <div class="seg"><button class="${s.dayMode === 'full' ? 'on' : ''}" data-act="set" data-key="dayMode" data-val="full" data-testid="daymode-full">Full ≈${estimateRange(s.programId, { mode: 'full', week: c.w, deload: c.deload, restOverride: s.restOverride })} min</button><button class="${s.dayMode === 'short' ? 'on' : ''}" data-act="set" data-key="dayMode" data-val="short" data-testid="daymode-short">Short ≈${estimateRange(s.programId, { mode: 'short', week: c.w, deload: c.deload, restOverride: s.restOverride })} min</button></div>
    <p class="muted small">Estimates for this program week, including warm-up and finisher.</p>
    <label>Deload every<select data-setting="deloadEvery">${[6, 7, 8, 9].map((n) => `<option value="${n}" ${n === Number(s.deloadEvery) ? 'selected' : ''}>${n} weeks (week ${n}, ${n * 2}, …)</option>`).join('')}</select></label>
    <button class="ghost wide" data-act="deload-toggle" data-testid="deload-toggle">${c.deload ? 'End the deload this week' : 'Make this week a deload'}</button>
    <p class="muted small">Deload sooner if lifts stall 2 sessions in a row or joints ache: about half the sets at RIR 3–4, cardio a third less. Don’t stop completely.</p>
  </section>

  <section class="card"><h2>Your sessions</h2><p class="muted small">Estimates for this week, including 5 min warm-up and the finisher.</p>${overview}</section>

  <section class="card"><h2>Weight steps</h2><p class="muted small">Smallest jump per equipment type, used by the “try +X kg” hints.</p>
    <div class="grid2">${Object.entries(EQUIPMENT).map(([k, v]) => `<label>${esc(v.label)}<input inputmode="decimal" data-inc="${k}" value="${fmtNum(s.increments[k])}"></label>`).join('')}</div></section>

  <section class="card"><h2>Rest times</h2><p class="muted small">Leave empty to use the plan (main lifts 2–3 min, others 90 s–2 min, isolation 60–90 s). Never below 60 s.</p>
    <div class="grid3">${[['M', 'Main lifts'], ['C', 'Compounds'], ['I', 'Isolation']].map(([k, l]) => `<label>${l} (s)<input inputmode="numeric" data-rest="${k}" value="${s.restOverride[k] ?? ''}" placeholder="plan"></label>`).join('')}</div></section>

  <section class="card"><h2>Sound</h2>
    <label class="check-line"><input type="checkbox" data-setting-bool="sound" ${s.sound ? 'checked' : ''}> Beep when rest is over</label>
    <label class="check-line"><input type="checkbox" data-setting-bool="soundOverSilent" ${s.soundOverSilent ? 'checked' : ''}> Beep even in silent mode (may pause your music)</label>
    <p class="muted small">iPhone web apps can’t vibrate or notify in the background. Keep the app open: the screen stays on during a workout and flashes when rest is over.</p></section>

  <section class="card" id="plan-backup"><h2>Backup</h2>
    <p data-testid="backup-age">${age === null ? 'No backup yet.' : age === 0 ? 'Last backup: today.' : `Last backup: ${age} day${age === 1 ? '' : 's'} ago.`}${age === null || age >= 14 ? ' <b>Time for one.</b>' : ''}</p>
    <p class="muted small">Your logs live only on this phone. Export a backup about once a week and save it to Files or iCloud Drive.</p>
    <div class="row"><button class="primary" data-act="export" data-testid="export">Export backup</button>
      <label class="btn ghost file-btn">Import backup<input type="file" accept="application/json,.json" data-act-change="import" data-testid="import"></label></div>
  </section>

  <section class="card"><h2>Reset</h2>
    <button class="ghost danger wide" data-act="reset" data-testid="reset">Reset all data</button></section>

  <section class="card safety" data-testid="safety"><h2>Safety</h2>
    <p>Stop and seek medical care for <b>chest pain, palpitations, fainting, marked dizziness or unusual breathlessness</b>. Joint pain that changes how you move is a reason to back off, not push through.</p>
    <p class="muted small">This app is a training log, not medical advice.</p></section>

  <section class="card" id="plan-install"><h2>Install on iPhone</h2><ol class="steps">
    <li>Open this page in <b>Safari</b>.</li><li>Tap <b>Share</b> (in the ••• menu next to the address bar).</li>
    <li>Tap <b>Add to Home Screen</b>, keep <b>Open as Web App</b> on, then <b>Add</b>.</li>
    <li>Open Lean Split from the icon. It works offline after the first visit.</li></ol>
    <p class="muted small">The installed app has its own storage, separate from Safari. Anything logged in a Safari tab stays there.</p></section>

  <section class="card"><h2>About</h2><p class="small">Lean Split <span data-testid="version">${APP_VERSION}</span> · storage: ${esc(state.meta.storeKind || '')}${state.meta.persisted === true ? ', persistent' : state.meta.persisted === false ? ', best effort' : ''}${isStandalone() ? ' · installed' : ' · in browser'}</p>
    <button class="ghost wide" data-act="check-update">Check for updates</button></section>`;
}
