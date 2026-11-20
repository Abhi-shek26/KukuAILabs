import express from "express";
import { cancelJob, latestJob, startJob } from "../services/jobRunner.js";
import { ingestAll } from "../services/ingest.js";
import { READ_ONLY } from "../env.js";

export const jobs = express.Router();

jobs.get("/job", async (_req, res, next) => {
  try {
    res.json({ job: await latestJob() });
  } catch (e) {
    next(e);
  }
});

// One shared database means one visitor's run is every visitor's run, so a public demo must not
// accept new runs at all. See READ_ONLY in env.js.
export const READ_ONLY_MESSAGE =
  "this deployment is a read-only demo — clone the repo (or run it locally) to upload a show and find promos";
export function refuseWhenReadOnly(_req, res, next) {
  if (!READ_ONLY) return next();
  res.status(403).json({ error: READ_ONLY_MESSAGE, read_only: true });
}

jobs.post("/run", refuseWhenReadOnly, async (req, res, next) => {
  try {
    res.json({ job: await startJob(req.body || {}) });
  } catch (e) {
    next(e);
  }
});

jobs.post("/job/cancel", async (_req, res, next) => {
  try {
    res.json({ job: await cancelJob() });
  } catch (e) {
    next(e);
  }
});

// Re-scan outputs/ into MongoDB (also runs automatically on boot).
jobs.post("/sync", refuseWhenReadOnly, async (_req, res, next) => {
  try {
    res.json({ runs: await ingestAll() });
  } catch (e) {
    next(e);
  }
});
