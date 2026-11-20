import express from "express";
import { runSelftest, selftestInProgress } from "../services/selftest.js";

export const verify = express.Router();

// Machine-readable: a reviewer (or CI) can just curl this and check .ok
verify.get("/selftest", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await runSelftest({ e2e: String(req.query.e2e ?? "1") !== "0" }));
  } catch (e) {
    next(Object.assign(e, { status: 500 }));
  }
});

// Human-readable: the same checks, rendered. This is the link to send a reviewer.
verify.get("/verify", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(page(String(req.query.e2e ?? "1") !== "0"));
});

function page(e2e) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Promo Finder · self-check</title>
<style>
:root{--bg:#050505;--panel:#141519;--line:#2a2c33;--ink:#fff;--muted:#b2b2b2;--faint:#7d818c;--red:#ec1c24;--green:#01a80c;--gold:#ffbb10;--pill:9999px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 Figtree,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:26px 20px 60px}
.top{display:flex;align-items:center;gap:12px;padding-bottom:16px}
.logo{width:30px;height:30px;border-radius:9px;background:var(--red);display:grid;place-items:center;box-shadow:0 4px 18px rgba(236,28,36,.45)}
h1{font-size:20px;margin:0;font-weight:800;letter-spacing:-.01em}
.sub{color:var(--faint);font-size:12px;margin-top:-2px}
.bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0 18px}
button,.btn{border:0;border-radius:var(--pill);padding:9px 16px;background:#2f3238;color:#fff;font:inherit;font-weight:600;font-size:13.5px;cursor:pointer;text-decoration:none}
button.red{background:var(--red);box-shadow:0 6px 22px rgba(236,28,36,.35)}
button:disabled{opacity:.5;cursor:default}
.sum{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 14px;min-width:104px}
.stat b{display:block;font-size:18px;line-height:1.2}
.stat span{color:var(--faint);font-size:11.5px;text-transform:uppercase;letter-spacing:.06em}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.row{display:flex;gap:12px;padding:11px 14px;border-top:1px solid var(--line);align-items:flex-start}
.row:first-child{border-top:0}
.dot{width:18px;flex:0 0 18px;text-align:center;font-weight:800}
.pass .dot{color:var(--green)}.fail .dot{color:var(--red)}.skip .dot{color:var(--gold)}
.t{font-weight:600}
.d{color:var(--muted);font-size:12.5px;word-break:break-word;white-space:pre-wrap}
.ms{margin-left:auto;color:var(--faint);font-size:11.5px;white-space:nowrap;padding-left:8px}
.note{color:var(--faint);font-size:12px;margin-top:14px}
.note a{color:var(--muted)}
pre{background:#0b0b0c;border:1px solid var(--line);border-radius:12px;padding:12px;overflow:auto;font-size:12px;color:#d8d8d8;max-height:340px}
</style></head>
<body><div class="wrap">
  <div class="top">
    <div class="logo"><svg viewBox="0 0 10 12" width="13" height="13"><path d="M0 0l10 6-10 6z" fill="#fff"/></svg></div>
    <div><h1>Promo Finder · self-check</h1><div class="sub">runs the real pipeline once, then walks the result through every API the UI uses</div></div>
  </div>
  <div class="bar">
    <button class="red" id="run">${e2e ? "Run the checks" : "Run the checks (fast, no pipeline)"}</button>
    <a class="btn" href="/api/selftest?e2e=${e2e ? 1 : 0}" target="_blank" rel="noreferrer">JSON</a>
    <a class="btn" href="/" target="_blank" rel="noreferrer">Open the app</a>
  </div>
  <div class="sum" id="sum"></div>
  <div class="card" id="card"><div class="row"><div class="dot">·</div><div><div class="t">Not run yet</div><div class="d">Press “Run the checks”. Takes about 2 s: one rules-only pipeline run on the bundled demo show (no API key, no cost), then review and CSV round-trips.</div></div></div></div>
  <div class="note">Checks that need Kuku's script (<code>input_pack/</code>) or the finished 149-clip run (<code>outputs/full_run/</code>) report “skipped” on a public deployment — those folders are private and never committed. Same data, same API: <a href="/api/runs" target="_blank" rel="noreferrer">/api/runs</a>.</div>
  <pre id="raw" style="display:none"></pre>
</div>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const marks = { pass: "✓", fail: "✗", skip: "–" };

function render(report) {
  const s = report.summary;
  $("sum").innerHTML = [
    ["pass", s.pass, "passed"], ["fail", s.fail, "failed"], ["skip", s.skip, "skipped"],
  ].map(([k, v, label]) => '<div class="stat"><b>' + v + '</b><span>' + label + "</span></div>").join("")
    + '<div class="stat"><b>' + (report.duration_ms / 1000).toFixed(1) + 's</b><span>duration</span></div>';
  $("card").innerHTML = report.checks.map((c) =>
    '<div class="row ' + c.status + '"><div class="dot">' + marks[c.status] + "</div><div><div class=\\"t\\">" +
    esc(c.title) + '</div><div class="d">' + esc(c.detail) + "</div></div>" +
    (c.ms ? '<div class="ms">' + c.ms + "ms</div>" : "") + "</div>"
  ).join("");
  $("raw").style.display = "block";
  $("raw").textContent = JSON.stringify(report, null, 2);
  document.title = (report.ok ? "✓ " : "✗ ") + "Promo Finder · self-check";
}

$("run").addEventListener("click", async () => {
  const btn = $("run");
  btn.disabled = true; btn.textContent = "Running…";
  try {
    const r = await fetch("/api/selftest?e2e=${e2e ? 1 : 0}");
    const report = await r.json();
    if (!r.ok) throw new Error(report.error || ("HTTP " + r.status));
    render(report);
  } catch (e) {
    $("card").innerHTML = '<div class="row fail"><div class="dot">✗</div><div><div class="t">The check itself failed</div><div class="d">' + esc(e.message) + "</div></div></div>";
  } finally {
    btn.disabled = false; btn.textContent = "Run again";
  }
});
</script></body></html>`;
}
