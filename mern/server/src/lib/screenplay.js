// Node port of promo_finder/screenplay.py — the same regexes and the same ordering,
// so the storyboard in the MERN app matches the Python UI block for block.
// Verified against `python -m promo_finder parse` on all 50 episodes of the real pack.
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, TEXT_EXT } from "../env.js";
import { parseTs, round2 } from "./fmt.js";

const TS = String.raw`(?:\d{1,2}:)?\d{1,3}:\d{2}(?:[.,]\d+)?`;
const RE_TS_LINE = new RegExp(
  String.raw`^\s*start\s*:\s*\(?\s*(` + TS + String.raw`)\s*\)?\s*\|\s*end\s*:\s*\(?\s*(` + TS + String.raw`)\s*\)?\s*$`,
  "i"
);
const RE_HEADER = /^\s*\*\*\s*([^*]+?)\s*(?::\s*\*\*|\*\*\s*:)\s*$/;
const RE_SCENE = /^\s*\**\s*SCENE\s+(\d+)\s*\**\s*:?\s*$/i;
const RE_SCENE_FIELD = /^\s*scene\s+(heading|start|end)\s*:\s*(.*)$/i;
const RE_META = /^\s*(EPISODE NUMBER|EPISODE LOGLINE|CONTINUITY NOTES|EPISODE TITLE)\s*:\s*(.*)$/i;

const KIND_ALIASES = {
  CAMERA: "CAMERA", SHOT: "CAMERA", CAM: "CAMERA",
  ACTION: "ACTION", ACTIONS: "ACTION",
  "SOUND FX": "SFX", SOUND: "SFX", SFX: "SFX", MUSIC: "SFX", "SOUND EFFECT": "SFX",
  TEXT: "TEXT", "TEXT ON SCREEN": "TEXT", SUPER: "TEXT", TITLE: "TEXT", CAPTION: "TEXT",
};

const ORDER = { CAMERA: 0, ACTION: 1, SFX: 2, TEXT: 3, DIALOGUE: 4, OTHER: 5 };

function splitHeader(h) {
  const key = h.replace(/\s+/g, " ").trim();
  const up = key.toUpperCase();
  if (KIND_ALIASES[up]) return { kind: KIND_ALIASES[up], speaker: "", tags: "" };
  const base = key.split(/[(:]/)[0].trim();
  if (KIND_ALIASES[base.toUpperCase()]) return { kind: KIND_ALIASES[base.toUpperCase()], speaker: "", tags: "" };
  const tags = [...key.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean).join("; ");
  return { kind: "DIALOGUE", speaker: base.toUpperCase(), tags };
}

export function parseEpisode(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n").split("\n");

  const meta = {};
  for (const ln of lines.slice(0, 40)) {
    const m = RE_META.exec(ln);
    if (m) meta[m[1].toUpperCase()] = m[2].trim();
  }

  const fname = path.basename(file);
  let num = null;
  for (const src of [meta["EPISODE NUMBER"] || "", fname]) {
    const m = /(\d+)/.exec(src);
    if (m) {
      num = parseInt(m[1], 10);
      break;
    }
  }

  const ep = {
    number: num || 0,
    title: meta["EPISODE TITLE"] || meta["EPISODE NUMBER"] || fname,
    logline: meta["EPISODE LOGLINE"] || "",
    continuity: meta["CONTINUITY NOTES"] || "",
    path: file,
    scenes: [],
    blocks: [],
    warnings: [],
  };

  const raw = [];
  let sceneNo = 0;
  let curScene = null;
  const n = lines.length;
  let i = 0;

  while (i < n) {
    const ln = lines[i];

    const ms = RE_SCENE.exec(ln);
    if (ms) {
      sceneNo = parseInt(ms[1], 10);
      curScene = { number: sceneNo, heading: "", start: null, end: null };
      ep.scenes.push(curScene);
      i += 1;
      continue;
    }

    const mf = curScene ? RE_SCENE_FIELD.exec(ln) : null;
    if (mf) {
      const k = mf[1].toLowerCase();
      const v = mf[2].trim();
      if (k === "heading") curScene.heading = v;
      else {
        const t = parseTs(v);
        if (!Number.isFinite(t)) ep.warnings.push(`bad scene ${k} time '${v}' (scene ${sceneNo})`);
        else curScene[k] = t;
      }
      i += 1;
      continue;
    }

    const mh = RE_HEADER.exec(ln);
    if (mh) {
      const { kind, speaker, tags } = splitHeader(mh[1]);
      let j = i + 1;
      while (j < n && !lines[j].trim()) j += 1;
      const mt = j < n ? RE_TS_LINE.exec(lines[j]) : null;
      if (!mt) {
        ep.warnings.push(`header without timestamp at line ${i + 1}: ${ln.trim().slice(0, 60)}`);
        i += 1;
        continue;
      }
      let start = parseTs(mt[1]);
      let end = parseTs(mt[2]);
      let k = j + 1;
      const textLines = [];
      while (
        k < n &&
        lines[k].trim() &&
        !RE_HEADER.test(lines[k]) &&
        !RE_SCENE.test(lines[k]) &&
        !lines[k].startsWith("---")
      ) {
        textLines.push(lines[k].trim());
        k += 1;
      }
      const text = textLines.join(" ").trim();
      if (end < start) {
        ep.warnings.push(`end<start at line ${j + 1}; swapped`);
        [start, end] = [end, start];
      }
      raw.push({ kind, speaker, tags, start, end, text, scene: sceneNo });
      i = k;
      continue;
    }

    i += 1;
  }

  // Same stable order as Python: by start time, shots first, then file order.
  const sorted = raw
    .map((r, idx) => ({ r, idx }))
    .sort((a, b) => {
      const sa = round2(a.r.start), sb = round2(b.r.start);
      if (sa !== sb) return sa - sb;
      const ka = ORDER[a.r.kind] ?? 9, kb = ORDER[b.r.kind] ?? 9;
      if (ka !== kb) return ka - kb;
      return a.idx - b.idx;
    })
    .map((x) => x.r);

  sorted.forEach((r, idx) => {
    ep.blocks.push({
      bid: `B${String(idx + 1).padStart(3, "0")}`,
      kind: r.kind,
      start: r.start,
      end: r.end,
      text: r.text,
      speaker: r.speaker,
      tags: r.tags,
      scene: r.scene,
      label: r.kind === "DIALOGUE" ? `${r.speaker}${r.tags ? ` (${r.tags})` : ""}` : r.kind,
    });
  });

  if (!ep.blocks.length) ep.warnings.push("no timestamped blocks found - check the file format");
  return ep;
}

export function episodeDuration(ep) {
  const ends = [...ep.blocks.map((b) => b.end), ...ep.scenes.filter((s) => s.end != null).map((s) => s.end)].filter(Number.isFinite);
  return ends.length ? Math.max(...ends) : 0;
}

export function loadShow(folder) {
  const files = fs
    .readdirSync(folder)
    .filter((f) => TEXT_EXT.includes(path.extname(f).toLowerCase()) && !f.startsWith("."))
    .sort()
    .map((f) => path.join(folder, f));
  const eps = files.map(parseEpisode);
  eps.sort((a, b) => a.number - b.number);
  return eps;
}

export function blocksBetween(ep, start, end) {
  return ep.blocks.filter((b) => b.end > start + 0.05 && b.start < end - 0.05);
}

// Same shape as Python's parse_summary() for the /api/parse endpoint.
export function parseSummary(folder) {
  const eps = loadShow(folder);
  return {
    show: path.relative(REPO_ROOT, folder),
    episodes: eps.length,
    blocks: eps.reduce((n, e) => n + e.blocks.length, 0),
    minutes: Math.round((eps.reduce((n, e) => n + episodeDuration(e), 0) / 60) * 10) / 10,
    warnings: eps.reduce((n, e) => n + e.warnings.length, 0),
    list: eps.map((e) => ({
      n: e.number,
      seconds: Math.round(episodeDuration(e) * 10) / 10,
      blocks: e.blocks.length,
      scenes: e.scenes.length,
      logline: (e.logline || "").slice(0, 160),
      warnings: e.warnings.slice(0, 3),
    })),
  };
}

// Cached per folder+mtime, like the Python server's _show_cache.
const cache = new Map();
export function episodesFor(folder) {
  let stamp = 0;
  try {
    stamp = Math.max(...fs.readdirSync(folder).map((f) => fs.statSync(path.join(folder, f)).mtimeMs));
  } catch {
    stamp = 0;
  }
  const hit = cache.get(folder);
  if (hit && hit.stamp === stamp) return hit.eps;
  const eps = new Map(loadShow(folder).map((e) => [e.number, e]));
  cache.set(folder, { stamp, eps });
  return eps;
}
