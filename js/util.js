// util.js: small helpers for dates, numbers and HTML.

/** Escape text for safe use inside HTML templates. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Dates: local calendar days as 'YYYY-MM-DD' strings ---------- */
const pad = (n) => String(n).padStart(2, '0');
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
/** Whole days from a to b (b - a), DST-safe. */
export function daysBetween(a, b) {
  const ua = Date.UTC(...a.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))));
  const ub = Date.UTC(...b.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))));
  return Math.round((ub - ua) / 86400000);
}
/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso) { return (parseISO(iso).getDay() + 6) % 7; }
export function mondayOf(iso) { return addDays(iso, -weekdayIndex(iso)); }
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(iso, withWeekday = true) {
  if (!iso) return '';
  const d = parseISO(iso);
  return `${withWeekday ? WEEKDAYS[weekdayIndex(iso)] + ' ' : ''}${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/* ---------- Numbers ---------- */
/** Accepts "62,5" and "62.5". Returns null for empty, NaN for junk. */
export function parseDecimal(str) {
  if (str === null || str === undefined) return null;
  const t = String(str).trim().replace(/\s+/g, '').replace(',', '.');
  if (t === '') return null;
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return parseFloat(t);
}
export function parseIntSafe(str) {
  const n = parseDecimal(str);
  return n === null || Number.isNaN(n) ? n : Math.round(n);
}
/** Decimal separator of the phone's language ("," on a Spanish iPhone). */
export const DECIMAL = (() => {
  try { return new Intl.NumberFormat(navigator.language || 'en').format(1.5).includes(',') ? ',' : '.'; } catch { return '.'; }
})();
/** 62.5 -> "62.5" (or "62,5" on a comma locale), 60 -> "60". Never throws. */
export function fmtNum(n, maxDec = 1) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const s = String(Math.round(n * 10 ** maxDec) / 10 ** maxDec);
  return DECIMAL === ',' ? s.replace('.', ',') : s;
}
export const isISODate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
export function fmtClock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}
export function fmtRest(sec) { return fmtClock(sec * 1000); }
export function fmtTime(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
