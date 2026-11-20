// The editor sheet: identical columns and ordering to the Python server's export.
const cell = (v) => (v == null ? "" : String(v));

export function editorCsv(promos, reviews, runName) {
  const head = [
    "rank", "id", "type", "title", "segments", "duration_s", "hook", "cliffhanger", "why_it_works",
    "judge_hook", "judge_cliffhanger", "judge_standalone", "judge_verdict", "flags", "score",
    "editor_verdict", "editor_note",
  ];
  const rows = promos.map((p) => {
    const j = p.judge || {};
    const r = reviews[p.id] || {};
    const dur = Number(p.duration_seconds);
    const score = Number(p.score); // Python writes a float, so 8.0 keeps its .0
    const segs = p.segments.map((s) => `Ep ${s.episode} ${s.start}-${s.end}`).join("; ");
    return [
      p.rank, p.id, p.kind, p.title, segs, dur % 1 === 0 ? dur.toFixed(1) : dur, p.hook, p.cliffhanger, p.why_it_works,
      j.hook_score, j.cliffhanger_score, j.standalone_score, j.verdict, (p.flags || []).join(" | "),
      score % 1 === 0 ? score.toFixed(1) : score, r.verdict || "", r.note || "",
    ].map(cell);
  });
  const esc = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export function csvFilename(runName) {
  return `${String(runName).replace(/[^A-Za-z0-9._-]+/g, "_")}-editor-review.csv`;
}
