import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, SHOW_ROOTS, TEXT_EXT } from "../env.js";

// Same discovery rules as discover_shows() in the Python server: walk each root
// (input_pack, uploads, examples) two levels deep and collect folders with scripts.
export function discoverShows() {
  const shows = [];
  for (const root of SHOW_ROOTS) {
    const abs = path.resolve(REPO_ROOT, root);
    if (!fs.existsSync(abs)) continue;
    walk(abs, root, 0, shows);
  }
  return shows.sort((a, b) => (a.source + a.name).localeCompare(b.source + b.name));
}

function walk(dir, root, depth, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const files = entries.filter((e) => e.isFile() && TEXT_EXT.includes(path.extname(e.name).toLowerCase()) && !e.name.startsWith("."));
  if (files.length) {
    out.push({
      id: path.posix.join(root, path.relative(path.resolve(REPO_ROOT, root), dir).split(path.sep).join("/")),
      name: path.basename(dir),
      files: files.length,
      source: root,
    });
  }
  if (depth >= 2) return;
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("__")) walk(path.join(dir, e.name), root, depth + 1, out);
  }
}

const norm = (id) => String(id).replace(/\\/g, "/").replace(/^\.\//, "");

// Accepts the app's own id and the Python UI's backslash form, so links and
// uploads made in either app keep working.
export function resolveShow(showId) {
  const want = norm(showId);
  const hit = discoverShows().find((s) => norm(s.id) === want || s.name === showId);
  if (!hit) throw new Error("unknown show");
  return path.resolve(REPO_ROOT, hit.id);
}
