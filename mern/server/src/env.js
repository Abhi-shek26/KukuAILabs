// Configuration for the MERN server. Reads mern/.env and then the repo-root .env
// (the Python CLI's own file), so both apps share one provider key without copying it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // mern/server/src
export const MERN_ROOT = path.resolve(here, "../..");      // mern
export const REPO_ROOT = path.resolve(MERN_ROOT, "..");    // repo root (promo_finder/, outputs/, .env)

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnvFile(path.join(MERN_ROOT, ".env"));
loadEnvFile(path.join(REPO_ROOT, ".env"));

export const PORT = Number(process.env.PORT || 4000);
// 127.0.0.1 locally; container platforms need 0.0.0.0
export const HOST = process.env.HOST || "127.0.0.1";
export const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/promo_finder";
export const OUTPUTS_DIR = path.resolve(REPO_ROOT, process.env.PROMO_OUTPUTS || "outputs");
export const SHOW_ROOTS = (process.env.PROMO_SHOW_ROOTS || "input_pack,uploads,examples").split(",").map((s) => s.trim()).filter(Boolean);
export const TEXT_EXT = [".txt", ".md", ".fountain"];
export const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
export const REQUIRE_USER_KEY = process.env.PROMO_UI_REQUIRE_KEY === "1";
export const DEFAULT_BASE_URL = (process.env.LLM_BASE_URL || "https://platform.qubrid.com/v1").replace(/\/+$/, "");
export const DEFAULT_MODEL = process.env.LLM_MODEL || "zai-org/GLM-4.7-Flash";
export const SERVER_API_KEY = process.env.LLM_API_KEY || process.env.QUBRID_API_KEY || "";
export const CLIENT_DIST = path.resolve(MERN_ROOT, "client", "dist");
export const MAX_BODY = 60 * 1024 * 1024;
