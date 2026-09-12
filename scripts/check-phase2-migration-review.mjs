import crypto from "node:crypto";
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("scripts/phase2-migration-review.json", "utf8"));
if (manifest.target !== "development" || !Array.isArray(manifest.migrations) ||
    manifest.migrations.length !== 3 || !/^[a-f0-9]{64}$/.test(manifest.combinedSha256)) {
  throw new Error("Phase 2 development migration review manifest is invalid.");
}
const expectedNames = [
  "20260912160000_phase2_account_model_expand.sql",
  "20260912161000_phase2_account_helpers.sql",
  "20260912162000_phase2_account_rpcs.sql"
];
const inputs = manifest.migrations.map((entry, index) => {
  if (entry.file !== expectedNames[index] || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    throw new Error("Phase 2 migration list differs from the reviewed sequence.");
  }
  const contents = fs.readFileSync(`supabase/migrations/${entry.file}`);
  const actual = crypto.createHash("sha256").update(contents).digest("hex");
  if (actual !== entry.sha256) throw new Error(`Phase 2 migration checksum differs: ${entry.file}`);
  return contents;
});
const combined = crypto.createHash("sha256").update(Buffer.concat(inputs)).digest("hex");
if (combined !== manifest.combinedSha256) throw new Error("Combined Phase 2 migration checksum differs.");
console.log(JSON.stringify({ target: "development", migrations: expectedNames,
  combinedSha256: combined, action: "validate-only" }));
