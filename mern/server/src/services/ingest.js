import fs from "node:fs";
import path from "node:path";
import { MONGODB_URI, OUTPUTS_DIR, REPO_ROOT } from "../env.js";
import { Run, Promo, Review } from "../models/index.js";
import { discoverShows, showDirFor } from "./shows.js";
import { episodeDuration, loadShow } from "../lib/screenplay.js";

const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

function inputDirFor(summary, showName) {
  if (summary?.input_dir && fs.existsSync(summary.input_dir)) return summary.input_dir;
  const hit = discoverShows().find((s) => s.name === showName);
  return hit ? path.resolve(REPO_ROOT, hit.id) : null;
}

// Ingest one outputs/<name> folder into MongoDB. Idempotent: re-running only
// refreshes what changed, and never touches editor reviews made in the app.
export async function ingestRunDir(dir) {
  const name = path.basename(dir);
  if (name.startsWith(".")) return null;

  const summPath = path.join(dir, "run_summary.json");
  const promosPath = path.join(dir, "promos.json");
  const logPath = path.join(dir, "raw", "llm_calls.jsonl");
  if (!fs.existsSync(summPath) && !fs.existsSync(logPath)) return null;

  const summary = fs.existsSync(summPath) ? readJson(summPath) : null;
  const promosData = fs.existsSync(promosPath) ? readJson(promosPath) : null;
  const stat = (p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0);
  const modified = Math.max(stat(summPath), stat(promosPath), stat(logPath));

  const llm = summary?.llm || {};
  const fresh = llm.per_show_if_run_fresh || {};
  const doc = {
    name,
    modified,
    ready: Boolean(promosData),
    show: summary?.show || promosData?.show,
    mode: summary?.mode,
    model: llm.model || (summary?.mode === "rules-only" ? "rules-only" : null),
    judgeModel: summary?.judge_llm?.model || null,
    episodes: summary?.episodes,
    runtimeMinutes: summary?.runtime_minutes,
    promos: summary?.promos_ranked,
    cost: fresh.cost_usd ?? llm.cost_usd ?? null,
    seconds: summary?.wall_clock_seconds,
    summary,
    generated: promosData?.generated,
    active: false,
    progressHint: null,
  };

  if (!doc.ready && fs.existsSync(logPath)) {
    const age = Date.now() - stat(logPath);
    doc.active = age < 240_000;
    try {
      const tags = fs
        .readFileSync(logPath, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l).tag || "";
          } catch {
            return "";
          }
        });
      doc.progressHint = { mined: tags.filter((t) => t.startsWith("mine:")).length, judged: tags.filter((t) => t.startsWith("judge:")).length };
    } catch {
      /* ignore a log being written right now */
    }
  }

  const inputDir = inputDirFor(summary, doc.show);
  doc.inputDir = inputDir;
  doc.scriptsAvailable = Boolean(inputDir && fs.existsSync(inputDir));

  await Run.findOneAndUpdate({ name }, doc, { upsert: true, new: true });

  if (promosData) {
    const rankeds = (promosData.promos || []).map((p) => ({ ...p, runName: name, near_duplicate: false }));
    const dups = (promosData.near_duplicates || []).map((p) => ({ ...p, runName: name, near_duplicate: true }));
    const all = [...rankeds, ...dups].map((p) => {
      const { _id, __v, ...rest } = p;
      return rest;
    });
    if (all.length) {
      const ops = all.map((p) => ({
        updateOne: { filter: { runName: name, id: p.id }, update: { $set: p }, upsert: true },
      }));
      await Promo.bulkWrite(ops);
      // drop promos that no longer exist in this run
      await Promo.deleteMany({ runName: name, id: { $nin: all.map((p) => p.id) } });
    }

    // Import editor_review.json once, so reviews made in the Python UI carry over.
    const legacy = path.join(dir, "editor_review.json");
    if (fs.existsSync(legacy)) {
      const existing = await Review.countDocuments({ runName: name });
      if (!existing) {
        const reviews = readJson(legacy) || {};
        const docs = Object.entries(reviews).map(([promoId, r]) => ({
          runName: name,
          promoId,
          verdict: ["post", "skip"].includes(r.verdict) ? r.verdict : "",
          note: r.note || "",
          time: r.time || "",
        }));
        if (docs.length) await Review.insertMany(docs, { ordered: false }).catch(() => {});
      }
    }
  }

  return doc;
}

// A remote database (Atlas) is the one a public deployment reads from. A laptop must therefore
// never push its local outputs/ into it: those folders can hold client material (the Kuku pack),
// and every clip stores the hook, cliffhanger and script lines verbatim. Opt in explicitly with
// PROMO_INGEST_ALL=1 when you really do mean to publish a run.
const REMOTE_DB = /^mongodb\+srv:/.test(MONGODB_URI);

export async function ingestAll() {
  if (!fs.existsSync(OUTPUTS_DIR)) return [];
  if (REMOTE_DB && process.env.PROMO_INGEST_ALL !== "1") {
    const remote = MONGODB_URI.replace(/\/\/[^@]*@/, "//").split("?")[0];
    console.warn(
      [
        `outputs/ not ingested: ${remote} is a remote database.`,
        "  Keeping local runs out of it is deliberate — set PROMO_INGEST_ALL=1 to override,",
        "  or use a local MONGODB_URI (mongodb://127.0.0.1:27017/promo_finder).",
      ].join("\n"),
    );
    return [];
  }
  const dirs = fs
    .readdirSync(OUTPUTS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => path.join(OUTPUTS_DIR, e.name));
  const out = [];
  for (const d of dirs) {
    const doc = await ingestRunDir(d);
    if (doc) out.push(doc.name);
  }
  return out;
}

export async function episodeSecondsFor(run) {
  const dir = showDirFor(run); // stored path, or the show's folder on this host
  if (!dir) return {};
  try {
    const eps = loadShow(dir);
    return Object.fromEntries(eps.map((e) => [e.number, Math.round(episodeDuration(e) * 100) / 100]));
  } catch {
    return {};
  }
}
