// timer.js: rest timer, beep and screen wake lock.
//
// iOS suspends JavaScript when the screen locks or the app is in the
// background, so the timer never counts ticks: it stores the end time
// (a timestamp) and recomputes the remaining time on every tick and when
// the app becomes visible again. The end is signalled by a beep (Web Audio,
// unlocked by the "Start workout" tap) and a full-screen colour flash.
// iOS has no Vibration API, and web apps cannot schedule local notifications.

export class RestTimer {
  constructor({ onTick, onDone }) {
    this.onTick = onTick; this.onDone = onDone;
    this.endsAt = null; this.total = 0; this.label = '';
    this.handle = null;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.tick(); });
  }
  get running() { return this.endsAt !== null; }
  remainingMs() { return this.endsAt === null ? 0 : Math.max(0, this.endsAt - Date.now()); }
  start(seconds, label = '') {
    this.total = seconds; this.label = label;
    this.endsAt = Date.now() + seconds * 1000;
    this.loop();
    this.tick();
  }
  /** Restore after a reload. A timer that already ran out is dropped silently. */
  restore(endsAt, total, label) {
    if (!endsAt || endsAt <= Date.now()) { this.stop(); return false; }
    this.endsAt = endsAt; this.total = total; this.label = label || '';
    this.loop(); this.tick();
    return true;
  }
  add(seconds) {
    if (this.endsAt === null) return;
    this.endsAt += seconds * 1000; this.total += seconds;
    this.tick();
  }
  stop() {
    this.endsAt = null;
    if (this.handle) { clearInterval(this.handle); this.handle = null; }
    this.onTick && this.onTick(this);
  }
  loop() { if (!this.handle) this.handle = setInterval(() => this.tick(), 250); }
  tick() {
    if (this.endsAt === null) return;
    const rem = this.remainingMs();
    this.onTick && this.onTick(this);
    if (rem <= 0) {
      this.endsAt = null;
      if (this.handle) { clearInterval(this.handle); this.handle = null; }
      this.onDone && this.onDone(this);
    }
  }
}

/* ---------------- Web Audio beep ---------------- */
let audioCtx = null;
/** Call from a user gesture (the Start tap) so iOS allows sound later. */
export function unlockAudio(overSilent = false) {
  try {
    // ambient (default) mixes with music and obeys the silent switch;
    // playback plays through silent mode but may pause other audio.
    if (navigator.audioSession) navigator.audioSession.type = overSilent ? 'playback' : 'ambient';
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    // A silent blip to fully unlock output on iOS.
    const buf = audioCtx.createBuffer(1, 1, 22050);
    const src = audioCtx.createBufferSource();
    src.buffer = buf; src.connect(audioCtx.destination); src.start(0);
  } catch { /* sound is a nice-to-have */ }
}
export function beep() {
  try {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((dt, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = i === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0 + dt); o.stop(t0 + dt + 0.2);
    });
  } catch { /* ignore */ }
}

/* ---------------- Screen Wake Lock ---------------- */
// Supported in iOS Home Screen web apps from iOS 18.4. Released by the
// system when the app is hidden, so we re-request on visibilitychange.
let sentinel = null;
let wanted = false;
export async function keepAwake(on) {
  wanted = on;
  try {
    if (on && 'wakeLock' in navigator && !sentinel && document.visibilityState === 'visible') {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => { sentinel = null; });
    } else if (!on && sentinel) {
      await sentinel.release(); sentinel = null;
    }
  } catch { sentinel = null; }
}
document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') keepAwake(true);
});
export function wakeLockActive() { return !!sentinel; }
