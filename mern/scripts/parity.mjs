#!/usr/bin/env node
// Side-by-side cross-validation: the MERN API against the Python API.
//
//   # terminal 1 — the original app
//   python -m promo_finder serve --port 8765
//   # terminal 2 — the MERN app
//   cd mern && npm run dev:server
//   # terminal 3
//   cd mern && npm run parity
//
// Compares every endpoint the UI uses and exits non-zero on any difference. This is the
// check that proves the rewrite is faithful rather than merely similar.
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1].replace(/\/+$/, "") : def;
};
const PY = opt("python", "http://127.0.0.1:8765");
const MERN = opt("mern", "http://127.0.0.1:4000");
const RUN = opt("run", "full_run");

const get = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!r.ok) throw new Error(`${url} answered HTTP ${r.status}`);
  return r;
};
const json = async (url) => (await get(url)).json();
const text = async (url) => (await get(url)).text();
const post = async (url, body) =>
  (await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) })).json();

const results = [];
const check = async (title, fn) => {
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ title, ok: true, detail, ms: Date.now() - t });
  } catch (e) {
    results.push({ title, ok: false, detail: e.message, ms: Date.now() - t });
  }
};
// Deep, order-insensitive comparison (MongoDB returns fields in its own order,
// the Python API in the order promos.json was written).
const diff = (a, b, path = "") => {
  const kind = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
  const ta = kind(a);
  const tb = kind(b);
  if (ta !== tb) return `${path}: python is ${ta}, mern is ${tb}`;
  if (ta === "array") {
    if (a.length !== b.length) return `${path}: python has ${a.length} entries, mern has ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = diff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (ta === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join("|") !== kb.join("|")) return `${path}: fields python=[${ka.join(",")}] mern=[${kb.join(",")}]`;
    for (const k of ka) {
      const d = diff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
    return null;
  }
  return a === b ? null : `${path}: python=${JSON.stringify(a)} mern=${JSON.stringify(b)}`;
};
const same = (a, b, what) => {
  const d = diff(a, b, what);
  if (d) throw new Error(d.replace(/^\./, what));
};

(async () => {
  const pyShows = (await json(`${PY}/api/shows`)).shows;
  const mnShows = (await json(`${MERN}/api/shows`)).shows;
  await check(`/api/shows — same shows (${pyShows.length})`, async () => {
    same(pyShows.map((s) => s.name).sort(), mnShows.map((s) => s.name).sort(), "show names");
    return pyShows.map((s) => s.name).join(", ");
  });

  for (const s of pyShows) {
    const twin = mnShows.find((x) => x.name === s.name);
    await check(`/api/parse ${s.name}`, async () => {
      const a = await post(`${PY}/api/parse`, { show: s.id });
      const b = await post(`${MERN}/api/parse`, { show: twin.id });
      same(a, b, "parse payloads");
      return `${a.episodes} eps · ${a.blocks} blocks · ${a.minutes} min · ${a.warnings} warnings`;
    });
  }

  await check(`/api/runs/${RUN}/promos`, async () => {
    const a = await json(`${PY}/api/runs/${RUN}/promos`);
    const b = await json(`${MERN}/api/runs/${RUN}/promos`);
    if (a.promos.length !== b.promos.length) throw new Error(`python has ${a.promos.length} clips, mern has ${b.promos.length}`);
    for (let i = 0; i < a.promos.length; i++) {
      const d = diff(a.promos[i], b.promos[i], `clip[${i}] ${a.promos[i].id}`);
      if (d) throw new Error(d);
    }
    same(a.near_duplicates, b.near_duplicates, "near_duplicates");
    same(a.reviews, b.reviews, "reviews");
    same(a.episode_seconds, b.episode_seconds, "episode_seconds");
    same(a.summary, b.summary, "summary");
    return `${a.promos.length} clips · ${a.near_duplicates.length} near-duplicates · 0 field differences`;
  });

  const promos = (await json(`${MERN}/api/runs/${RUN}/promos`)).promos;
  await check(`/api/runs/${RUN}/clip/:id — all ${promos.length} storyboards`, async () => {
    let n = 0;
    for (const p of promos) {
      const a = await json(`${PY}/api/runs/${RUN}/clip/${encodeURIComponent(p.id)}`);
      const b = await json(`${MERN}/api/runs/${RUN}/clip/${encodeURIComponent(p.id)}`);
      const d = diff(a, b, p.id);
      if (d) throw new Error(d);
      n++;
    }
    return `${n} storyboards identical`;
  });

  await check(`/api/runs/${RUN}/export.csv`, async () => {
    const a = await text(`${PY}/api/runs/${RUN}/export.csv`);
    const b = await text(`${MERN}/api/runs/${RUN}/export.csv`);
    if (a !== b) throw new Error(`CSV differs (${a.length} vs ${b.length} bytes)`);
    return `byte-identical, ${a.length} bytes`;
  });

  console.log(`\nMERN ${MERN}  vs  Python ${PY}\n`);
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.title.padEnd(52)} ${String(r.detail).slice(0, 90)}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(`\nCould not run the comparison: ${e.message}`);
  console.error(`Are both apps running?  python -m promo_finder serve --port 8765  ·  cd mern && npm run dev:server\n`);
  process.exit(2);
});
