// A fresh deployment has an empty database and no finished run, which would make the app
// look broken to a reviewer. So on an empty deployment we produce one small run ourselves:
// the bundled demo show, rules-only (no API key, no cost, ~0.5 s).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { OUTPUTS_DIR, PYTHON_BIN, REPO_ROOT } from "../env.js";
import { Run } from "../models/index.js";
import { discoverShows } from "./shows.js";
import { ingestRunDir } from "./ingest.js";

export const DEMO_RUN = "demo_show-rules";

function runPython(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, args, { cwd: REPO_ROOT, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`python exited ${code}: ${err.trim().slice(-300)}`))));
  });
}

// Keeps exactly one demo run present. It used to act only on a completely empty database, which
// meant a laptop whose outputs/ already had runs never got the demo — the one run that works with
// no API key. It is cheap (one rules-only pass, ~0.5 s, $0) and the name is deterministic, so it
// cannot duplicate. PROMO_SEED_DEMO=0 turns it off.
export async function ensureDemoRun({ enabled = true } = {}) {
  if (!enabled) return null;
  if (await Run.countDocuments({ name: DEMO_RUN })) return null;
  const demo = discoverShows().find((s) => s.name === "demo_show");
  if (!demo) return null;

  const outDir = path.join(OUTPUTS_DIR, DEMO_RUN);
  if (!fs.existsSync(path.join(outDir, "promos.json"))) {
    fs.mkdirSync(outDir, { recursive: true });
    await runPython(["-u", "-m", "promo_finder", "run", path.resolve(REPO_ROOT, demo.id), "--out", outDir, "--no-llm"]);
  }
  await ingestRunDir(outDir);
  return DEMO_RUN;
}
