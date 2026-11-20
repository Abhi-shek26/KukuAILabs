import { PlayIcon } from "../lib/ui.jsx";

// Header: brand, tabs, run picker, live-job pill, export. Same classes as the Python UI.
export default function TopBar({ tab, setTab, runs, run, onPickRun, data, job, onJobPill }) {
  return (
    <header className="top">
      <div className="brand">
        <div className="logo">
          <PlayIcon fill="#fff" />
        </div>
        <div>
          Promo Finder<small>AI promo picker for microdramas</small>
        </div>
      </div>

      <nav className="nav">
        {[
          ["promos", "Promos"],
          ["new", "New run"],
          ["how", "How it works"],
        ].map(([k, label]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="spacer" />

      {tab === "promos" && (
        <select className="pill" aria-label="Choose a run" title="Choose a run" value={run || ""} onChange={(e) => onPickRun(e.target.value)}>
          {runs.length === 0 && <option value="">No runs yet</option>}
          {runs.map((r) => (
            <option key={r.name} value={r.name}>
              {`${r.name} · ${(r.model || "?").split("/").pop()} · ${r.ready ? `${r.promos ?? "?"} promos` : r.active ? "running…" : "unfinished"}`}
            </option>
          ))}
        </select>
      )}

      {job?.state === "running" && (
        <button className="pill jobpill" title="Open the running job" onClick={onJobPill}>
          <span className="dot" />
          <span>{jobLabel(job)}</span>
        </button>
      )}

      {tab === "promos" && data && (
        <a className="pill" href={`/api/runs/${encodeURIComponent(run)}/export.csv`} title="Download the ranked list with your ✓/✗ review">
          ⬇ Export
        </a>
      )}
    </header>
  );
}

const LABELS = { parse: "Read scripts", guide: "Series guide", mine: "Find moments", trailers: "Trailers", recut: "Re-cut openings", judge: "Blind judge", rank: "Rank", done: "Done" };

function jobLabel(job) {
  const pr = job.progress?.[job.phase];
  return `${LABELS[job.phase] || job.phase}${pr && pr[1] > 1 ? ` ${pr[0]}/${pr[1]}` : ""}`;
}
