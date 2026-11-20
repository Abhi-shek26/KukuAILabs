import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { CLIENT_DIST, HOST, PORT } from "./env.js";
import { connectDb } from "./db.js";
import { meta } from "./routes/meta.js";
import { runs } from "./routes/runs.js";
import { jobs } from "./routes/jobs.js";
import { uploads } from "./routes/uploads.js";
import { verify } from "./routes/verify.js";
import { ingestAll } from "./services/ingest.js";
import { ensureDemoRun } from "./services/demoSeed.js";

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, stack: "MERN", uptime: Math.round(process.uptime()) }));
app.use("/api", meta);
app.use("/api", uploads);
app.use("/api", jobs);
app.use("/api", runs);
app.use("/api", verify); // /api/selftest · /api/verify
app.use(verify); // /verify — the page to send a reviewer

app.use("/api", (_req, res) => res.status(404).json({ error: "not found" }));

// In production the built React app is served from the same origin as the API.
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (_req, res) => res.sendFile(path.join(CLIENT_DIST, "index.html")));
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || "server error" });
});

const boot = async () => {
  try {
    await connectDb();
    const names = await ingestAll();
    console.log(`MongoDB connected · ${names.length} run(s) ingested: ${names.join(", ") || "none"}`);
    // Empty deployment (no outputs/)? Give the reviewer something to look at.
    if (process.env.PROMO_SEED_DEMO !== "0") {
      try {
        const seeded = await ensureDemoRun();
        if (seeded) console.log(`Seeded a rules-only run of examples/demo_show as "${seeded}" (no API key, no cost)`);
      } catch (e) {
        console.error(`Could not seed the demo run: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(`MongoDB not reachable: ${e.message}`);
    console.error("Start it (mongod) or set MONGODB_URI, then restart. The API stays up and will error on data routes.");
  }
  app.listen(PORT, HOST, () => console.log(`Promo Finder MERN API on http://${HOST}:${PORT}`));
};

boot();
