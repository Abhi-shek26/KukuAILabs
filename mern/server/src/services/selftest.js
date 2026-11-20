// A self-check a stranger can run on a deployed copy: /api/selftest.
//
// It exercises the same HTTP routes the UI uses and — most importantly — runs the real
// pipeline once (rules-only, no provider calls, no API key) on the bundled demo show, so a
// reviewer can watch a clip travel from script to storyboard to CSV to MongoDB and back.
//
// Nothing confidential is needed: the demo show is in the repo. Checks that need the private
// pack (input_pack/) or a finished full run (outputs/full_run/) simply report "skipped" when
// those folders are absent — which is the case on any public deployment.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import {
  DEFAULT_BASE_URL, DEFAULT_MODEL, HOST, PORT, PYTHON_BIN, REPO_ROOT, REQUIRE_USER_KEY, SERVER_API_KEY,
} from "../env.js";
import { Promo, Run, Review } from "../models/index.js";
import { parseSummary } from "../lib/screenplay.js";
import { discoverShows } from "./shows.js";
import { ingestRunDir } from "./ingest.js";

const BASE = `http://127.0.0.1:${PORT}`;
const E2E_RUN = "selftest-demo-rules";
const DEMO = { episodes: 3, blocks: 76, minutes: 2.0, warnings: 0 };
const PACK = { episodes: 50, blocks: 3727, minutes: 102.7, warnings: 0 };
const FULL_RUN = { promos: 149, near_duplicates: 6 };

let busy = null; // one self-test at a time; it spawns Python and writes to Mongo

class Report {
  constructor() {
    this.checks = [];
  }
  async step(id, title, fn) {
    const t = Date.now();
    try {
      const detail = await fn();
      this.checks.push({ id, title, status: "pass", detail, ms: Date.now() - t });
    } catch (e) {
      this.checks.push({ id, title, status: "fail", detail: e.message, ms: Date.now() - t });
    }
  }
  skip(id, title, why) {
    this.checks.push({ id, title, status: "skip", detail: why, ms: 0 });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function python(args, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, args, {
      cwd: REPO_ROOT,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
    });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`python did not finish within ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`could not start ${PYTHON_BIN}: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`${PYTHON_BIN} exited ${code}\n${out.trim().slice(-600)}`));
      resolve(out);
    });
  });
}

async function httpJson(url, init) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  const body = await r.text();
  assert(r.ok, `${url} answered HTTP ${r.status}: ${body.slice(0, 200)}`);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${url} did not return JSON`);
  }
}

const httpText = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  assert(r.ok, `${url} answered HTTP ${r.status}`);
  return r.text();
};

const csvRows = (csv) => csv.split("\r\n").filter(Boolean);

function csvHeader(csv) {
  return csvRows(csv)[0];
}

async function cleanupRun(name, dir) {
  await Promise.all([
    Run.deleteOne({ name }),
    Promo.deleteMany({ runName: name }),
    Review.deleteMany({ runName: name }),
  ]);
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
}

export function selftestInProgress() {
  return Boolean(busy);
}

export async function runSelftest({ e2e = true } = {}) {
  if (busy) return busy;
  busy = (async () => {
    const r = new Report();
    const started = Date.now();
    let tmpDir = null;

    // ---------- 1. the stack itself ----------
    await r.step("db.connection", "MongoDB is connected and answering", async () => {
      assert(mongoose.connection.readyState === 1, `mongoose readyState is ${mongoose.connection.readyState}`);
      await mongoose.connection.db.admin().ping();
      return `${mongoose.connection.name} @ ${mongoose.connection.host}`;
    });

    await r.step("db.documents", "Runs, clips and reviews are stored as documents", async () => {
      const [runs, promos, reviews] = await Promise.all([Run.countDocuments(), Promo.countDocuments(), Review.countDocuments()]);
      if (runs === 0) return "empty database — the pipeline check below writes a run from scratch, so this is expected on a fresh deploy";
      assert(promos > 0, `${runs} run(s) but no clips were ingested`);
      return `${runs} runs · ${promos} clips · ${reviews} reviews`;
    });

    await r.step("api.health", "GET /api/health", async () => {
      const h = await httpJson(`${BASE}/api/health`);
      assert(h.ok === true && h.stack === "MERN", `unexpected payload ${JSON.stringify(h).slice(0, 120)}`);
      return `${h.stack} · up ${h.uptime}s`;
    });

    await r.step("api.config", "GET /api/config reports the provider defaults", async () => {
      const c = await httpJson(`${BASE}/api/config`);
      assert(c.default_model === DEFAULT_MODEL, `default_model is ${c.default_model}, expected ${DEFAULT_MODEL}`);
      assert(c.default_base_url === DEFAULT_BASE_URL, `default_base_url is ${c.default_base_url}`);
      assert(typeof c.has_server_key === "boolean", "has_server_key missing");
      assert(c.has_server_key === (Boolean(SERVER_API_KEY) && !REQUIRE_USER_KEY), "has_server_key disagrees with the server's env");
      return `${c.default_model} · key ${c.has_server_key ? "server-side" : "user must supply"} · require_user_key=${c.require_user_key}`;
    });

    await r.step("api.shows", "GET /api/shows finds the demo show on disk", async () => {
      const { shows } = await httpJson(`${BASE}/api/shows`);
      assert(Array.isArray(shows) && shows.length > 0, "no show folders found");
      assert(shows.some((s) => s.name === "demo_show"), `demo_show not found in [${shows.map((s) => s.name).join(", ")}]`);
      return shows.map((s) => s.name).join(" · ");
    });

    // ---------- 2. the parser: Node vs the numbers the Python parser produced ----------
    await r.step("parser.demo", "Script parser matches the known demo-show totals", async () => {
      const demo = discoverShows().find((s) => s.name === "demo_show");
      assert(demo, "demo_show is not on disk");
      const p = parseSummary(path.resolve(REPO_ROOT, demo.id));
      assert(p.episodes === DEMO.episodes, `${p.episodes} episodes, expected ${DEMO.episodes}`);
      assert(p.blocks === DEMO.blocks, `${p.blocks} blocks, expected ${DEMO.blocks}`);
      assert(Math.abs(p.minutes - DEMO.minutes) < 0.05, `${p.minutes} min, expected ${DEMO.minutes}`);
      assert(p.warnings === DEMO.warnings, `${p.warnings} format warnings, expected ${DEMO.warnings}`);
      assert(p.list.length === DEMO.episodes, `list has ${p.list.length} episodes`);
      return `${p.episodes} eps · ${p.blocks} blocks · ${p.minutes.toFixed(1)} min · ${p.warnings} warnings`;
    });

    const packDir = discoverShows().find((s) => s.name.startsWith("I Married a Broken Soldier"));
    if (packDir) {
      await r.step("parser.pack", "Parser reproduces the 50-episode pack totals", async () => {
        const p = parseSummary(path.resolve(REPO_ROOT, packDir.id));
        assert(p.episodes === PACK.episodes, `${p.episodes} episodes, expected ${PACK.episodes}`);
        assert(p.blocks === PACK.blocks, `${p.blocks} blocks, expected ${PACK.blocks}`);
        assert(Math.abs(p.minutes - PACK.minutes) < 0.05, `${p.minutes} min, expected ${PACK.minutes}`);
        assert(p.warnings === PACK.warnings, `${p.warnings} warnings, expected 0`);
        return `${p.episodes} eps · ${p.blocks} blocks · ${p.minutes.toFixed(1)} min · 0 warnings`;
      });
    } else {
      r.skip("parser.pack", "Parser reproduces the 50-episode pack totals", "input_pack/ is not part of this deployment (it is Kuku's script, never committed)");
    }

    // ---------- 3. the pipeline, end to end, rules-only ----------
    if (e2e) {
      const demo = discoverShows().find((s) => s.name === "demo_show");
      if (!demo) {
        r.skip("pipeline.e2e", "Rules-only pipeline run on the demo show", "demo_show is not on disk");
      } else {
        const showDir = path.resolve(REPO_ROOT, demo.id);
        let promosJson = null;
        try {
          await r.step("pipeline.run", "`python -m promo_finder run` produces a ranked shortlist (no API key, no cost)", async () => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "promo-selftest-"));
            const outDir = path.join(tmpDir, E2E_RUN);
            await python(["-u", "-m", "promo_finder", "run", showDir, "--out", outDir, "--no-llm"]);
            const file = path.join(outDir, "promos.json");
            assert(fs.existsSync(file), "promos.json was not written");
            promosJson = JSON.parse(fs.readFileSync(file, "utf8"));
            const clips = promosJson.promos || [];
            assert(clips.length > 0, "the run ranked zero clips");
            for (const p of clips) {
              assert(p.duration_seconds >= 19.9 && p.duration_seconds <= 60.1, `${p.id} lasts ${p.duration_seconds}s (rule: 20-60s)`);
              const order = p.segments.map((s) => [s.episode, s.start_seconds]);
              assert(JSON.stringify(order) === JSON.stringify([...order].sort((a, b) => a[0] - b[0] || a[1] - b[1])), `${p.id} has segments out of story order`);
            }
            return `${clips.length} clips · ${promosJson.near_duplicates?.length || 0} near-duplicates · model ${promosJson.model || "rules-only"}`;
          });

          await r.step("pipeline.audit", "Cut audit (tools/audit_cuts.py) finds no broken boundaries", async () => {
            assert(tmpDir, "the run did not happen");
            const out = await python(["tools/audit_cuts.py", path.join(tmpDir, E2E_RUN, "promos.json"), showDir]);
            const line = out.split(/\r?\n/).find((l) => l.includes("clips audited")) || out.trim();
            assert(/\b0 with a problem, 0 problems\b/.test(line), line);
            return line;
          });

          await r.step("pipeline.ingest", "The run is loaded into MongoDB and served by the API", async () => {
            await cleanupRun(E2E_RUN, null);
            await ingestRunDir(path.join(tmpDir, E2E_RUN));
            const payload = await httpJson(`${BASE}/api/runs/${E2E_RUN}/promos`);
            assert(payload.promos.length === promosJson.promos.length, `API returned ${payload.promos.length} clips, the run wrote ${promosJson.promos.length}`);
            assert(Object.keys(payload.episode_seconds || {}).length > 0, "episode_seconds is empty — the storyboard cannot be built");
            assert(Object.keys(payload.reviews || {}).length === 0, "a fresh run already has reviews");
            return `${payload.promos.length} clips served · ${Object.keys(payload.episode_seconds).length} episode lengths`;
          });

          await r.step("storyboard.clip", "A clip's storyboard lines up with its own cut", async () => {
            const payload = await httpJson(`${BASE}/api/runs/${E2E_RUN}/promos`);
            const first = payload.promos[0];
            const clip = await httpJson(`${BASE}/api/runs/${E2E_RUN}/clip/${encodeURIComponent(first.id)}`);
            assert(Array.isArray(clip.lines) && clip.lines.length > 0, "no storyboard lines");
            assert(clip.lines.every((l) => Number.isFinite(l.t) && Number.isFinite(l.t_end)), "a line has no timestamp");
            assert(clip.lines[0].t <= 0.01, `the storyboard starts at +${clip.lines[0].t}s instead of 0`);
            const last = clip.lines[clip.lines.length - 1];
            assert(Math.abs(last.t_end - first.duration_seconds) < 1.5, `storyboard ends at ${last.t_end}s but the clip lasts ${first.duration_seconds}s`);
            assert(Array.isArray(clip.after), "the 'after the cut' list is missing");
            return `${clip.lines.length} lines · ends +${last.t_end}s of ${first.duration_seconds}s · ${clip.after.length} lines after the cut`;
          });

          await r.step("review.roundtrip", "✓ Post is saved in MongoDB, shows up in the CSV, and clears again", async () => {
            const payload = await httpJson(`${BASE}/api/runs/${E2E_RUN}/promos`);
            const target = payload.promos[0].id;
            const before = await httpText(`${BASE}/api/runs/${E2E_RUN}/export.csv`);
            assert(csvRows(before).length === payload.promos.length + 1, "CSV row count does not match the clip count");
            assert(csvHeader(before).startsWith("rank,id,type,title,segments,duration_s,hook,cliffhanger,why_it_works"), "CSV header changed");

            const marked = await httpJson(`${BASE}/api/runs/${E2E_RUN}/review`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: target, verdict: "post", note: "selftest" }),
            });
            assert(marked.reviews?.[target]?.verdict === "post", "the review did not come back from the API");
            const withReview = await httpText(`${BASE}/api/runs/${E2E_RUN}/export.csv`);
            assert(withReview.includes(",post,selftest"), "the verdict is missing from the exported CSV");
            assert(csvRows(withReview).length === csvRows(before).length, "the CSV gained or lost rows");

            const cleared = await httpJson(`${BASE}/api/runs/${E2E_RUN}/review`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: target, verdict: "", note: "" }),
            });
            assert(Object.keys(cleared.reviews || {}).length === 0, "clearing the review left a row behind");
            const after = await httpText(`${BASE}/api/runs/${E2E_RUN}/export.csv`);
            assert(after === before, "the CSV did not return to its original bytes after clearing the review");
            return `${target}: post → CSV → clear → identical CSV (${before.length} bytes)`;
          });
        } finally {
          await cleanupRun(E2E_RUN, tmpDir);
          tmpDir = null;
        }
      }
    } else {
      r.skip("pipeline.run", "Rules-only pipeline run on the demo show", "disabled with ?e2e=0");
    }

    // ---------- 4. the finished run, when it is present ----------
    const fullRun = await Run.findOne({ name: "full_run" }).lean();
    if (fullRun?.ready) {
      await r.step("full_run.ranking", "The submitted 149-clip run is intact and correctly ordered", async () => {
        const payload = await httpJson(`${BASE}/api/runs/full_run/promos`);
        assert(payload.promos.length === FULL_RUN.promos, `${payload.promos.length} clips, expected ${FULL_RUN.promos}`);
        assert(payload.near_duplicates.length === FULL_RUN.near_duplicates, `${payload.near_duplicates.length} near-duplicates, expected ${FULL_RUN.near_duplicates}`);
        const ranks = payload.promos.map((p) => p.rank);
        assert(JSON.stringify(ranks) === JSON.stringify([...Array(FULL_RUN.promos).keys()].map((i) => i + 1)), "ranks are not 1..149");
        const scores = payload.promos.map((p) => p.score);
        assert(Math.max(...scores) === scores[0], `rank 1 scores ${scores[0]} but the maximum is ${Math.max(...scores)}`);
        assert(scores.filter((s) => !Number.isFinite(s)).length === 0, "a clip has no numeric score");
        assert(new Set(payload.promos.map((p) => p.id)).size === FULL_RUN.promos, "duplicate clip ids");
        assert(payload.promos.every((p) => p.hook && p.cliffhanger && p.why_it_works), "a clip is missing hook/cliffhanger/why_it_works");
        return `${payload.promos.length} clips · top ${payload.promos[0].id} ${payload.promos[0].score} · ${payload.near_duplicates.length} near-dups set aside`;
      });

      await r.step("full_run.export", "The editor CSV covers every ranked clip", async () => {
        const csv = await httpText(`${BASE}/api/runs/full_run/export.csv`);
        const rows = csvRows(csv);
        assert(rows.length === FULL_RUN.promos + 1, `${rows.length - 1} rows, expected ${FULL_RUN.promos}`);
        assert(csvHeader(csv).split(",").length === 17, `header has ${csvHeader(csv).split(",").length} columns, expected 17`);
        return `${rows.length - 1} rows · ${csv.length} bytes · 17 columns`;
      });
    } else {
      r.skip("full_run.ranking", "The submitted 149-clip run is intact and correctly ordered", "outputs/full_run is not part of this deployment (it quotes Kuku's script)");
    }

    const pass = r.checks.filter((c) => c.status === "pass").length;
    const fail = r.checks.filter((c) => c.status === "fail").length;
    const skip = r.checks.filter((c) => c.status === "skip").length;
    return {
      ok: fail === 0,
      stack: "MERN",
      host: `${HOST}:${PORT}`,
      generatedAt: new Date().toISOString(),
      duration_ms: Date.now() - started,
      summary: { pass, fail, skip, total: r.checks.length },
      checks: r.checks,
    };
  })().finally(() => {
    busy = null;
  });
  return busy;
}
