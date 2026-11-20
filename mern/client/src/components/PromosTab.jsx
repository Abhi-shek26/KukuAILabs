import Poster from "./Poster.jsx";
import { art, firstLine, money, segShort, PlayIcon } from "../lib/ui.jsx";

// Hero, stat row, Top 10 rail, trailers rail, filters, grid — the same blocks the
// Python page builds with renderHero/renderStats/renderRows/renderGrid.
export default function PromosTab({ data, filters, setFilters, limit, more, onOpen, onPickFromHero }) {
  if (!data) return null;
  const promos = data.promos || [];
  const reviews = data.reviews || {};
  const summary = data.summary || {};
  const llm = summary.llm || {};
  const fresh = llm.per_show_if_run_fresh || {};
  const rv = Object.values(reviews);

  const top = promos[0];
  const ten = promos.slice(0, 10);
  const trailers = promos.filter((p) => p.kind === "montage");

  const list = filtered(promos, reviews, filters);

  return (
    <>
      {top && <Hero p={top} data={data} onOpen={onPickFromHero} />}

      <div className="statrow" id="stats">
        <Stat v={`${summary.episodes} eps`} k={`${summary.runtime_minutes} min of drama`} />
        <Stat v={String(promos.length)} k="promos ranked" />
        <Stat v={String(promos.filter((p) => (p.judge || {}).verdict === "post").length)} k="★ judge picks" />
        <Stat v={(llm.model || (summary.mode === "rules-only" ? "rules only" : "?")).split("/").pop()} k="model" />
        <Stat v={money(fresh.cost_usd ?? llm.cost_usd ?? (summary.mode === "rules-only" ? 0 : null))} k="cost for the show" />
        <Stat v={`${rv.filter((r) => r.verdict === "post").length} ✓ · ${rv.filter((r) => r.verdict === "skip").length} ✗`} k="your review" />
      </div>

      {ten.length > 0 && (
        <>
          <div className="rowhead">
            <h2>Top 10 to post first</h2>
            <span className="sub">ranked by the blind judge, with a nudge for early episodes, where new viewers start</span>
          </div>
          <div className="rail">
            {ten.map((p, i) => (
              <div key={p.id} className={`rail-item ${i < 3 ? "top3" : ""}`}>
                <span className="bignum">{i + 1}</span>
                <Poster p={p} review={reviews[p.id]} onOpen={onOpen} noCap />
                <div className="cap" style={{ cursor: "pointer" }} onClick={() => onOpen(p)}>
                  <div className="t">{p.title}</div>
                  <div className="s">{segShort(p)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {trailers.length > 0 && (
        <>
          <div className="rowhead">
            <h2>Trailers across episodes</h2>
            <span className="sub">2–4 moments stitched in story order</span>
          </div>
          <div className="rail" style={{ gap: 16 }}>
            {trailers.map((p) => (
              <div key={p.id} style={{ width: 182, flex: "0 0 auto" }}>
                <Poster p={p} review={reviews[p.id]} onOpen={onOpen} />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="rowhead">
        <h2>All promos</h2>
        <span className="sub">{`${promos.length} clips · click any poster to open it`}</span>
      </div>

      <Filters filters={filters} setFilters={setFilters} />

      <div className="count">{list.length === promos.length ? "" : `${list.length} of ${promos.length} match`}</div>
      <div className="grid">
        {list.length === 0 ? (
          <div className="empty" style={{ gridColumn: "1/-1" }}>
            Nothing matches these filters.
          </div>
        ) : (
          list.slice(0, limit).map((p) => <Poster key={p.id} p={p} review={reviews[p.id]} onOpen={onOpen} />)
        )}
      </div>
      <div style={{ textAlign: "center", marginTop: 22 }}>
        {list.length > limit && (
          <button className="pill" onClick={more}>
            {`Show ${Math.min(48, list.length - limit)} more`}
          </button>
        )}
      </div>
    </>
  );
}

function Stat({ v, k }) {
  return (
    <div className="stat">
      <b>{v}</b>
      <span>{k}</span>
    </div>
  );
}

function Hero({ p, data, onOpen }) {
  const fl = firstLine(p);
  const s = data.summary || {};
  return (
    <div className="hero">
      <div className="copy">
        <span className="kicker">{`★ #1 to post first · ${data.show || s.show || ""}`}</span>
        <h1>{p.title || p.id}</h1>
        <div className="quote">{p.cliffhanger ? `Cuts on: ${p.cliffhanger}` : ""}</div>
        <div className="meta">
          {`${segShort(p)} · ${p.duration_seconds.toFixed(0)} s`}
          {(p.judge || {}).hook_score != null
            ? ` · judge ${p.judge.hook_score}/${p.judge.cliffhanger_score}/${p.judge.standalone_score}`
            : ""}
        </div>
        <div className="cta">
          <button className="pill red" onClick={() => onOpen(p)}>
            <PlayIcon />
            Watch the script
          </button>
          <button className="pill" onClick={() => copyTs(p)}>
            ⧉ Copy timestamps
          </button>
        </div>
      </div>
      <div className="art" style={art(p.id)}>
        <div className="bigq">{fl.speech ? `“${fl.text}”` : fl.text}</div>
      </div>
    </div>
  );
}

function Filters({ filters, setFilters }) {
  const kind = (v, label) => (
    <button className={`chipbtn ${filters.kind === v ? "on" : ""}`} onClick={() => setFilters({ ...filters, kind: v })}>
      {label}
    </button>
  );
  const verdict = (v, label) => (
    <button className={`chipbtn ${filters.verdict === v ? "on" : ""}`} onClick={() => setFilters({ ...filters, verdict: v })}>
      {label}
    </button>
  );
  return (
    <div className="filters">
      <input
        className="search"
        type="search"
        placeholder="Search a line, a character, “slap”, “Ep 12”…"
        value={filters.q}
        onChange={(e) => setFilters({ ...filters, q: e.target.value })}
      />
      <span>
        {kind("", "All")} {kind("single", "Single scene")} {kind("montage", "Trailer")} {kind("rules", "Rules baseline")}
      </span>
      <span>
        {verdict("", "Any review")} {verdict("post", "✓ Post")} {verdict("skip", "✗ Skip")} {verdict("none", "To review")}
      </span>
      <button className={`chipbtn ${filters.judge ? "on" : ""}`} title="Only clips the blind judge said to post" onClick={() => setFilters({ ...filters, judge: !filters.judge })}>
        ★ Judge picks
      </button>
      <button className={`chipbtn ${filters.clean ? "on" : ""}`} title="Hide clips with automatic warnings" onClick={() => setFilters({ ...filters, clean: !filters.clean })}>
        No warnings
      </button>
      <select className="pill sm" aria-label="Sort" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
        <option value="rank">Rank</option>
        <option value="episode">Episode</option>
        <option value="duration">Length</option>
      </select>
    </div>
  );
}

function searchable(p) {
  return [
    p.title, p.hook, p.cliffhanger, p.why_it_works, p.script_first_3s, p.script_last_line, p.id,
    ...(p.segments || []).map((s) => `ep ${s.episode}`),
    ...(p.flags || []),
  ]
    .join(" ")
    .toLowerCase();
}

function filtered(promos, reviews, f) {
  const list = promos.filter((p) => {
    if (f.kind && p.kind !== f.kind) return false;
    const v = (reviews[p.id] || {}).verdict || "";
    if (f.verdict === "none" && v) return false;
    if (f.verdict && f.verdict !== "none" && v !== f.verdict) return false;
    if (f.judge && (p.judge || {}).verdict !== "post") return false;
    if (f.clean && (p.flags || []).length) return false;
    if (f.q && !searchable(p).includes(f.q.toLowerCase())) return false;
    return true;
  });
  if (f.sort === "episode") list.sort((a, b) => a.segments[0].episode - b.segments[0].episode || a.segments[0].start_seconds - b.segments[0].start_seconds);
  else if (f.sort === "duration") list.sort((a, b) => a.duration_seconds - b.duration_seconds);
  else list.sort((a, b) => a.rank - b.rank);
  return list;
}

async function copyTs(p) {
  const text = p.segments.map((s) => `Ep ${s.episode} ${s.start}-${s.end}`).join("; ");
  try {
    await navigator.clipboard.writeText(text);
    window.dispatchEvent(new CustomEvent("pf:toast", { detail: "Timestamps copied" }));
  } catch {
    window.prompt("Copy these timestamps:", text);
  }
}
