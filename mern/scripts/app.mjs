#!/usr/bin/env node
// One command that brings the whole app up, the way `python -m promo_finder serve --open`
// used to: install deps on first run, check MongoDB, start the Express API and the Vite dev
// server, then open the browser on the UI. Ctrl+C stops both.
//
//   npm run app            (from mern/, or `npm run app` from the repo root)
//   npm run app -- --no-open
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MERN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(MERN, "..");
const UI = "http://localhost:5173";
const API = `http://127.0.0.1:${process.env.PORT || 4000}`;
const OPEN = !(process.argv.includes("--no-open") || process.env.NO_OPEN === "1");
const C = { dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", cyan: "\x1b[36m", off: "\x1b[0m" };
const say = (m) => console.log(m);
const pad = (tag, s) => s.split("\n").filter(Boolean).map((l) => `${C.dim}[${tag}]${C.off} ${l}`).join("\n");

// ---- 1. .env (MONGODB_URI), created from the example on first run
const envFile = path.join(MERN, ".env");
const example = path.join(MERN, ".env.example");
if (!existsSync(envFile) && existsSync(example)) {
  copyFileSync(example, envFile);
  say(`${C.cyan}created mern/.env from .env.example${C.off} — open it and set MONGODB_URI if you have not already.`);
}
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    const v = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined && v !== "") process.env[m[1]] = v;
  }
}

// ---- 2. dependencies (once)
const rootDeps = existsSync(path.join(MERN, "node_modules", "concurrently"));
const missing = ["server", "client"].filter((d) => !existsSync(path.join(MERN, d, "node_modules")));
if (!rootDeps || missing.length) {
  say(`${C.cyan}installing dependencies (first run only)…${C.off}`);
  const steps = rootDeps ? [] : [["install", []]];
  if (missing.length) steps.push(["run", ["install:all"]]);
  for (const [cmd, args] of steps) {
    const r = spawnSync("npm", [cmd, ...args], { cwd: MERN, stdio: "inherit", shell: true });
    if (r.status !== 0) {
      say(`${C.red}npm ${cmd} ${args.join(" ")} failed${C.off}`);
      process.exit(r.status || 1);
    }
  }
}

// ---- 3. MongoDB reachable? (the one thing Python never needed)
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/promo_finder";
function mongoTarget() {
  if (uri.startsWith("mongodb+srv://")) return null; // Atlas: tested by the driver, not by us
  const hostPort = uri.replace(/^mongodb:\/\//, "").split("@").pop().split("/")[0];
  const [host, port] = hostPort.split(":");
  return { host: host || "127.0.0.1", port: Number(port) || 27017 };
}
const target = mongoTarget();
function tcp({ host, port }, ms = 1500) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok) => (s.destroy(), resolve(ok));
    s.setTimeout(ms);
    s.once("connect", () => done(true));
    s.once("timeout", () => done(false));
    s.once("error", () => done(false));
  });
}
if (target && !(await tcp(target))) {
  say(`${C.red}MongoDB is not answering on ${target.host}:${target.port}${C.off}`);
  say("  Windows:  net start MongoDB");
  say("  macOS:    brew services start mongodb-community");
  say("  or point MONGODB_URI in mern/.env at a free Atlas cluster (see mern/DEPLOY.md)");
  process.exit(1);
}
say(`${C.dim}mongo: ${target ? `${target.host}:${target.port}` : "Atlas (SRV)"}${C.off}`);

// ---- 3b. ports. A leftover API from an earlier session is the most common failure:
// "listen EADDRINUSE 127.0.0.1:4000". Reuse it if it is ours, explain it if it is not.
const API_PORT = Number(process.env.PORT || 4000);
const UI_PORT = 5173;
async function ours(base) {
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    return Boolean(j && j.ok && j.stack === "MERN");
  } catch {
    return false;
  }
}
async function busy(port) {
  if (await tcp({ host: "127.0.0.1", port }, 800)) return true;
  return tcp({ host: "::1", port }, 800);
}
async function serving(base) {
  try {
    const r = await fetch(base, { signal: AbortSignal.timeout(1500) });
    return r.status > 0;
  } catch {
    return false;
  }
}
const apiOurs = await ours(API);
const uiUp = (await serving(UI)) || (await busy(UI_PORT));

if (apiOurs && uiUp) {
  say(`${C.green}Promo Finder is already running${C.off} — opening ${UI}`);
  if (OPEN) open(UI);
  process.exit(0);
}
let runApi = true;
if (apiOurs) {
  runApi = false;
  say(`${C.cyan}port ${API_PORT} already has a Promo Finder API — reusing it, starting only the UI${C.off}`);
} else if (await busy(API_PORT)) {
  say(`${C.red}port ${API_PORT} is taken by another program${C.off} (not a Promo Finder API).`);
  say(`  stop it, or use another port:  PowerShell  $env:PORT=4001; npm run app`);
  if (process.platform !== "win32") say(`                                 bash        PORT=4001 npm run app`);
  else say(`                                 cmd         set PORT=4001 && npm run app`);
  say(`  to see who holds it:  ${process.platform === "win32" ? `netstat -ano | findstr :${API_PORT}` : `lsof -i :${API_PORT}`}`);
  process.exit(1);
}
if (uiUp) {
  say(`${C.red}port ${UI_PORT} is already in use by something that is not${C.off} this app's API.`);
  say("  press Ctrl+C in the terminal that started it (a Vite dev server from an earlier run),");
  say(`  or free the port:  ${process.platform === "win32" ? "netstat -ano | findstr :5173" : "lsof -i :5173"}`);
  process.exit(1);
}

// ---- 4. run both processes
const kids = [];
function start(tag, color, args) {
  const child = spawn("npm", args, { cwd: MERN, shell: true, env: process.env });
  kids.push(child);
  child.stdout.on("data", (b) => process.stdout.write(pad(tag, String(b).trimEnd()) + "\n"));
  child.stderr.on("data", (b) => process.stderr.write(pad(tag, String(b).trimEnd()) + "\n"));
  child.on("exit", (code) => {
    if (code && !stopping) {
      say(`${C.red}[${tag}] exited with code ${code}${C.off}`);
      stop(code);
    }
  });
  return child;
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const k of kids) {
    if (!k.pid || k.exitCode !== null) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(k.pid), "/T", "/F"], { stdio: "ignore" });
    else k.kill("SIGTERM");
  }
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

function open(url) {
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore" }).unref();
}

say(`${C.cyan}starting ${runApi ? `the API (:${API_PORT}) and ` : ""}the UI (:${UI_PORT})…${C.off}`);
if (runApi) start("api", C.cyan, ["run", "dev:server"]);
start("web", C.cyan, ["run", "dev:client"]);

// ---- 5. open the browser once Vite answers
async function ready(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1200) });
      if (r.ok || r.status === 404) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
// The API connects to MongoDB and ingests outputs/ before it listens, which can take a few
// seconds: wait for it too, or the page's first /api/* calls hit a dead port
// (vite proxy "ECONNREFUSED 127.0.0.1:4000") and the app shows an error until a reload.
const uiReady = await ready(UI);
const apiUp = runApi ? await ready(`${API}/api/health`, 120) : true;
const crashed = kids.find((k) => k.exitCode !== null && k.exitCode !== 0);
if (crashed) {
  say(`${C.red}a process exited while starting (code ${crashed.exitCode}) — see the log above${C.off}`);
} else if (uiReady && apiUp) {
  say("");
  say(`${C.green}Promo Finder is up${C.off}  ${UI}`);
  say(`  API      ${API}/api/health`);
  say(`  Self-test ${API}/verify   ${C.dim}(one button, ~10 s)${C.off}`);
  say(`  ${C.dim}Ctrl+C stops both.${C.off}`);
  say("");
  if (OPEN) open(UI);
} else {
  if (!uiReady) say(`${C.red}the UI did not answer on ${UI} — see the [web] log above${C.off}`);
  else say(`${C.red}the API did not answer on ${API} — see the [api] log above${C.off}`);
}
