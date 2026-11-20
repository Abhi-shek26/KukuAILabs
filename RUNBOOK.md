# RUNBOOK: every run, how to do it, and what is still pending

Two toolchains, and only the second one needs installing:

| Part | Needs | Used for |
|---|---|---|
| pipeline + CLI (`promo_finder/`, `tools/`) | Python 3.9+, standard library only — no installs | steps 1, 2, 4-8 |
| web app (`mern/`) | Node 20+, MongoDB, `npm install` (automatic) | step 3 |

All commands run from the repo root. `<SHOW>` means the show folder, e.g. `input_pack/<show name>` (the confidential pack, not in git) or `examples/demo_show` (the demo included in the repo).

---

## 0. Status

| Item | Status |
|---|---|
| Tool (CLI), web app, tests, README | ✅ done, in this repo |
| Web app rebuilt as MERN (`mern/`; the stdlib UI was retired, this is the only front end) | ✅ done - `npm run app` from the repo root |
| Live demo at `https://promo-finder-mern.onrender.com` (Render free + keep-alive workflow) | ✅ running, **read-only** (`PROMO_READ_ONLY=1`): browsing, storyboard, ✓/✗ and CSV export work; uploads and new runs are refused |
| Self-verification a stranger can run (`/verify`, `/api/selftest`) | ✅ 14 pass locally; 11 pass / 0 fail / 2 skip on the public deploy |
| Official free-model run on the full pack (`outputs/full_run`, 155 candidates → 149 ranked, $0) | ✅ done. Its original live log is kept as `raw/llm_calls_live_run.jsonl`; the reports were regenerated from cache with the final code (identical clips and ranking) |
| Paid-model comparison runs (Qwen3.5-Flash, DeepSeek-V4-Pro) and their blind reviews | ✅ done ($0.86 of a $50 test budget) |
| Evaluation: independent picks, blind review of every candidate, judge stability | ✅ done - the numbers are quoted in README §5; the artifacts stay in `eval/` and are **not** part of the submission |
| README numbers | ✅ filled |


Re-running anything below is optional. Every step is reproducible with the commands given.

---

## 1. Setup (once)

```bash
cp .env.example .env          # then put your key in it:  QUBRID_API_KEY=...
python3 -m promo_finder models    # check the key works; lists models, cheapest first
```
To use another provider, set `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` in `.env` (examples in `.env.example`), or pass `--base-url` and `--model`.

---

## 2. The official run (raw outputs for the submission)

```bash
python3 -m promo_finder parse "<SHOW>"                        # format check: episodes, lines, warnings
python3 -u -m promo_finder run "<SHOW>" --out outputs/full_run
```
- Default model: `zai-org/GLM-4.7-Flash` on Qubrid ($0). The free tier allows **one request at a time**, so a 50-episode show takes **about 1.5–2.5 h**. Don't run two free-model jobs at once: they block each other (HTTP 429).
- **It can be resumed.** Every model reply is cached in `.cache/llm/`. If it stops, run the same command again and finished calls come back instantly.
- To **regenerate the reports** later (after a code update) **without losing the original run log**:
  ```bash
  cp outputs/full_run/raw/llm_calls.jsonl  outputs/full_run/raw/llm_calls_live_run.jsonl
  cp outputs/full_run/run_summary.json     outputs/full_run/run_summary_live_run.json
  python3 -m promo_finder run "<SHOW>" --out outputs/full_run      # all answers from cache: seconds, $0
  ```
- Results: `outputs/full_run/promos.md`, `report.html`, `promos.csv`, `promos.json`, `run_summary.json`, `raw/`.
- Quick look in the terminal: `python3 tools/show_results.py outputs/full_run 15`

---

## 3. Web app

The web app is the MERN one in `mern/` (React + Express + MongoDB); it runs this same pipeline and
needs nothing from the CLI beyond the scripts.

```bash
npm run app                   # from the repo root: deps, MongoDB check, API :4000, UI :5173
```
It creates `mern/.env` from `.env.example` on first run (set `MONGODB_URI` there; the provider key is
read from the repo-root `.env`), installs dependencies once, refuses to start if MongoDB is not
answering, and opens the browser only once the API answers too. `npm run app -- --no-open` skips the
browser, `PORT=4001 npm run app` moves the API, Ctrl+C stops both. Already running in another
terminal? It reuses that API; a port taken by something else is named, not crashed into.

- **Promos** tab: pick a run (top-right). The hero is the #1 clip, then the Top 10 rail, then every
  clip as a poster. Click one for the phone-frame storyboard, the timestamps (⧉ copy), the judge's
  three scores and ✓ post / ✗ skip with a note.
- **New run** tab: pick a show folder or **drop a `.zip`** (only `.txt/.md/.fountain` are extracted,
  folders flattened, ≤5 MB per file, ≤100 MB unzipped, ≤60 MB body), choose provider/model/
  judge/fallback/workers/budget, press *Find promos*. Progress is live and cancellable.
- **Files never go to the database.** The upload is unpacked to `uploads/<show>/`, the pipeline writes
  `outputs/<show>-<model>-<time>/` (`promos.json`, `promos.csv`, `report.html`, `raw/`), and only the
  clip index is ingested into MongoDB. One zip → one **new** show name: re-uploading the same name
  merges into the existing folder.
- CLI runs under `outputs/` are ingested on boot, or on demand with `npm run sync`.
- On a database without it, the server seeds `demo_show-rules` (rules-only pass over
  `examples/demo_show`, 3 clips, ~0.5 s, no key, $0) so the app is never blank. `PROMO_SEED_DEMO=0`
  disables it.
- **Self-check without a browser:**
  ```bash
  curl -s localhost:4000/api/selftest | python -m json.tool | head -20      # 14 checks, ~1.5 s
  ```
  or open <http://localhost:4000/verify> and press the button.
- **Reset local data** (files and database are independent):
  ```bash
  rm -rf uploads/<show> outputs/<run>                 # scripts and artifacts
  mongosh promo_finder --eval 'db.dropDatabase()'     # clip index; the demo run re-seeds on next boot
  ```
- Hosting, environment variables and the free-tier caveats: `mern/DEPLOY.md`. Never host it with the
  confidential scripts or outputs inside the image.
- A hosted copy must run with `PROMO_READ_ONLY=1` (what `render.yaml` sets): the public demo serves
  finished runs, storyboards, reviews and CSV export but refuses `/api/upload` and `/api/run`, because
  one shared database has no accounts and a visitor's scripts would otherwise be visible to everyone.
  Locally the flag is off.
- Pointing a laptop at a **remote** database is guarded: local `outputs/` is not ingested into a
  `mongodb+srv` URI unless `PROMO_INGEST_ALL=1` - this is what kept Kuku's clips off the public site.

---

## 4. Demo show (safe to share, no confidential data)

```bash
python3 -m promo_finder run examples/demo_show --no-llm --out outputs/demo_rules     # instant, offline
python3 -m promo_finder run examples/demo_show --out outputs/demo                    # with AI (free model, ~10 min)
```

---

## 5. Offline quality checks (no API calls)

```bash
python3 tools/audit_cuts.py outputs/full_run/promos.json "<SHOW>"                     # 20–60 s, inside the episode, story order, never mid-line
python3 tools/test_parser_variants.py "<SHOW>/<one episode>.txt"                      # 8 reformatted variants must parse identically
python3 tools/test_malformed_replies.py "<SHOW>"                                      # fake model with broken replies: run must survive
python3 -m promo_finder run "<SHOW>" --no-llm --out outputs/_rules_baseline            # keyword-rules baseline (for comparison)
```

---

## 6. Internal evaluation (not submitted)

Nothing in this section ships. `eval/` is git-ignored and quotes the scripts, so it stays on this
machine; it is documented only so the numbers quoted in README §5 can be reproduced on request.
The reviewer instructions are in `tools/review_prompts.md`.

**a) Recall: is the reviewer's best clip among the tool's candidates?**
```bash
python3 tools/check_reviewer_picks.py "<SHOW>" eval/independent_picks_reviewer_a.json      # validates the reviewer picks' timestamps
python3 tools/compare_with_reviewers.py outputs/full_run/promos.json eval/independent_picks_reviewer_a.json \
```

**b) Blind review of every candidate: does the ranking put the good clips on top?**
```bash
# the clips to review (already exported for the free run to eval/clips_all; to redo it from the cache:)
python3 -m promo_finder run "<SHOW>" --no-judge --out /tmp/candidates
python3 tools/export_clips_for_review.py /tmp/candidates/promos.json "<SHOW>" --all --out eval/clips_all
# reviewers (prompt B in tools/review_prompts.md) -> eval/blind_review_all_raw.json, then:
python3 tools/analyze_review_all.py eval/blind_review_all_raw.json eval/clips_all/_key.json \
        outputs/full_run/promos.json eval/blind_review_all_summary.json
```

**c) Judge consistency.** Re-judges the top 15 at a higher temperature. That is 15 free-model calls, about 10 min. Run it only when no other free-model run is active:
```bash
python3 tools/judge_stability.py outputs/full_run/promos.json "<SHOW>" --top 15
```

---

## 7. Model comparison runs (optional, paid: about $0.10–0.65 each)

```bash
python3 -m promo_finder run "<SHOW>" --model Qwen/Qwen3.5-Flash         --workers 8 --max-cost 0.3 \
        --fallback-model zai-org/GLM-4.7-FlashX --out outputs/test_qwen3.5-flash
python3 -m promo_finder run "<SHOW>" --model deepseek-ai/DeepSeek-V4-Pro --workers 8 --max-cost 1.5 \
        --fallback-model zai-org/GLM-4.7-FlashX --out outputs/test_deepseek-v4-pro
# evaluate each one exactly as in step 6 (export with --all, review, analyze; compare_with_reviewers)
```
Optional hook re-cut experiment: add `--recut-hooks` and write to a new `--out`, then run `tools/export_recut_pairs.py <run without>/promos.json <run with>/promos.json "<SHOW>"` and review the pairs blind.

---

## 8. Numbers for the README and the solution doc

```bash
python3 tools/doc_numbers.py outputs/full_run          # every number quoted in the docs, computed from the files
```
Fill the README's ⟦FREE_…⟧ markers (sections 1, 5 and 6) from that output, `eval/agreement_tool.json`, `eval/blind_review_all_summary.json` and `eval/judge_stability.json`.

---



---

## 9. Pushing updates

```bash
git add -A && git status --short          # input_pack/, outputs/, eval/, uploads/, .env, docs/ must NOT appear
git commit -m "…" && git push
```
A push to `main` redeploys Render automatically (~3-4 min). Afterwards check the deployed behaviour:

```bash
curl -s https://promo-finder-mern.onrender.com/api/config   | grep -o '"can_run":[a-z]*'      # must be false
curl -s https://promo-finder-mern.onrender.com/api/selftest | python -c "import json,sys; print(json.load(sys.stdin)['summary'])"
```
Changing an environment variable in `render.yaml` (this repo's Blueprint) needs the Blueprint to be
synced in the Render dashboard; changing one in the dashboard restarts the service on save. Never push
while a long run is in flight - the redeploy kills the job and wipes the container's `uploads/`.
