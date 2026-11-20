import express from "express";
import fs from "node:fs";
import path from "node:path";
import { OUTPUTS_DIR } from "../env.js";
import { Run, Promo, Review } from "../models/index.js";
import { episodeSecondsFor } from "../services/ingest.js";
import { clipPayload } from "../services/clip.js";
import { csvFilename, editorCsv } from "../services/csv.js";

export const runs = express.Router();

const DOWNLOADABLE = new Set(["promos.csv", "promos.json", "promos.md", "report.html", "run_summary.json"]);

async function getRun(name) {
  const run = await Run.findOne({ name }).lean();
  if (!run) throw Object.assign(new Error("unknown run"), { status: 404 });
  return run;
}

async function reviewsMap(runName) {
  const rows = await Review.find({ runName }).lean();
  const out = {};
  for (const r of rows) {
    if (!r.verdict && !r.note) continue;
    out[r.promoId] = { verdict: r.verdict || "", note: r.note || "", time: r.time || "" };
  }
  return out;
}

// Run picker: same fields the Python UI uses (name, model, promos, ready, active…).
runs.get("/runs", async (_req, res, next) => {
  try {
    const rows = await Run.find().sort({ modified: -1 }).lean();
    res.json({
      runs: rows.map((r) => ({
        name: r.name,
        ready: r.ready,
        modified: r.modified,
        show: r.show,
        episodes: r.episodes,
        promos: r.promos,
        model: r.model,
        cost: r.cost,
        seconds: r.seconds,
        mode: r.mode,
        active: r.active,
        progress_hint: r.progressHint,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// Everything the Promos tab needs, in one payload (promos.json + reviews + episode lengths).
runs.get("/runs/:run/promos", async (req, res, next) => {
  try {
    const run = await getRun(req.params.run);
    if (!run.ready) return res.status(404).json({ error: "this run has not finished yet" });

    const rows = await Promo.find({ runName: run.name, near_duplicate: { $ne: true } }).sort({ rank: 1 }).lean();
    const dups = await Promo.find({ runName: run.name, near_duplicate: true }).lean();
    const episodeSeconds = await episodeSecondsFor(run);
    const clean = (p) => {
      const { _id, __v, runName, near_duplicate, ...rest } = p;
      return rest;
    };
    res.json({
      show: run.show,
      generated: run.generated,
      summary: run.summary,
      promos: rows.map(clean),
      near_duplicates: dups.map(clean),
      reviews: await reviewsMap(run.name),
      episode_seconds: episodeSeconds,
      run: run.name,
      // Ask the disk, not the stored flag: the same database may be served from another host.
      scripts_available: Object.keys(episodeSeconds).length > 0,
    });
  } catch (e) {
    next(e);
  }
});

runs.get("/runs/:run/clip/:id", async (req, res, next) => {
  try {
    const run = await getRun(req.params.run);
    const promo = await Promo.findOne({ runName: run.name, id: req.params.id }).lean();
    // The Python API answers 400 for an unknown clip or missing scripts; match it.
    if (!promo) return res.status(400).json({ error: "unknown promo" });
    res.json(clipPayload(run, promo));
  } catch (e) {
    next(Object.assign(e, { status: 400 }));
  }
});

runs.get("/runs/:run/file/:name", async (req, res, next) => {
  try {
    const run = await getRun(req.params.run);
    const name = req.params.name;
    if (!DOWNLOADABLE.has(name)) return res.status(404).json({ error: "not found" });
    const file = path.join(OUTPUTS_DIR, path.basename(run.name), name);
    if (!fs.existsSync(file)) return res.status(404).json({ error: "file not found" });
    const ext = name.split(".").pop();
    const ctype = { csv: "text/csv", json: "application/json", md: "text/markdown", html: "text/html" }[ext] || "text/plain";
    const safe = run.name.replace(/[^A-Za-z0-9._-]+/g, "_");
    res.setHeader("Content-Type", `${ctype}; charset=utf-8`);
    res.setHeader("Content-Disposition", name.endsWith(".html") ? "inline" : `attachment; filename="${safe}-${name}"`);
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    next(e);
  }
});

// The editor sheet, built from Mongo (promos + reviews), not from a file.
runs.get("/runs/:run/export.csv", async (req, res, next) => {
  try {
    const run = await getRun(req.params.run);
    const promos = await Promo.find({ runName: run.name, near_duplicate: { $ne: true } }).sort({ rank: 1 }).lean();
    const csv = editorCsv(promos, await reviewsMap(run.name), run.name);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${csvFilename(run.name)}"`);
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

// ✓ Post / ✗ Skip, persisted in MongoDB.
runs.post("/runs/:run/review", async (req, res, next) => {
  try {
    const run = await getRun(req.params.run);
    const verdict = String(req.body?.verdict ?? "");
    if (!["post", "skip", ""].includes(verdict)) throw Object.assign(new Error("verdict must be post, skip or empty"), { status: 400 });
    const promoId = String(req.body?.id ?? "");
    if (!/^[A-Za-z0-9\-_]{1,40}$/.test(promoId)) throw Object.assign(new Error("bad promo id"), { status: 400 });
    const note = String(req.body?.note ?? "").slice(0, 1000);

    if (!verdict && !note) {
      await Review.deleteOne({ runName: run.name, promoId });
    } else {
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, "0");
      const time = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
      await Review.findOneAndUpdate({ runName: run.name, promoId }, { $set: { verdict, note, time } }, { upsert: true });
    }
    res.json({ reviews: await reviewsMap(run.name) });
  } catch (e) {
    next(e);
  }
});
