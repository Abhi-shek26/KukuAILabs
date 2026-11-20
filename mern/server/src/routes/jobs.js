import express from "express";
import { cancelJob, latestJob, startJob } from "../services/jobRunner.js";
import { ingestAll } from "../services/ingest.js";

export const jobs = express.Router();

jobs.get("/job", async (_req, res, next) => {
  try {
    res.json({ job: await latestJob() });
  } catch (e) {
    next(e);
  }
});

jobs.post("/run", async (req, res, next) => {
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
jobs.post("/sync", async (_req, res, next) => {
  try {
    res.json({ runs: await ingestAll() });
  } catch (e) {
    next(e);
  }
});
