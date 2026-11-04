// charts.js: tiny inline-SVG line charts (no chart library).
import { esc, fmtDate, fmtNum, daysBetween } from './util.js';

/**
 * lineChart({ series: [{ points: [{date, y}], cls, dots, line }], unit, height })
 * x = calendar day, y = value. Returns an SVG string.
 */
export function lineChart({ series, unit = '', height = 170, label = 'chart' }) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return `<p class="muted small">Not enough data for a chart yet (needs 2 entries).</p>`;
  const W = 400, H = height, padL = 40, padR = 10, padT = 12, padB = 24;
  const dates = all.map((p) => p.date).sort();
  const d0 = dates[0], d1 = dates[dates.length - 1];
  const span = Math.max(1, daysBetween(d0, d1));
  let yMin = Math.min(...all.map((p) => p.y)), yMax = Math.max(...all.map((p) => p.y));
  if (yMax - yMin < 1) { yMin -= 0.5; yMax += 0.5; }
  const padY = (yMax - yMin) * 0.12; yMin -= padY; yMax += padY;
  const x = (d) => padL + (daysBetween(d0, d) / span) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);

  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" preserveAspectRatio="none">`;
  // grid + y labels (min, mid, max)
  [0, 0.5, 1].forEach((f) => {
    const v = yMin + f * (yMax - yMin), yy = y(v);
    out += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`;
    out += `<text class="axis" x="${padL - 6}" y="${(yy + 4).toFixed(1)}" text-anchor="end">${fmtNum(v, 1)}</text>`;
  });
  out += `<text class="axis" x="${padL}" y="${H - 6}">${esc(fmtDate(d0, false))}</text>`;
  out += `<text class="axis" x="${W - padR}" y="${H - 6}" text-anchor="end">${esc(fmtDate(d1, false))}</text>`;
  for (const s of series) {
    const pts = [...s.points].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (s.line !== false && pts.length > 1) {
      out += `<polyline class="${s.cls || 'line'}" fill="none" points="${pts.map((p) => `${x(p.date).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')}"/>`;
    }
    if (s.dots) for (const p of pts) out += `<circle class="${s.cls || 'line'}-dot" cx="${x(p.date).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="3"/>`;
  }
  out += `</svg>`;
  if (unit) out = `<div class="chart-wrap">${out}<span class="chart-unit">${esc(unit)}</span></div>`;
  return out;
}
