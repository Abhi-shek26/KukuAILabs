# Submission checklist (Kuku form)

| Form item | What to submit | Where it is |
|---|---|---|
| Problem chosen | Problem 1: Find the Promos | |
| **Solution doc** (PDF, ≤ 2 pages) | `docs/solution.pdf`: **edit it into your own words first**, fill in your name, roll no. and links, then re-export | `docs/solution.html` → PDF |
| **Prototype link** | GitHub repo with the code and README (run steps). **Public is OK only because** `.gitignore` keeps out `input_pack/`, `outputs/`, `eval/`, `.env`, `.cache/` and the solution doc | this folder |
| **Live prototype (optional, nice to have)** | `https://promo-finder-mern.onrender.com` — the same pipeline behind the MERN app, plus `/verify` (one button, 11 checks) so a reviewer can confirm it really runs. It is a **read-only demo** (`PROMO_READ_ONLY=1`): browsing, storyboards, ✓/✗ reviews and CSV export work; uploading a show and starting a run are refused, because one shared hosted database has no accounts and a visitor's scripts would otherwise be visible to everyone. That guard is the reason the link is safe to share | `render.yaml` |
| **Raw outputs** | Upload `outputs/full_run/` **as-is** (unedited) to a Google Drive folder → "Anyone with the link can view" | `outputs/full_run/` |
| Extra evidence (optional, same Drive folder) | `eval/`: independent reviewer picks, blind review, judge stability, agreement numbers | `eval/` |
| Walkthrough video (optional, recommended) | ≤ 3 min, your own voice: see `docs/walkthrough_talking_points.md` | Loom / unlisted YouTube |

## Before you push to GitHub

1. Check that nothing confidential is staged:
   ```bash
   git init && git add . && git status    # input_pack/, outputs/, .env, .cache/ must NOT be listed
   ```
2. **Rotate your Qubrid key after the assignment.** It was pasted into a chat. It lives only in `.env`, which is git-ignored.
3. Make sure every link opens for "anyone with the link" (the brief requires this).

## Confidentiality (from the brief)

The screenplays are Kuku's content. `outputs/` and `eval/` quote them, so share them only through the private Drive link in the form, never in a public repo.

## Interview prep: they will run it on a NEW show

```bash
python3 -m promo_finder parse "<new show folder>"          # 1. format check (warnings per episode)
python3 -m promo_finder run   "<new show folder>"          # 2. full run (free tier: ~1-2 h; use --episodes 1-10 for a quick demo)
python3 -m promo_finder run   "<new show>" --model <their model> --base-url <their API> --workers 8   # 3. with their API
```
If their scripts use a different layout, `parse` shows it immediately. `tools/test_parser_variants.py` lists the variations already handled.

To run the **web app** on a new show instead of the CLI, on a machine with Node 20+ and MongoDB:

```bash
npm run app                                   # from the repo root: API :4000, UI :5173, opens the browser
# then: New run → drop the .zip (or pick the folder) → Find promos → review → Export
```

Locally the app is read-write: uploads land in `uploads/<show>/`, artifacts in `outputs/<run>/`, and
only the clip index goes into MongoDB (a local one by default). The hosted demo is read-only by design —
do not weaken that to show a live run during the interview; clone it instead.
