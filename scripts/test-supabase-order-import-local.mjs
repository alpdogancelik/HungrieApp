import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildOrderImportSql, transformOrders } = require("../functions/scripts/orderMigration.js");
const documents = { orders: [{ id: "local_import_order", data: {
  userId: "fixture_firebase_customer", restaurantId: "fixture_restaurant_a", status: "delivered", paymentMethod: "pos",
  customerName: "Fixture Customer", customerEmail: "customer@example.invalid",
  deliveryAddress: { label: "Fixture", line1: "Synthetic", city: "Fixture City", country: "Fixture Country" },
  items: [{ menuItemId: "fixture_menu_a", name: "Fixture Meal", price: 25, quantity: 1, customizations: [] }],
  subtotal: 25, deliveryFee: 5, serviceFee: 0, discount: 0, tip: 0, total: 30,
  etaMinutes: 30, createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T11:00:00.000Z", deliveredAt: "2026-09-01T10:45:00.000Z",
} }], relationshipEvidence: {} };
const result = transformOrders({ documents });
if (result.rejections.length) throw new Error("Synthetic local order contains unexpected rejection.");
const generated = buildOrderImportSql(result, "hungrieapp-a2288");
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-m8-local-"));
const sqlPath = path.join(temporaryDirectory, "orders.sql");
const run = (...args) => spawnSync("supabase", args, { cwd: ROOT_DIR, encoding: "utf8" });
try {
  fs.writeFileSync(sqlPath, generated.sql, { mode: 0o600 });
  for (let pass = 1; pass <= 2; pass += 1) {
    const imported = run("db", "query", "--local", "--file", sqlPath);
    if (imported.status !== 0) throw new Error(`Local order import pass ${pass} failed: ${imported.stderr}`);
  }
  const verified = run("db", "query", "--local", `select json_build_object(
    'status',(select status from migration.import_runs where id='${generated.runId}'::uuid),
    'orders',(select count(*) from public.orders where id='local_import_order'),
    'contacts',(select count(*) from private.order_contacts where order_id='local_import_order'),
    'items',(select count(*) from public.order_items where order_id='local_import_order'),
    'history',(select count(*) from private.order_status_history where order_id='local_import_order' and source='firebase_import'),
    'audits',(select count(*) from private.audit_log where target_id='local_import_order' and action='order.imported'),
    'quarantine',(select count(distinct document_id) from migration.order_quarantine where run_id='${generated.runId}'::uuid),
    'financial_checksum',(select encode(digest(string_agg(id||':'||total_kurus,',' order by id),'sha256'),'hex') from public.orders where id='local_import_order')
  ) as result`, "--output-format", "json");
  if (verified.status !== 0) throw new Error("Local order verification query failed.");
  const output = JSON.parse(verified.stdout.slice(verified.stdout.indexOf("{"))).rows[0].result;
  if (output.status !== "completed" || output.orders !== 1 || output.contacts !== 1 || output.items !== 1 || output.history !== 1 || output.audits !== 1 || output.quarantine !== 0) throw new Error("Local order repeat-import reconciliation failed.");
  console.log(JSON.stringify({ passed: true, sourceChecksum: result.sourceChecksum, stagedChecksum: result.stagedChecksum, result: output }, null, 2));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  const reset = run("db", "reset", "--local");
  if (reset.status !== 0) throw new Error("Local database cleanup reset failed.");
}
