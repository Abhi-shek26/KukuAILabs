// Re-scan outputs/ into MongoDB without starting the server (npm run sync).
import { connectDb, closeDb } from "./db.js";
import { ingestAll } from "./services/ingest.js";

const names = await (async () => {
  await connectDb();
  return ingestAll();
})();
console.log(`ingested ${names.length} run(s): ${names.join(", ") || "none"}`);
await closeDb();
