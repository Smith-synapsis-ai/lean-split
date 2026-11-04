# Lean Split

A small, offline-first workout log for an iPhone home screen. It is a calm upper/lower training
companion: lose fat, keep the muscle, about an hour in the gym, then get on with your day.

**Open it:** https://smith-synapsis-ai.github.io/lean-split/

## Install on iPhone (iOS 26)
1. Open the link above in **Safari**.
2. Tap **Share** (in the ••• menu next to the address bar).
3. Tap **Add to Home Screen**, keep **Open as Web App** on, then tap **Add**.
4. Open Lean Split from the icon. After the first visit it works without internet.

The installed app has its own storage, separate from Safari. Log from the icon, not from a Safari tab.

## What it does
- **Today**: the session for today (or a rest day), Full (about 50–60 min) or Short (about 30–40 min) with a
  live time estimate, the target RIR for this program week, deload reminders, an optional morning-walk log and a
  weekly cardio meter.
- **Workout**: exercise cards in order with supersets grouped, weight × reps prefilled from last time,
  a rest timer that starts on ✓ (after the pair in a superset), +30 s / Skip, a beep and a screen flash,
  the screen kept awake, double-progression hints, swap / note / skip, and a summary with the cardio finisher.
- **Log**: cardio (type, minutes, km/h, incline, talk test), body weight with a 7-day average and weekly
  % change against a 0.5–0.7 %/week band, and an optional weekly waist measurement.
- **History**: weekly summaries, workouts, and inline-SVG charts (body weight + 7-day average, top sets).
- **Plan**: start date, program (4-day upper/lower or 3-day full body), schedule or rotation, default day
  length, deload interval, weight steps, rest overrides, sound, JSON backup export/import, reset, safety
  and install help.

## Privacy
There is no server, account or tracking. Everything you log stays in this browser's IndexedDB on your
phone. Back it up with **Plan → Export backup** (share sheet → Save to Files). This repository contains
only the app and a generic program; it holds no personal data.

## Tech
Plain HTML, CSS and JavaScript ES modules: no build step, no frameworks, no CDN.

| File | Role |
|---|---|
| `index.html`, `styles.css` | App shell and styles (dark, safe-area aware, 16 px+ inputs) |
| `js/program.js` | Exercise catalogue, days, ramp-up/RIR/deload rules, time estimates, cardio cap |
| `js/state.js` | In-memory state, persistence, workout builder, backup validation |
| `js/store.js` | Tiny IndexedDB wrapper (localStorage fallback), `navigator.storage.persist()` |
| `js/views.js` | Screens rendered as HTML strings |
| `js/app.js` | Router, events, workout flow, rest-timer UI, export/import, service-worker updates |
| `js/stats.js` | Pure functions: progression hints, PRs, 7-day average, weekly summaries |
| `js/timer.js` | Timestamp-based rest timer, Web Audio beep, Screen Wake Lock |
| `js/charts.js` | Inline SVG line charts |
| `sw.js` | Versioned offline cache; the update banner appears when a new version is deployed |

### Releasing a change
Bump `VERSION` in `sw.js` **and** `APP_VERSION` in `js/version.js` (keep them equal), then push to `main`.
Open apps show **"Update available. Tap to refresh"** the next time they come to the foreground.

### Robustness
- An unfinished workout older than 4 hours (or from an earlier day) is not resumed silently: Today offers
  "Save as finished" (ending after the last ticked set and its rest) or "Discard". Durations are capped at 4 h.
- Imported backups are validated deeply (types, ranges, known exercises and days); stored data is
  sanitised on load, and a screen that still fails shows a recovery card instead of hanging.

### Known iOS limits
No vibration API on iOS; web apps can't schedule local notifications, so the rest alert (beep + flash)
only works while the app is open. The screen is kept awake during a workout (iOS 18.4+ for home-screen apps).
By default, the beep follows the silent switch. A setting lets it play in silent mode, but that may pause your music.

Not medical advice. Stop and seek care for chest pain, palpitations, fainting, marked dizziness or unusual breathlessness.
