import mongoose from "mongoose";

const { Schema } = mongoose;

// One row per run folder under outputs/ (the same folders the Python CLI writes).
const RunSchema = new Schema(
  {
    name: { type: String, required: true, unique: true }, // folder name, used in URLs
    show: String,
    mode: String, // "llm" | "rules-only"
    model: String,
    judgeModel: String,
    episodes: Number,
    runtimeMinutes: Number,
    promos: Number,
    cost: Number,
    seconds: Number,
    modified: Number, // mtime of the newest run file, for sorting the run picker
    ready: Boolean, // promos.json present
    active: { type: Boolean, default: false },
    progressHint: { mined: Number, judged: Number },
    inputDir: String,
    scriptsAvailable: { type: Boolean, default: false },
    summary: { type: Schema.Types.Mixed }, // run_summary.json verbatim
    generated: String, // promos.json "generated"
  },
  { timestamps: true }
);

export const Run = mongoose.model("Run", RunSchema);

// A candidate clip. Stored per run so the API never has to read promos.json at request time.
const SegmentSchema = new Schema(
  {
    episode: Number,
    start: String,
    end: String,
    start_seconds: Number,
    end_seconds: Number,
    duration_seconds: Number,
    start_block: String,
    end_block: String,
  },
  { _id: false }
);

const PromoSchema = new Schema({
  runName: { type: String, required: true, index: true },
  id: { type: String, required: true },
  rank: Number,
  kind: String,
  title: String,
  episodes: [Number],
  duration_seconds: Number,
  segments: [SegmentSchema],
  hook: String,
  cliffhanger: String,
  why_it_works: String,
  script_first_3s: String,
  script_last_line: String,
  context_gap: String,
  rank_reason: String,
  code_notes: [String],
  flags: [String],
  judge: { type: Schema.Types.Mixed },
  signals: { type: Schema.Types.Mixed },
  score: Number,
  near_duplicate: { type: Boolean, default: false }, // set aside after ranking, kept for the audit
});

PromoSchema.index({ runName: 1, id: 1 }, { unique: true });
PromoSchema.index({ runName: 1, rank: 1 });

export const Promo = mongoose.model("Promo", PromoSchema);

// The editor's ✓/✗. This is the part that used to live in editor_review.json.
const ReviewSchema = new Schema(
  {
    runName: { type: String, required: true },
    promoId: { type: String, required: true },
    verdict: { type: String, enum: ["post", "skip", ""], default: "" },
    note: { type: String, default: "" },
    time: String,
  },
  { timestamps: true }
);

ReviewSchema.index({ runName: 1, promoId: 1 }, { unique: true });

export const Review = mongoose.model("Review", ReviewSchema);

// A pipeline run started from the UI (spawns the Python CLI).
const JobSchema = new Schema({
  outDir: String,
  runName: String,
  state: { type: String, enum: ["running", "done", "error", "cancelled"], default: "running" },
  phase: { type: String, default: "parse" },
  progress: { type: Schema.Types.Mixed, default: {} },
  logs: [String],
  params: { type: Schema.Types.Mixed },
  stats: { type: Schema.Types.Mixed },
  error: String,
  startedAt: Number,
  finishedAt: Number,
  pid: Number,
});

export const Job = mongoose.model("Job", JobSchema);
