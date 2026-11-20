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
    src/services/selftest.js   the /api/selftest checks (see "How a reviewer verifies")
    src/routes/verify.js       /verify — the page to send a reviewer
  scripts/parity.mjs           MERN vs Python, endpoint by endpoint
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

If the database is empty and there is no `outputs/` at all — a fresh clone or a container —
the server seeds **one run itself**: `demo_show-rules`, a rules-only pass over the bundled
`examples/demo_show` (3 clips, ~0.5 s, no API key, no cost). That is what makes a public
deployment clickable on first load. Disable it with `PROMO_SEED_DEMO=0`.

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
| GET | `/verify` | **self-check page** — one button, PASS/FAIL table, JSON underneath |
| GET | `/api/selftest?e2e=1` | the same checks as JSON (CI can assert `.ok`) |

## What is public, and what is private

The deployment and this repo are safe to share because neither contains Kuku's material:

- **Public:** the code, `examples/demo_show` (an original 3-episode show written for this repo),
  and one demo run the server seeds itself — `demo_show-rules`, 3 clips, rules-only, no API key,
  $0. That is what `https://<your-app>/` serves.
- **Private:** `input_pack/` (Kuku's 50-episode screenplay), `outputs/full_run` (the 149 ranked
  clips), `eval/` and `.cache/` — all git-ignored and excluded by `.dockerignore`, so they are in
  neither the repo nor the image.

The ranked list quotes the screenplay — storyboard lines are verbatim dialogue and `promos.csv`
quotes hooks and cliffhangers — so publishing it would redistribute Kuku's script. That is why it
is delivered through the private folder named in the submission form (`outputs/full_run/report.html`,
`promos.csv`, `promos.json`, `run_summary.json`) and not through the public URL.
`docs/SUBMISSION_CHECKLIST.md` and `RUNBOOK.md` state the same rule for the Python app.

This costs a reviewer nothing about the mechanics, which is what the deployment is for:

| They can verify publicly | Where the full-dataset evidence lives |
|---|---|
| the pipeline really runs (parse → candidates → cuts → rank), in ~0.4 s | `outputs/full_run/report.html` — all 149 clips, hooks, cut points, judge scores |
| clip → storyboard → ✓/✗ → CSV round-trip, persisted in MongoDB | `promos.csv` — the editor sheet for the real pack |
| cuts land on block boundaries: `tools/audit_cuts.py` → 0 problems | `run_summary.json` — 209 calls, 620k/68k tokens, $0 |
| their own show through **New run → upload** (any timestamped scripts) | `npm run parity` locally: 6/6 identical to the Python app, 149 storyboards, byte-identical CSV |

In short: **mechanics public, results private** — the split the brief asks for.

## How a reviewer verifies a deployment

Three layers, cheapest first. All of it works on the public deployment, with no API key and
no access to Kuku's script.

**1. One click — `https://<your-app>/verify`**

The page runs `/api/selftest`: 14 assertions in about 1.5 s, each with a reason string. It is
not a mock — it executes the real pipeline once on the bundled demo show (rules-only, zero
provider calls) and then drives the result through the same HTTP routes the UI uses:

| # | Check | What it proves |
|---|---|---|
| 1-2 | MongoDB connected · documents present | data layer is live, not stubbed |
| 3-5 | `/api/health`, `/api/config`, `/api/shows` | the API and its config endpoints answer |
| 6 | parser totals for the demo show (3 eps · 76 blocks · 2.0 min · 0 warnings) | the Node screenplay parser is right, not just plausible |
| 7 | parser totals for the 50-episode pack | *skipped* publicly (input_pack/ is private); passes locally |
| 8 | `python -m promo_finder run` → a ranked shortlist | the Python pipeline really runs inside the deployed app |
| 9 | `tools/audit_cuts.py` → 0 problems | cuts are on block boundaries, 20-60 s, in story order |
| 10 | the run is ingested and served by `/api/runs/:run/promos` | `outputs/` → MongoDB → API |
| 11 | a clip's storyboard ends where the clip ends | storyboard is derived from the script, not fabricated |
| 12 | ✓ Post → appears in the CSV → cleared → CSV identical | review persistence round-trip |
| 13-14 | `full_run`: 149 clips, ranks 1..149, 6 near-dups · CSV 149 rows / 17 columns | the submitted artifact is intact |

Checks 7, 13 and 14 report **skipped** when `input_pack/` or `outputs/full_run/` are absent —
which is exactly what a public deployment should look like. `ok` is false only on a real
failure.

**2. In CI or a terminal — same thing, machine-readable**

```bash
curl -s https://<your-app>/api/selftest | jq '.ok, .summary'
# true
# { "pass": 11, "fail": 0, "skip": 2, "total": 13 }
```

**3. By hand, in the UI (2 minutes)**

1. Open `/` — the run picker lists the runs of this deployment: `demo_show-rules` (3 clips,
   seeded at boot) on a public deploy, `full_run` (149 clips) on the owner's machine. Pick a
   clip to see the phone-frame storyboard with the first 3 s highlighted.
2. Filter by kind/verdict/judge-pick, sort by score — counts move.
3. Press ✓ on a clip → reload the page → it is still ✓ (it is in MongoDB, not localStorage).
4. **Export** → the CSV has a new `editor_verdict=post` column value; press ✗ → it changes.
5. **New run** → pick `demo_show` → tick *rules only* → Start: progress walks
   parse → mine → trailers → rank and the new run appears in the picker. Untick it and paste
   your own provider key to run the LLM path (that is the only part that costs money).
6. `/api/runs/<run>/file/report.html` — the same HTML report the CLI writes.

**Owner-only: byte-for-byte parity with the original app**

```bash
python -m promo_finder serve --port 8765     # terminal 1
cd mern && npm run dev:server                # terminal 2
cd mern && npm run parity                    # terminal 3
```

`npm run parity` compares both apps on every show: parse payloads, all 149 clips field by
field, all 149 storyboards, and the exported CSV bytes. It exits non-zero on any difference.

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
| `npm run parity` (MERN vs Python) | **6/6**: shows, both parse payloads, 149 clips, 149 storyboards, CSV bytes |
| `/api/selftest` locally | **14 pass · 0 fail · 0 skip** in 1.4 s |
| `/api/selftest` as a public deploy would see it (fresh DB, `examples/` only, key required) | **11 pass · 0 fail · 2 skip** in 0.9 s, and boots with the `demo_show-rules` run ready to browse |
| **The live deployment** (`https://promo-finder-mern.onrender.com`, Render free, Blueprint from `render.yaml`) | `/api/selftest` **11 pass · 0 fail · 2 skip**, `/api/runs` shows the seeded `demo_show-rules` run (3 clips), storyboard 27 lines, CSV 17 columns |
| The Docker image, built and run locally (`docker build -f mern/Dockerfile .`) | same **11 pass · 0 fail · 2 skip** inside the container, storyboard served from MongoDB after a restart, and `/app` free of Kuku's material |

## Deploy

**Step-by-step guide: [DEPLOY.md](DEPLOY.md)** — MongoDB Atlas M0 + Render blueprint, env var
table, verification checklist, free-tier caveats, rollback and troubleshooting.

```bash
# locally, everything in containers (app on :4000, MongoDB included)
docker compose -f mern/docker-compose.yml up --build

# or just the app, against a database you already have
docker build -f mern/Dockerfile -t promo-finder .
docker run -p 4000:4000 -e MONGODB_URI="mongodb://host.docker.internal:27017/promo_finder" promo-finder
```

The image is built from the repo root (`promo_finder/`, `tools/`, `examples/`, `mern/`) because
the API shells out to the Python pipeline. `./render.yaml` is the Render blueprint; it builds
the same Dockerfile with `PROMO_UI_REQUIRE_KEY=1` so visitors bring their own provider key.

**Never deploy Kuku's pack.** `.dockerignore` keeps `input_pack/`, `outputs/`, `uploads/`,
`docs/solution*` and `.env` out of the build context, so a public deployment can't contain
them. Verify any time with:

```bash
docker run --rm promo-finder ls /app     # examples  mern  outputs  promo_finder  tools
```

## Notes

- MongoDB documents: `runs`, `promos` (one per clip, unique per run+id), `reviews` (unique per
  run+promo), `jobs`. Re-ingesting a run updates clips but keeps editor reviews.
- `outputs/full_run/editor_review.json` from the Python app is imported once, so reviews made
  there appear here.
- The server binds `127.0.0.1` by default; set `HOST=0.0.0.0` only when hosting, and set
  `PROMO_UI_REQUIRE_KEY=1` if strangers can reach it.
