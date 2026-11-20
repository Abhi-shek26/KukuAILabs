import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_BASE_URL, DEFAULT_MODEL, OUTPUTS_DIR, PYTHON_BIN, REPO_ROOT } from "../env.js";
import { Job } from "../models/index.js";
import { ingestRunDir } from "./ingest.js";
import { slug } from "../lib/fmt.js";
import { resolveShow } from "./shows.js";

// One run at a time, exactly like the Python UI (Qubrid's free tier serves one request at a time).
let current = null; // { child, jobId }

const PHASE_ORDER = ["parse", "guide", "mine", "trailers", "recut", "judge", "rank", "done"];

export function activeJobId() {
  return current?.jobId ?? null;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function numberOr(v, def, lo, hi, cast = Number) {
  if (v == null || v === "") return def;
  const x = cast(v);
  if (Number.isNaN(x) || x < lo || x > hi) throw new Error(`value ${v} out of range ${lo}-${hi}`);
  return x;
}

export async function startJob(body) {
  if (current) throw Object.assign(new Error("a run is already in progress"), { status: 409 });

  const showPath = resolveShow(String(body.show || ""));
  const rulesOnly = Boolean(body.rules_only);
  const params = {
    show: String(body.show || ""),
    rules_only: rulesOnly,
    model: (body.model || "").trim() || null,
    base_url: (body.base_url || "").trim() || null,
    judge_model: (body.judge_model || "").trim() || null,
    fallback_model: (body.fallback_model || "").trim() || null,
    workers: numberOr(body.workers, 1, 1, 32, Number),
    max_cost: body.max_cost === "" || body.max_cost == null ? null : numberOr(body.max_cost, null, 0, 100, Number),
    per_episode: numberOr(body.per_episode, 3, 1, 5, Number),
    trailers: numberOr(body.trailers, 4, 0, 8, Number),
    episodes: (body.episodes || "").trim(),
    recut_hooks: Boolean(body.recut_hooks),
  };
  if (params.episodes && !/^[0-9,\- ]+$/.test(params.episodes)) throw Object.assign(new Error("episodes must look like 1-10 or 1,5,9"), { status: 400 });
  if (params.base_url && !/^https?:\/\//.test(params.base_url)) throw Object.assign(new Error("provider URL must start with http:// or https://"), { status: 400 });

  const apiKey = (body.api_key || "").trim();
  const customUrl = params.base_url && params.base_url.replace(/\/+$/, "") !== DEFAULT_BASE_URL;
  if (!rulesOnly && !apiKey && customUrl) throw Object.assign(new Error("enter an API key for this provider"), { status: 400 });

  const tag = rulesOnly ? "rules" : slug((params.model || DEFAULT_MODEL).split("/").pop());
  const runName = `${slug(path.basename(showPath))}-${tag}-${stamp()}`;
  const outDir = path.join(OUTPUTS_DIR, runName);
  fs.mkdirSync(outDir, { recursive: true });

  const args = ["-u", "-m", "promo_finder", "run", showPath, "--out", outDir];
  if (rulesOnly) args.push("--no-llm");
  if (params.model) args.push("--model", params.model);
  if (params.judge_model) args.push("--judge-model", params.judge_model);
  if (params.fallback_model) args.push("--fallback-model", params.fallback_model);
  if (params.base_url) args.push("--base-url", params.base_url);
  if (params.workers && params.workers > 1) args.push("--workers", String(params.workers));
  if (params.max_cost != null) args.push("--max-cost", String(params.max_cost));
  if (params.per_episode !== 3) args.push("--per-episode", String(params.per_episode));
  if (params.trailers !== 4) args.push("--trailers", String(params.trailers));
  if (params.episodes) args.push("--episodes", params.episodes);
  if (params.recut_hooks) args.push("--recut-hooks");

  const env = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" };
  if (apiKey) {
    env.LLM_API_KEY = apiKey;
    env.QUBRID_API_KEY = apiKey;
  }
  if (params.base_url) env.LLM_BASE_URL = params.base_url;
  if (params.model) env.LLM_MODEL = params.model;

  const job = await Job.create({
    outDir,
    runName,
    state: "running",
    phase: "parse",
    progress: {},
    logs: [],
    params,
    stats: { live_calls: 0, cache_hits: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0, refusals: 0 },
    startedAt: Date.now(),
  });

  const child = spawn(PYTHON_BIN, args, { cwd: REPO_ROOT, env, windowsHide: true });
  current = { child, jobId: job._id.toString() };
  job.pid = child.pid;
  await job.save();

  const totalEpisodes = { n: 0 };
  const pending = [];
  let sawDone = false;
  let buffer = "";

  const flush = async (line) => {
    const text = line.replace(/\u0000/g, "").trimEnd();
    if (!text) return;
    pending.push(text.slice(0, 500));
    const upd = {};

    if (/^Parsed (\d+) episodes/.test(text)) {
      totalEpisodes.n = Number(/^Parsed (\d+) episodes/.exec(text)[1]);
      upd.phase = "guide";
    } else if (/^Series guide:/.test(text)) {
      upd.phase = "mine";
    } else if (/\[mine\] Ep (\d+):/.test(text)) {
      const m = /\[mine\] Ep (\d+):/.exec(text);
      upd.phase = "mine";
      upd[`progress.mine`] = [Number(m[1]), totalEpisodes.n || Number(m[1])];
    } else if (/\[trailers\]/.test(text)) {
      upd.phase = "trailers";
    } else if (/\[recut\]/.test(text)) {
      upd.phase = "recut";
    } else if (/\[rules\]/.test(text)) {
      upd.phase = "judge";
    } else if (/\[judge\] (\d+)\/(\d+)/.test(text)) {
      const m = /\[judge\] (\d+)\/(\d+)/.exec(text);
      upd.phase = "judge";
      upd[`progress.judge`] = [Number(m[1]), Number(m[2])];
    } else if (/^Done: (\d+) ranked promos/.test(text)) {
      sawDone = true;
      upd.phase = "done";
    }

    if (Object.keys(upd).length) {
      const $set = {};
      for (const [k, v] of Object.entries(upd)) $set[k] = v;
      await Job.updateOne({ _id: job._id }, { $set });
    }
    if (pending.length >= 3) {
      const chunk = pending.splice(0, pending.length);
      await Job.updateOne({ _id: job._id }, { $push: { logs: { $each: chunk } } });
    }
  };

  child.stdout.on("data", (d) => {
    buffer += d.toString("utf8");
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? "";
    parts.forEach(flush);
  });
  child.stderr.on("data", (d) => {
    const t = d.toString("utf8").trim();
    if (t) pending.push(t.slice(0, 500));
  });

  const finish = async (code, signal) => {
    if (buffer) await flush(buffer);
    if (pending.length) await Job.updateOne({ _id: job._id }, { $push: { logs: { $each: pending.splice(0) } } });
    const doc = await Job.findById(job._id);
    const cancelled = doc.state === "cancelled" || signal != null;
    const ok = !cancelled && (sawDone || code === 0);

    // Pull real numbers from the run summary the pipeline just wrote.
    let stats = doc.stats || {};
    try {
      const s = JSON.parse(fs.readFileSync(path.join(outDir, "run_summary.json"), "utf8"));
      const l = s.llm || {};
      const fresh = l.per_show_if_run_fresh || {};
      stats = {
        live_calls: l.live_calls ?? 0,
        cache_hits: l.cache_hits ?? 0,
        prompt_tokens: l.prompt_tokens ?? 0,
        completion_tokens: l.completion_tokens ?? 0,
        cost_usd: fresh.cost_usd ?? l.cost_usd ?? 0,
        refusals: l.refusals ?? 0,
      };
    } catch {
      /* no summary when it failed early */
    }

    await Job.updateOne(
      { _id: job._id },
      {
        $set: {
          state: cancelled ? "cancelled" : ok ? "done" : "error",
          phase: ok ? "done" : doc.phase,
          finishedAt: Date.now(),
          error: ok || cancelled ? null : `the run exited with code ${code}${signal ? ` (${signal})` : ""}`,
          stats,
        },
      }
    );
    current = null;
    try {
      await ingestRunDir(outDir);
    } catch (e) {
      console.error("ingest after job failed:", e.message);
    }
  };

  child.on("close", (code, signal) => {
    finish(code, signal).catch((e) => console.error("finish failed:", e.message));
  });
  child.on("error", async (e) => {
    await Job.updateOne({ _id: job._id }, { $set: { state: "error", error: `${e.name}: ${e.message}`, finishedAt: Date.now() } });
    current = null;
  });

  return jobView(await Job.findById(job._id));
}

export async function cancelJob() {
  if (!current) throw Object.assign(new Error("no run in progress"), { status: 409 });
  const { child, jobId } = current;
  await Job.updateOne({ _id: jobId }, { $set: { state: "cancelled", finishedAt: Date.now() } });
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
  } else {
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 4000);
  }
  return jobView(await Job.findById(jobId));
}

export async function latestJob() {
  const job = await Job.findOne().sort({ startedAt: -1 });
  return job ? jobView(job) : null;
}

export async function getJob(id) {
  const job = await Job.findById(id);
  return job ? jobView(job) : null;
}

// Same view shape the React app renders (phases, bars, stats, log).
export function jobView(job) {
  if (!job) return null;
  const started = job.startedAt || Date.now();
  const end = job.finishedAt || Date.now();
  return {
    id: job._id.toString(),
    state: job.state,
    phase: job.phase,
    progress: job.progress || {},
    logs: (job.logs || []).slice(-200),
    elapsed: Math.round((end - started) / 100) / 10,
    run: job.runName,
    error: job.error || null,
    stats: job.stats || {},
    params: job.params || {},
    phases: PHASE_ORDER,
  };
}
