import { useEffect, useRef } from "react";
import { fmtDur, money } from "../lib/ui.jsx";

const PHASES = [
  ["parse", "Read scripts"], ["guide", "Series guide"], ["mine", "Find moments"], ["trailers", "Trailers"],
  ["recut", "Re-cut openings"], ["judge", "Blind judge"], ["rank", "Rank"], ["done", "Done"],
];

// Live run panel: phase chips, progress bars, spend counter and the log tail.
// Port of renderJob() from the Python UI; the job document comes from MongoDB.
export default function ProgressCard({ job, onCancel, onOpenRun }) {
  const logRef = useRef(null);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [job?.logs]);

  if (!job) return null;

  const order = PHASES.map((p) => p[0]);
  const cur = order.indexOf(job.phase);
  const st = job.stats || {};

  return (
    <div className="panel runpanel">
      <h2>
        Run <span className="muted" style={{ fontWeight: 500, fontSize: 14 }}>{`· ${job.run}`}</span>
      </h2>

      <div className="phases">
        {PHASES.map(([k, label], i) => {
          if (k === "recut" && !job.params?.recut_hooks) return null;
          if (["guide", "judge", "trailers"].includes(k) && job.params?.rules_only) return null;
          const done = job.state === "done" || i < cur;
          const active = i === cur && job.state === "running";
          return (
            <span key={k} className={`ph ${done ? "done" : active ? "active" : ""}`}>
              {`${done ? "✓ " : ""}${label}`}
            </span>
          );
        })}
      </div>

      <div>
        {[["mine", "Episodes searched"], ["recut", "Openings re-cut"], ["judge", "Clips judged"]].map(([k, label]) => {
          const pr = job.progress?.[k];
          if (!pr || !pr[1]) return null;
          return (
            <div key={k}>
              <div className="barlbl">
                <span>{label}</span>
                <span>{`${pr[0]} / ${pr[1]}`}</span>
              </div>
              <div className="bar">
                <i style={{ width: `${Math.round((pr[0] / pr[1]) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="kv">
        <div>
          <b>{fmtDur(job.elapsed)}</b>elapsed
        </div>
        <div>
          <b>{st.live_calls ?? 0}</b>live AI calls
        </div>
        <div>
          <b>{st.cache_hits ?? 0}</b>from cache
        </div>
        <div>
          <b>{`${Math.round(((st.prompt_tokens || 0) + (st.completion_tokens || 0)) / 1000)}k`}</b>live tokens
        </div>
        <div>
          <b>{money(st.cost_usd ?? 0)}</b>spent
        </div>
        {st.refusals ? (
          <div>
            <b>{st.refusals}</b>refusals → fallback
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        {job.state === "running" && (
          <button className="pill ghost" onClick={onCancel}>
            ■ Cancel
          </button>
        )}
        {job.state === "done" && (
          <button className="pill red" onClick={() => onOpenRun(job.run)}>
            Open the promos →
          </button>
        )}
      </div>

      {job.error && <div className={job.state === "cancelled" ? "warn" : "err"}>{job.state === "cancelled" ? "Run cancelled." : job.error}</div>}

      <pre className="log" ref={logRef}>
        {(job.logs || []).join("\n")}
      </pre>
    </div>
  );
}
