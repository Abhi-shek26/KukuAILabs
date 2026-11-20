import express from "express";
import AdmZip from "adm-zip";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, TEXT_EXT } from "../env.js";
import { slug } from "../lib/fmt.js";

export const uploads = express.Router();

const MAX_UNZIPPED = 100 * 1024 * 1024;
const MAX_FILE = 5 * 1024 * 1024;
const MAX_FILES = 2000;

const safeName = (base) =>
  String(base).replace(/[^A-Za-z0-9 ._()\-]+/g, "_").replace(/^[ .]+|[ .]+$/g, "").slice(0, 120) || "episode.txt";

// Uploaded zips are untrusted: only text files are kept, paths are flattened,
// and sizes/counts are capped — the same rules as save_upload() in server.py.
uploads.post("/upload", express.raw({ type: "*/*", limit: "60mb" }), (req, res, next) => {
  try {
    const showName = String(req.query.show || "uploaded show").trim();
    const filename = String(req.query.filename || "").trim();
    const dest = path.join(REPO_ROOT, "uploads", slug(showName));
    fs.mkdirSync(dest, { recursive: true });
    let written = 0;

    const write = (base, content) => {
      let target = path.join(dest, safeName(base));
      const ext = path.extname(target);
      const stem = target.slice(0, target.length - ext.length);
      let n = 1;
      while (fs.existsSync(target)) {
        n += 1;
        target = `${stem} (${n})${ext}`;
      }
      fs.writeFileSync(target, content);
      written += 1;
    };

    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) throw Object.assign(new Error("empty upload"), { status: 400 });
    const lower = filename.toLowerCase();

    if (lower.endsWith(".zip")) {
      const zip = new AdmZip(buf);
      let total = 0;
      for (const entry of zip.getEntries()) {
        const raw = entry.entryName.replace(/\\/g, "/");
        const base = raw.split("/").pop();
        if (entry.isDirectory || !base || base.startsWith(".") || raw.includes("__MACOSX")) continue;
        if (!TEXT_EXT.includes(path.extname(base).toLowerCase()) || entry.header.size > MAX_FILE) continue;
        total += entry.header.size;
        if (total > MAX_UNZIPPED || written >= MAX_FILES) throw Object.assign(new Error("zip too large (max 100 MB of text, 2000 files)"), { status: 400 });
        write(base, entry.getData());
      }
    } else if (TEXT_EXT.includes(path.extname(lower))) {
      write(path.basename(filename.replace(/\\/g, "/")), buf);
    } else {
      throw Object.assign(new Error("upload a .zip of episode scripts or .txt files"), { status: 400 });
    }

    res.json({ show: path.posix.join("uploads", path.relative(path.join(REPO_ROOT, "uploads"), dest).split(path.sep).join("/")), written });
  } catch (e) {
    next(Object.assign(e, { status: e.status || 400 }));
  }
});
