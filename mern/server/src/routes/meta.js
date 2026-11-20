import express from "express";
import { DEFAULT_BASE_URL, DEFAULT_MODEL, REQUIRE_USER_KEY, SERVER_API_KEY } from "../env.js";
import { Run } from "../models/index.js";
import { discoverShows, resolveShow } from "../services/shows.js";
import { parseSummary } from "../lib/screenplay.js";
import { activeJobId } from "../services/jobRunner.js";

export const meta = express.Router();

const modelsCache = new Map(); // key -> [time, rows]

meta.get("/config", async (_req, res) => {
  const active = (await Run.find({ active: true }).lean()).map((r) => r.name);
  if (activeJobId()) active.push("a run started in this app");
  res.json({
    default_model: DEFAULT_MODEL,
    default_base_url: DEFAULT_BASE_URL,
    has_server_key: Boolean(SERVER_API_KEY) && !REQUIRE_USER_KEY,
    require_user_key: REQUIRE_USER_KEY,
    active_runs: active,
    stack: "MERN",
  });
});

meta.get("/shows", (_req, res) => {
  res.json({ shows: discoverShows() });
});

// Mirrors GET /api/models: price per 1M tokens, cheapest first, 10-minute cache.
meta.get("/models", async (req, res, next) => {
  try {
    const base = String(req.query.base_url || DEFAULT_BASE_URL).replace(/\/+$/, "");
    let key = req.get("X-Api-Key") || "";
    if (!key && base === DEFAULT_BASE_URL && !REQUIRE_USER_KEY) key = SERVER_API_KEY;

    const ck = `${base}|${key ? key.slice(-8) : ""}`;
    const hit = modelsCache.get(ck);
    if (hit && Date.now() - hit[0] < 600_000) return res.json({ models: hit[1], cached: true });

    const r = await fetch(`${base}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`the provider answered HTTP ${r.status}`);
    const payload = await r.json();
    const raw = Array.isArray(payload) ? payload : payload.data || [];
    const rows = raw
      .map((m) => {
        const pr = m.pricing || {};
        const pin = Number(pr.input);
        const pout = Number(pr.output);
        return {
          id: m.id || m.name,
          in: Number.isFinite(pin) ? pin : null,
          out: Number.isFinite(pout) ? pout : null,
          context: m.context_length ?? m.context_window ?? null,
        };
      })
      .sort((a, b) => (a.in === null) - (b.in === null) || (a.in || 0) + (a.out || 0) - ((b.in || 0) + (b.out || 0)) || String(a.id).localeCompare(String(b.id)));

    modelsCache.set(ck, [Date.now(), rows]);
    res.json({ models: rows });
  } catch (e) {
    next(Object.assign(e, { status: 502 }));
  }
});

meta.post("/parse", (req, res, next) => {
  try {
    const dir = resolveShow(String(req.body?.show || ""));
    res.json(parseSummary(dir));
  } catch (e) {
    next(Object.assign(e, { status: 400 }));
  }
});
