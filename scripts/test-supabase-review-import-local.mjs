import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildReviewImportSql, transformReviews } = require("../functions/scripts/reviewMigration.js");
const documents = { reviews: [{ id: "local_unresolved_review", data: { reviewKey: "local_key", orderId: "firebase_order_not_imported", restaurantId: "fixture_restaurant_a", menuItemId: "fixture_menu_a", userId: "fixture_firebase_customer", userName: "Fixture Customer", menuItemName: "Fixture Meal", rating: 4, status: "published", createdAt: "2026-09-04T00:00:00.000Z" } }], orderReviews: [], relationshipEvidence: { orders: [{ id: "firebase_order_not_imported", exists: true }] } };
const result = transformReviews({ documents });
if (result.rejections.length) throw new Error("Synthetic review should reach relationship quarantine.");
const generated = buildReviewImportSql(result, "hungrieapp-a2288");
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-m7-local-"));
const sqlPath = path.join(temporaryDirectory, "reviews.sql");
const run = (...args) => spawnSync("supabase", args, { cwd: ROOT_DIR, encoding: "utf8" });
try {
  fs.writeFileSync(sqlPath, generated.sql, { mode: 0o600 });
  for (let pass = 1; pass <= 2; pass += 1) {
    const imported = run("db", "query", "--local", "--file", sqlPath);
    if (imported.status !== 0) throw new Error(`Local review import pass ${pass} failed: ${imported.stderr}`);
  }
  const verified = run("db", "query", "--local", `select json_build_object(
    'status',(select status from migration.import_runs where id='${generated.runId}'::uuid),
    'staged',(select count(*) from migration.product_reviews_stage where run_id='${generated.runId}'::uuid),
    'quarantined',(select count(distinct document_id) from migration.review_quarantine where run_id='${generated.runId}'::uuid),
    'promoted',(select count(*) from public.product_reviews where id='local_unresolved_review'),
    'reason_checksum',(select encode(digest(coalesce(string_agg(reason_code,',' order by reason_code),''),'sha256'),'hex') from migration.review_quarantine where run_id='${generated.runId}'::uuid)
  ) as result`, "--output-format", "json");
  if (verified.status !== 0) throw new Error("Local review verification query failed.");
  const output = JSON.parse(verified.stdout.slice(verified.stdout.indexOf("{"))).rows[0].result;
  if (output.status !== "completed" || output.staged !== 1 || output.quarantined !== 1 || output.promoted !== 0) throw new Error("Local review quarantine counts did not reconcile.");
  console.log(JSON.stringify({ passed: true, sourceChecksum: result.sourceChecksum, stagedChecksum: result.stagedChecksum, result: output }, null, 2));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  const reset = run("db", "reset", "--local");
  if (reset.status !== 0) throw new Error("Local database cleanup reset failed.");
}
