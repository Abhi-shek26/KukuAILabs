// UI helpers, ported 1:1 from the vanilla JS in promo_finder/web/index.html so the
// numbers, gradients and labels are byte-identical to the Python-built page.

export const fmtTs = (s) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
};

export const mmss = (s) => {
  s = Math.round(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const fmtDur = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 90 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);

export const money = (v) => (v == null ? "–" : v === 0 ? "$0" : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);

const PALETTES = [
  ["#3b0a12", "#a3122a"], ["#170f33", "#5b2a9c"], ["#06202f", "#0f6a8a"], ["#2a1204", "#b4500d"],
  ["#0b261d", "#12775a"], ["#2b0920", "#9c1f6b"], ["#1d1d1d", "#5a5a5a"], ["#30060a", "#ec1c24"],
];

// A cinematic gradient per promo, stable because it is derived from the id.
export function art(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = PALETTES[h % PALETTES.length];
  const ang = 140 + (h % 70);
  return { background: `radial-gradient(120% 70% at ${20 + (h % 60)}% 18%, ${b} 0%, transparent 60%), linear-gradient(${ang}deg, ${a}, #050505 92%)` };
}

export function firstLine(p) {
  const t = (p.script_first_3s || p.hook || "").trim();
  const m = t.match(/^([A-Z][A-Z .'’()-]{1,40}):\s*(.*)$/);
  if (m) return { text: m[2].replace(/^["“]|["”]$/g, ""), speech: true };
  return { text: t.replace(/^\[(camera|action|sfx)\]\s*/i, ""), speech: false };
}

export const epLabel = (p) => {
  const eps = [...new Set(p.segments.map((s) => s.episode))];
  return eps.length > 1 ? `EP ${eps[0]}→${eps[eps.length - 1]}` : `EP ${eps[0]}`;
};

export const segShort = (p) =>
  p.segments.length > 1
    ? `${p.segments.length} moments · ${epLabel(p).replace("EP", "Ep")}`
    : `Ep ${p.segments[0].episode} · ${p.segments[0].start.slice(0, 5)} → ${p.segments[0].end.slice(0, 5)}`;

export const PlayIcon = ({ fill = "#000" }) => (
  <svg viewBox="0 0 10 12">
    <path d="M0 0l10 6-10 6z" fill={fill} />
  </svg>
);
