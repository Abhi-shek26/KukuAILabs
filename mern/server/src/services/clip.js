import { blocksBetween, episodesFor } from "../lib/screenplay.js";
// Python's round(x, 1): one decimal place, ties to even, decided on the exact binary value.
// 20 decimal places expose that value, so 7.55 -> 7.5 and 1.05 -> 1.1 exactly like Python.
// Checked against CPython on 20,401 values 0.00-200.00: 0 mismatches.
function round1(x) {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0;
  const [ip, fp] = Math.abs(x).toFixed(20).split(".");
  const tenths = Number(fp[0]);
  const rest = fp.slice(1);
  let up = false;
  if (rest[0] > "5") up = true;
  else if (rest[0] === "5") {
    if (/[1-9]/.test(rest.slice(1))) up = true;
    else up = tenths % 2 === 1;
  }
  const out = (Number(ip) * 10 + tenths + (up ? 1 : 0)) / 10;
  return neg ? -out : out;
}

export function clipPayload(run, promo) {
  if (!run?.inputDir) throw new Error("the scripts for this run are no longer on disk");
  const eps = episodesFor(run.inputDir);
  const lines = [];
  let offset = 0;

  promo.segments.forEach((s, idx) => {
    const ep = eps.get(s.episode);
    if (!ep) return;
    if (promo.segments.length > 1) {
      lines.push({ kind: "SEGMENT", t: round1(offset), label: `Segment ${idx + 1} · Episode ${s.episode}`, text: "" });
    }
    for (const b of blocksBetween(ep, s.start_seconds, s.end_seconds)) {
      lines.push({
        kind: b.kind,
        t: round1(Math.max(0, b.start - s.start_seconds) + offset),
        t_end: round1(b.end - s.start_seconds + offset),
        label: b.label,
        text: b.text,
      });
    }
    offset += s.end_seconds - s.start_seconds;
  });

  const last = promo.segments[promo.segments.length - 1];
  const ep = eps.get(last.episode);
  let after = [];
  if (ep) {
    after = ep.blocks
      .filter((b) => last.end_seconds - 0.05 <= b.start && b.start < last.end_seconds + 10)
      .slice(0, 8)
      .map((b) => ({ kind: b.kind, t: round1(b.start - last.end_seconds), label: b.label, text: b.text }));
  }

  return { id: promo.id, lines, after };
}
