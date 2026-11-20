import { useEffect, useMemo, useRef, useState } from "react";
import { api, postJson } from "../lib/api.js";
import { fmtDur, fmtTs, money } from "../lib/ui.jsx";
import ProgressCard from "./ProgressCard.jsx";

// "New run" tab: pick or upload a show, choose the model, see the estimate, start.
// Every field maps 1:1 to a flag of `python -m promo_finder run`.
export default function NewRun({ config, job, onJob, onOpenRun, onToast }) {
  const [shows, setShows] = useState([]);
  const [showId, setShowId] = useState("");
  const [parsed, setParsed] = useState(null);
  const [models, setModels] = useState([]);
  const [form, setForm] = useState({
    baseUrl: config?.default_base_url || "",
    apiKey: "",
    model: config?.default_model || "",
    judgeModel: "",
    fallbackModel: "",
    workers: 1,
    maxCost: "",
    episodes: "",
    perEp: 3,
    trailers: 4,
    recut: false,
    rulesOnly: false,
    upName: "",
  });
  const [startErr, setStartErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState("");
  const fileRef = useRef(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api("/api/shows")
      .then(({ shows }) => {
        setShows(shows);
        if (shows.length && !showId) {
          setShowId(shows[0].id);
          parseShow(shows[0].id);
        }
      })
      .catch((e) => onToast(`Could not list shows: ${e.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // config arrives after the first render: adopt its default model, like the Python UI does.
  useEffect(() => {
    const def = config?.default_model;
    if (def) setForm((f) => (f.model && f.model !== rowsFirstOf(models) ? f : { ...f, model: def }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, models]);

  async function loadModels() {
    try {
      const r = await api(`/api/models?base_url=${encodeURIComponent(form.baseUrl)}`, {
        headers: form.apiKey ? { "X-Api-Key": form.apiKey } : {},
      });
      const rows = r.models || [];
      setModels(rows);
      // Keep the picker honest: if the configured default is not offered, use the first model.
      if (rows.length) setForm((f) => (rows.some((m) => m.id === f.model) ? f : { ...f, model: rows[0].id }));
    } catch (e) {
      setModels([]);
      onToast(`Could not list models: ${e.message}`);
    }
  }

  async function parseShow(id) {
    setParsed(null);
    try {
      setParsed(await postJson("/api/parse", { show: id }));
    } catch (e) {
      setParsed({ error: e.message });
    }
  }

  async function upload(files) {
    if (!files.length) return;
    const name =
      form.upName.trim() ||
      (files[0].name.toLowerCase().endsWith(".zip") ? files[0].name.replace(/\.zip$/i, "") : "uploaded show");
    let show = null;
    let n = 0;
    setUploading(`Uploading ${files.length} file(s)…`);
    try {
      for (const f of files) {
        const out = await api(`/api/upload?show=${encodeURIComponent(name)}&filename=${encodeURIComponent(f.name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: f,
        });
        show = out.show;
        n += out.written;
      }
      onToast(`${n} script file(s) saved`);
      const { shows } = await api("/api/shows");
      setShows(shows);
      setShowId(show);
      await parseShow(show);
    } catch (e) {
      onToast(`Upload failed: ${e.message}`);
    } finally {
      setUploading("");
    }
  }

  const modelOptions = models.length ? models : [{ id: config?.default_model || "", in: null, out: null }];

  const n = useMemo(() => episodeCount(parsed, form.episodes), [parsed, form.episodes]);
  const estimate = useMemo(() => estimateText({ n, form, models, money, fmtDur }), [n, form, models]);

  async function start() {
    setStartErr("");
    const body = {
      show: showId,
      rules_only: form.rulesOnly,
      base_url: form.baseUrl === config?.default_base_url ? "" : form.baseUrl.trim(),
      api_key: form.apiKey.trim(),
      model: form.model,
      judge_model: form.judgeModel,
      fallback_model: form.fallbackModel,
      workers: form.workers,
      max_cost: form.maxCost,
      episodes: form.episodes.trim(),
      per_episode: form.perEp,
      trailers: form.trailers,
      recut_hooks: form.recut,
    };
    if (!body.show) {
      setStartErr("Pick or upload a show first.");
      return;
    }
    setBusy(true);
    try {
      const { job } = await postJson("/api/run", body);
      onJob(job);
    } catch (e) {
      setStartErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="newgrid">
        <div className="panel">
          <h2>Find promos for a show</h2>
          <p className="lead">Scripts in, ranked promo shortlist out. Every timestamp comes from the script itself.</p>

          <div className="steps">
            <div className="step">
              <span className="n">1</span>
              <h4>Pick or upload the episode scripts</h4>
              <p>One timestamped .txt screenplay per episode.</p>
            </div>
            <div className="step">
              <span className="n">2</span>
              <h4>Choose a model</h4>
              <p>Any OpenAI-compatible provider. Default: the cheapest on Qubrid, free.</p>
            </div>
            <div className="step">
              <span className="n">3</span>
              <h4>Review the ranked promos</h4>
              <p>✓ Post / ✗ Skip, then export for the edit.</p>
            </div>
          </div>

          <label className="f">SHOW ON THIS COMPUTER</label>
          <select
            className="select"
            value={showId}
            onChange={(e) => {
              setShowId(e.target.value);
              parseShow(e.target.value);
            }}
          >
            {shows.length === 0 && <option value="">No show folders found: upload one below</option>}
            {shows.map((s) => (
              <option key={s.id} value={s.id}>
                {`${s.name} · ${s.files} files`}
              </option>
            ))}
          </select>

          <label className="f">…OR UPLOAD A NEW SHOW</label>
          <input className="input" type="text" placeholder="Show name for the upload" value={form.upName} onChange={(e) => set("upName", e.target.value)} />
          <div
            className={`drop ${dragOver ? "over" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              upload([...e.dataTransfer.files]);
            }}
          >
            {uploading || (
              <>
                Drop a <b>.zip</b> of episode scripts or several <b>.txt</b> files, or <u>browse</u>
              </>
            )}
            <input ref={fileRef} type="file" multiple accept=".zip,.txt,.md,.fountain" style={{ display: "none" }} onChange={(e) => upload([...e.target.files])} />
          </div>

          <ParseBox parsed={parsed} />
        </div>

        <div className="panel">
          <h2>Model &amp; budget</h2>
          <p className="lead">Swap the model without touching code. Kuku can plug in its own API here.</p>

          <label className="toggle">
            <input type="checkbox" checked={form.rulesOnly} onChange={(e) => set("rulesOnly", e.target.checked)} /> Rules only: no AI, offline, instant (baseline)
          </label>

          {!form.rulesOnly && (
            <div>
              <label className="f">PROVIDER (OPENAI-COMPATIBLE URL)</label>
              <input className="input" type="text" spellCheck={false} value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} onBlur={loadModels} />

              <label className="f">API KEY</label>
              <input
                className="input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={form.apiKey}
                placeholder={config?.has_server_key ? "Using the key from the server's .env (leave empty)" : "Paste an API key for this provider"}
                onChange={(e) => set("apiKey", e.target.value)}
                onBlur={loadModels}
              />
              <div className="hint">
                {config?.require_user_key
                  ? "Each user brings their own key; it is used for this run only and never stored."
                  : "A key typed here is used for this run only and never stored. The server's own key is only ever sent to its default provider."}
              </div>

              <label className="f">MODEL</label>
              <select className="select" value={form.model} onChange={(e) => set("model", e.target.value)}>
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {modelLabel(m)}
                  </option>
                ))}
              </select>

              <div className="two">
                <div>
                  <label className="f">JUDGE MODEL</label>
                  <select className="select" value={form.judgeModel} onChange={(e) => set("judgeModel", e.target.value)}>
                    <option value="">same as the main model</option>
                    {modelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {modelLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="f">IF A MODEL REFUSES, RETRY WITH</label>
                  <select className="select" value={form.fallbackModel} onChange={(e) => set("fallbackModel", e.target.value)}>
                    <option value="">none (report refused episodes)</option>
                    {modelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {modelLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="two">
                <div>
                  <label className="f">PARALLEL REQUESTS</label>
                  <input className="input" type="number" min="1" max="32" value={form.workers} onChange={(e) => set("workers", e.target.value)} />
                </div>
                <div>
                  <label className="f">BUDGET CAP ($)</label>
                  <input className="input" type="number" min="0" step="0.05" placeholder="no cap" value={form.maxCost} onChange={(e) => set("maxCost", e.target.value)} />
                </div>
              </div>
              <div className="hint">
                Qubrid's free model serves one request at a time, so use 1. Paid models with 8 parallel requests processed 50 episodes in 3–5 minutes in testing.
              </div>
            </div>
          )}

          <details className="adv">
            <summary>Advanced</summary>
            <div className="three">
              <div>
                <label className="f">EPISODES</label>
                <input className="input" type="text" placeholder="all, or 1-10" value={form.episodes} onChange={(e) => set("episodes", e.target.value)} />
              </div>
              <div>
                <label className="f">PROMOS / EPISODE</label>
                <input className="input" type="number" min="1" max="5" value={form.perEp} onChange={(e) => set("perEp", e.target.value)} />
              </div>
              <div>
                <label className="f">TRAILERS</label>
                <input className="input" type="number" min="0" max="8" value={form.trailers} onChange={(e) => set("trailers", e.target.value)} />
              </div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={form.recut} onChange={(e) => set("recut", e.target.checked)} /> Experimental: AI re-cut of each clip's opening (no measurable gain in a blind test)
            </label>
          </details>

          <div className="estimate">{estimate}</div>

          {(config?.active_runs || []).length > 0 && (
            <div className="warn">{`Another run is active (${config.active_runs.join(", ")}). Qubrid's free tier serves one request at a time, so a second free run would be slow.`}</div>
          )}

          <button className="pill green big-cta" disabled={busy || job?.state === "running"} onClick={start}>
            ▶ Find promos
          </button>
          {startErr && <div className="err">{startErr}</div>}
        </div>
      </div>

      <ProgressCard
        job={job}
        onCancel={async () => {
          try {
            const { job } = await postJson("/api/job/cancel", {});
            onJob(job);
            onToast("Cancelling after the current request…");
          } catch (e) {
            onToast(e.message);
          }
        }}
        onOpenRun={onOpenRun}
      />
    </>
  );
}

function ParseBox({ parsed }) {
  if (!parsed) return null;
  if (parsed.error) return <div className="err">{parsed.error}</div>;
  return (
    <div>
      <div className="kv">
        <div>
          <b>{parsed.episodes}</b> episodes
        </div>
        <div>
          <b>{`${parsed.minutes} min`}</b> of drama
        </div>
        <div>
          <b>{parsed.blocks.toLocaleString()}</b> timed lines
        </div>
        <div>
          <b style={parsed.warnings ? { color: "#ffb38f" } : undefined}>{parsed.warnings}</b> format warnings
        </div>
      </div>
      {!parsed.episodes && <div className="err">No timestamped episodes found. Check the format with: python -m promo_finder parse &lt;folder&gt;</div>}
      <details>
        <summary className="hint" style={{ cursor: "pointer", marginTop: 10 }}>
          Episode list
        </summary>
        <div className="epslist">
          <table>
            <tbody>
              <tr>
                <th>Ep</th>
                <th>Length</th>
                <th>Lines</th>
                <th>Logline</th>
              </tr>
              {parsed.list.map((e) => (
                <tr key={e.n}>
                  <td>{e.n}</td>
                  <td>{fmtTs(e.seconds)}</td>
                  <td>{e.blocks}</td>
                  <td>{e.logline || (e.warnings.length ? `⚠ ${e.warnings[0]}` : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

const rowsFirstOf = (rows) => (rows && rows.length ? rows[0].id : "");

function modelLabel(m) {
  const price = m.in == null ? "price n/a" : m.in === 0 && m.out === 0 ? "FREE" : `$${m.in} / $${m.out} per 1M tokens`;
  return `${m.id} · ${price}`;
}

function episodeCount(parsed, spec) {
  const total = parsed && !parsed.error ? parsed.episodes : 0;
  const s = (spec || "").trim();
  if (!s) return total;
  let c = 0;
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) c += Math.abs(Number(m[2]) - Number(m[1])) + 1;
    else if (/^\d+$/.test(part.trim())) c += 1;
  }
  return Math.min(total || c, c);
}

function estimateText({ n, form, models, money, fmtDur }) {
  if (!n) return "Pick a show to see a time and cost estimate.";
  if (form.rulesOnly) return `Rules only: ${n} episodes, no AI calls, $0, a few seconds.`;
  const per = Number(form.perEp) || 3;
  const w = Math.max(1, Number(form.workers) || 1);
  const promos = n * Math.min(per, 3.1) + Math.min(n, 30) * 0.6 + (Number(form.trailers) || 0);
  const calls = Math.round(1 + n + promos + 2 + (form.recut ? promos : 0));
  const tin = 3500 + n * 4900 + promos * 2500 + 18000;
  const tout = 600 + n * 650 + promos * 230 + 1200;
  const m = models.find((x) => x.id === form.model);
  const jm = models.find((x) => x.id === form.judgeModel);
  let cost = null;
  if (m && m.in != null) {
    const ji = jm && jm.in != null ? jm.in : m.in;
    const jo = jm && jm.out != null ? jm.out : m.out;
    const a = promos * 2500;
    const b = promos * 230;
    cost = ((tin - a) * m.in + (tout - b) * m.out + a * ji + b * jo) / 1e6;
  }
  return `Rough estimate for ${n} episodes: ~${calls} AI calls · ~${Math.round(tin / 1000)}k input + ${Math.round(tout / 1000)}k output tokens · ${
    cost == null ? "cost unknown" : cost === 0 ? "free" : `≈ ${money(cost)}`
  } · ${fmtDur((calls * (w > 1 ? 9 : 35)) / w)}${w === 1 ? " (one request at a time)" : ""}. Re-running the same show is free (answers are cached).`;
}
