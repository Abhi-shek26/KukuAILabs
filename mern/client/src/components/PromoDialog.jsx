import { useEffect, useState } from "react";
import { api, postJson } from "../lib/api.js";
import { art, fmtTs, mmss } from "../lib/ui.jsx";

// The phone-frame storyboard + judge detail + ✓/✗ review. A direct port of
// openPromo() from the Python UI: same sections, same numbers, same wording.
export default function PromoDialog({ p, data, run, onClose, onReviews }) {
  const [lines, setLines] = useState(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState((data.reviews?.[p.id] || {}).note || "");
  const [verdict, setVerdict] = useState((data.reviews?.[p.id] || {}).verdict || "");
  const [toast, setToast] = useState("");

  const j = p.judge || {};

  // Lock the page behind the dialog, like document.body.style.overflow = "hidden".
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!data.scripts_available) {
      setErr("The scripts for this run are not on this computer, so the storyboard is unavailable.");
      return () => {};
    }
    api(`/api/runs/${encodeURIComponent(run)}/clip/${encodeURIComponent(p.id)}`)
      .then((c) => alive && setLines(c))
      .catch((e) => alive && setErr(`Could not load the script: ${e.message}`));
    return () => {
      alive = false;
    };
  }, [p.id, run, data.scripts_available]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(next) {
    try {
      const out = await postJson(`/api/runs/${encodeURIComponent(run)}/review`, { id: p.id, verdict: next, note });
      onReviews(out.reviews);
      const v = (out.reviews[p.id] || {}).verdict || "";
      setVerdict(v);
      const msg = v === "post" ? "Marked ✓ post" : v === "skip" ? "Marked ✗ skip" : "Review cleared";
      if (next) {
        setToast(msg);
        setTimeout(() => setToast(""), 2200);
      }
    } catch (e) {
      setToast(`Not saved: ${e.message}`);
      setTimeout(() => setToast(""), 2600);
    }
  }

  const tags = [
    { cls: "red", text: `#${p.rank} of ${data.promos.length}` },
    { cls: p.kind === "montage" ? "pink" : "", text: p.kind === "montage" ? "Trailer across episodes" : p.kind === "rules" ? "Rules baseline (no AI pick)" : "Single scene" },
    { cls: "", text: `${p.duration_seconds.toFixed(1)} s` },
    j.verdict ? { cls: j.verdict === "post" ? "gold" : j.verdict === "reject" ? "red" : "", text: j.verdict === "post" ? "★ Judge: post" : `Judge: ${j.verdict}` } : null,
    { cls: "", text: `score ${p.score.toFixed(2)}` },
  ].filter(Boolean);

  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <button className="close" aria-label="Close" onClick={onClose}>
          ✕
        </button>

        <div className="phone">
          <div className="frame" style={art(p.id)}>
            <Storyboard lines={lines} err={err} />
          </div>
          <div className="legend">{`${mmss(p.duration_seconds)} vertical promo · red = first 3 seconds · pink = what happens after the cut`}</div>
        </div>

        <div className="detail">
          <h3>{p.title || p.id}</h3>
          <div className="tags">
            {tags.map((t, i) => (
              <span key={i} className={`tag ${t.cls}`}>
                {t.text}
              </span>
            ))}
          </div>

          <div className="box">
            <h4>{p.segments.length > 1 ? `SEGMENTS (${p.segments.length}, in story order)` : "WHERE TO CUT"}</h4>
            {p.segments.map((s, i) => (
              <div className="segline" key={i}>
                <div className="ts">
                  {p.segments.length > 1 ? `${i + 1}. ` : ""}
                  {`Ep ${s.episode} · ${s.start} → ${s.end} `}
                  <small>{`${s.duration_seconds.toFixed(1)} s`}</small>
                </div>
                <Timeline seg={s} epLen={(data.episode_seconds || {})[s.episode]} />
                {i === 0 ? (
                  <button className="pill sm" onClick={() => copyTs(p, setToast)}>
                    ⧉ Copy
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>

          <div className="box">
            <h4>HOOK · FIRST 3 SECONDS</h4>
            <p>{p.hook || "–"}</p>
            {p.script_first_3s ? <span className="scr">{`script: ${p.script_first_3s}`}</span> : null}
          </div>

          <div className="box">
            <h4>CLIFFHANGER · WHERE IT CUTS</h4>
            <p>{p.cliffhanger || "–"}</p>
            {p.script_last_line ? <span className="scr">{`script: ${p.script_last_line}`}</span> : null}
          </div>

          <div className="box">
            <h4>WHY IT WORKS</h4>
            <p>{p.why_it_works || "–"}</p>
          </div>

          {j.hook_score != null && (
            <div className="box">
              <h4>BLIND JUDGE (SEES ONLY THE CLIP)</h4>
              <div className="scores">
                <Meter label="Hook" v={j.hook_score} />
                <Meter label="Cliffhanger" v={j.cliffhanger_score} />
                <Meter label="Stands alone" v={j.standalone_score} />
              </div>
              {(j.problems || []).length > 0 && (
                <p className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>
                  {`Concerns: ${j.problems.join(" · ")}`}
                </p>
              )}
            </div>
          )}

          {p.rank_reason && (
            <div className="box">
              <h4>WHY THIS RANK</h4>
              <p style={{ fontSize: 13 }}>{p.rank_reason}</p>
            </div>
          )}

          {(p.flags || []).length > 0 || (p.code_notes || []).length > 0 ? (
            <div className="box">
              <h4>WARNINGS &amp; CODE FIXES</h4>
              <div className="flagchips">
                {(p.flags || []).map((f, i) => (
                  <span className="flagchip" key={i}>
                    {f}
                  </span>
                ))}
              </div>
              {(p.code_notes || []).length > 0 && (
                <p className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>
                  {`Changed by code: ${p.code_notes.join(" · ")}`}
                </p>
              )}
            </div>
          ) : null}

          <div className="reviewbar">
            <button className={`pill green ${verdict === "post" ? "on-post" : ""}`} onClick={() => save(verdict === "post" ? "" : "post")}>
              ✓ Post this promo
            </button>
            <button className={`pill ${verdict === "skip" ? "on-skip" : ""}`} onClick={() => save(verdict === "skip" ? "" : "skip")}>
              ✗ Skip
            </button>
            <input type="text" placeholder="Note for the edit (saved automatically)" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => save(verdict)} />
          </div>
        </div>
      </div>
      {toast && <div className="toastbox">{toast}</div>}
    </div>
  );
}

function Storyboard({ lines, err }) {
  if (err) return <div className="lines">{err}</div>;
  if (!lines) return <div className="lines">Loading the script…</div>;

  const hasSegment = lines.lines.some((x) => x.kind === "SEGMENT");
  const before = (l) => lines.lines.some((x) => x.kind === "SEGMENT" && x !== l && x.t > 0 && x.t <= l.t);

  return (
    <div className="lines">
      {lines.lines.map((l, i) => {
        if (l.kind === "SEGMENT") {
          return (
            <div className="sl SEG" key={i}>
              <span className="t">{mmss(l.t)}</span>
              <span>{`${l.label} · jump cut`}</span>
            </div>
          );
        }
        const hook = l.t < 3 && !(hasSegment && before(l));
        return (
          <div className={`sl ${l.kind} ${hook ? "hook" : ""}`} key={i}>
            <span className="t">{`${l.t.toFixed(1)}s`}</span>
            <span className="x">
              {l.kind === "DIALOGUE" ? (
                <span className="who">{`${l.label.split(" (")[0]}: `}</span>
              ) : (
                <span>{l.kind === "SFX" ? "🔊 " : l.kind === "CAMERA" ? "🎥 " : ""}</span>
              )}
              {l.text}
            </span>
          </div>
        );
      })}
      {(lines.after || []).length > 0 && (
        <div className="after">
          <div className="lbl">AFTER THE CUT · NOT IN THE PROMO</div>
          {lines.after.map((l, i) => (
            <div className={`sl ${l.kind}`} key={i}>
              <span className="t">{`+${l.t.toFixed(1)}`}</span>
              <span className="x">
                {l.kind === "DIALOGUE" ? <span className="who">{`${l.label.split(" (")[0]}: `}</span> : ""}
                {l.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Where the clip sits in its episode: grey episode bar, orange clip, red first 3 s.
function Timeline({ seg, epLen }) {
  const L = epLen || seg.end_seconds;
  const x = (v) => Math.max(0, Math.min(1000, (v / L) * 1000));
  const w = Math.max(3, x(seg.end_seconds) - x(seg.start_seconds));
  const w3 = Math.max(2, x(Math.min(seg.end_seconds, seg.start_seconds + 3)) - x(seg.start_seconds));
  return (
    <svg className="tl" viewBox="0 0 1000 16" preserveAspectRatio="none">
      <title>{`Where this clip sits in episode ${seg.episode} (red = the first 3 s). Episode length ${fmtTs(L)}.`}</title>
      <rect x={0} y={6} width={1000} height={4} rx={2} fill="#31343b" />
      <rect x={x(seg.start_seconds)} y={2} width={w} height={12} rx={3} fill="#ff641c" />
      <rect x={x(seg.start_seconds)} y={2} width={w3} height={12} rx={2} fill="#ec1c24" />
    </svg>
  );
}

function Meter({ label, v }) {
  return (
    <div className="score">
      <div className="lbl">
        <span>{label}</span>
        <b>{v != null ? `${v}/10` : "–"}</b>
      </div>
      <div className="meter">
        <i style={{ width: `${(v || 0) * 10}%` }} />
      </div>
    </div>
  );
}

async function copyTs(p, setToast) {
  const text = p.segments.map((s) => `Ep ${s.episode} ${s.start}-${s.end}`).join("; ");
  try {
    await navigator.clipboard.writeText(text);
    setToast("Timestamps copied");
    setTimeout(() => setToast(""), 2200);
  } catch {
    window.prompt("Copy these timestamps:", text);
  }
}
