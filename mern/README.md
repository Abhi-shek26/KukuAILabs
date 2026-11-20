# Promo Finder — MERN edition

The same Promo Finder UI and the same pipeline, rebuilt as a real MERN application:
**MongoDB** for runs, clips, editor reviews and jobs · **Express** JSON API ·
**React** (Vite) front end · **Node** spawning the Python pipeline as the one source of truth
for parsing, prompting, judging and ranking.

The look is not a redesign: `client/src/styles.css` is the Python UI's stylesheet copied
verbatim, and every component keeps the same class names, so colours, posters, gradients,
the Top-10 rail and the phone-frame storyboard render identically.

```
mern/
  server/            Express + Mongoose API  (port 4000)
    src/models/      Run · Promo · Review · Job
    src/routes/      meta (config/shows/models/parse) · runs · jobs · uploads
    src/services/    ingest (outputs/ → MongoDB) · clip (storyboard) · csv · jobRunner
    src/lib/         screenplay.js — a port of promo_finder/screenplay.py
  client/            React 18 + Vite  (port 5173, proxies /api)
    src/components/  TopBar · PromosTab · Poster · PromoDialog · NewRun · ProgressCard
    src/styles.css   the Python UI's stylesheet, verbatim
```

## Why the pipeline stays Python

The parser, prompts, blind judge, cut snapping and ranking are the intellectual core of the
submission and are covered by their own audit tools (`tools/audit_cuts.py`,
`tools/test_parser_variants.py`). Re-implementing them in Node would fork the logic and the
numbers. So the MERN app **persists and serves** everything in MongoDB, and starts runs with
`python -m promo_finder run …`, streaming its progress into a `Job` document. The Node
screenplay parser is a faithful port (verified identical to Python on all 50 episodes), used
only to build the storyboard quickly without a round-trip to Python.

## Run it

```bash
# 0. MongoDB must be up (service, docker, or Atlas) and Python 3.9+ on PATH
cd mern
npm run install:all          # server + client deps

# 1. development: API on :4000, React dev server on :5173
npm run dev                  # open http://127.0.0.1:5173

# 2. production-ish: build the client, serve everything from Express
npm run build
npm start                    # http://127.0.0.1:4000
```

`npm run seed` (or `POST /api/sync`) re-scans `outputs/` and loads every run into MongoDB.
That happens automatically on boot, so an existing `outputs/full_run` shows up immediately.

## API

Identical surface to the Python UI, so both apps can be open side by side:

| Method | Route | What it does |
|---|---|---|
| GET | `/api/config` | default model/base URL, whether the server has a key |
| GET | `/api/shows` | show folders on disk (`input_pack/`, `uploads/`, `examples/`) |
| GET | `/api/models?base_url=` | provider models, cheapest first (10 min cache) |
| POST | `/api/parse` | episode count, blocks, minutes, per-episode list |
| GET | `/api/runs` | runs from MongoDB, newest first |
| GET | `/api/runs/:run/promos` | ranked clips + reviews + episode lengths |
| GET | `/api/runs/:run/clip/:id` | storyboard lines and “after the cut” |
| GET | `/api/runs/:run/export.csv` | editor sheet, built from MongoDB |
| GET | `/api/runs/:run/file/:name` | `promos.md`, `report.html`, … |
| POST | `/api/runs/:run/review` | ✓ post / ✗ skip + note (MongoDB) |
| POST | `/api/run` | start a pipeline run → `Job` document |
| GET | `/api/job` · POST `/api/job/cancel` | live progress · cancel |
| POST | `/api/upload?show=&filename=` | zip or .txt upload, untrusted-input rules kept |

## What was verified

| Check | Result |
|---|---|
| Node screenplay parser vs `python -m promo_finder parse` | **identical** on the demo show and on all 50 episodes of the real pack (3,727 blocks, 102.7 min) |
| `/api/runs/full_run/promos` vs the Python API | 149/149 clips, 0 field mismatches, same segments, judge and summary |
| Storyboard for `E24-P1` | identical payload: 35 lines, 8 “after the cut” |
| `export.csv` | **byte-identical**, 72,015 bytes |
| DOM parity, main page | every probed element matches on width/height/font/colour/radius/padding; 61 posters, 10 rail items |
| DOM parity, storyboard dialog | same 35 lines, same tag chips, same meters, same column width |
| End-to-end run from the UI | `POST /api/run` → Python → `Job` progress → MongoDB → served back (rules mode, demo show) |

## Deploy

The brief accepts “a GitHub repo with clear run steps”, which this is. If you also want a live
URL, prefer a container host (Render/Railway/Hugging Face Spaces) + MongoDB Atlas free tier,
because the app shells out to Python:

```bash
# local, everything in containers
docker compose up --build          # app on :4000, MongoDB included
```

`render.yaml` deploys the same Dockerfile on Render (set `MONGODB_URI` to an Atlas string and
`LLM_API_KEY` to your own key, or set `PROMO_UI_REQUIRE_KEY=1` and let visitors paste theirs).

**Never deploy Kuku's pack.** The image copies only `promo_finder/`, `examples/` and `mern/`,
so the public demo runs on the original `examples/demo_show`; `input_pack/`, `outputs/` and
`.env` stay out of both git and the image.

## Notes

- MongoDB documents: `runs`, `promos` (one per clip, unique per run+id), `reviews` (unique per
  run+promo), `jobs`. Re-ingesting a run updates clips but keeps editor reviews.
- `outputs/full_run/editor_review.json` from the Python app is imported once, so reviews made
  there appear here.
- The server binds `127.0.0.1` by default; set `HOST=0.0.0.0` only when hosting, and set
  `PROMO_UI_REQUIRE_KEY=1` if strangers can reach it.
