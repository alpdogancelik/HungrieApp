import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildIdentityImportSql, transformIdentity } = require("../functions/scripts/identityMigration.js");
const source = {
  users: [{ id: "m6_customer", data: { accountId: "m6_customer", name: "Synthetic Customer", email: "customer-m6@example.invalid", favoriteRestaurantIds: ["fixture_restaurant_a"] } }],
  authUsers: [{ uid: "m6_customer", email: "customer-m6@example.invalid" }, { uid: "m6_owner", email: "owner-m6@example.invalid", displayName: "Synthetic Owner" }],
  addresses: [{ id: "m6_home", profileId: "m6_customer", data: { id: "m6_home", label: "Home", line1: "Synthetic line", city: "Fixture City", country: "Fixture Country", isDefault: true } }],
  restaurantStaff: [{ id: "m6_owner", data: { restaurantId: "fixture_restaurant_b", role: "owner" } }],
  restaurants: [{ id: "fixture_restaurant_a", data: {} }, { id: "fixture_restaurant_b", data: { ownerId: "legacy-owner" } }],
};
const result = transformIdentity(source);
if (result.rejections.length) throw new Error("Synthetic identity source contains unexpected rejections.");
const generated = buildIdentityImportSql(result, "hungrieapp-a2288");
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-m6-local-"));
const sqlPath = path.join(temporaryDirectory, "identity.sql");
const execute = (...args) => spawnSync("supabase", ["db", "query", "--local", ...args], { cwd: ROOT_DIR, encoding: "utf8" });
try {
  fs.writeFileSync(sqlPath, generated.sql, { mode: 0o600 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const imported = execute("--file", sqlPath);
    if (imported.status !== 0) throw new Error(`Local identity promotion failed: ${imported.stderr || imported.stdout}`);
  }
  const verified = execute(`select json_build_object(
    'profiles',(select count(*) from public.profiles where id like 'm6_%'),
    'addresses',(select count(*) from public.addresses where profile_id like 'm6_%'),
    'favorites',(select count(*) from public.favorites where profile_id like 'm6_%'),
    'memberships',(select count(*) from private.restaurant_members where profile_id like 'm6_%'),
    'completed_runs',(select count(*) from migration.import_runs where id='${generated.runId}' and status='completed')
  ) as result`, "--output-format", "json");
  if (verified.status !== 0) throw new Error("Local identity verification query failed.");
  const counts = JSON.parse(verified.stdout.slice(verified.stdout.indexOf("{"))).rows[0].result;
  const expected = { profiles: 2, addresses: 1, favorites: 1, memberships: 1, completed_runs: 1 };
  if (Object.entries(expected).some(([key, value]) => counts[key] !== value)) throw new Error("Local identity counts did not reconcile.");
  console.log(JSON.stringify({ passed: true, counts, sourceChecksum: result.sourceChecksum, stagedChecksum: result.stagedChecksum }, null, 2));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  const reset = spawnSync("supabase", ["db", "reset", "--local"], { cwd: ROOT_DIR, encoding: "utf8" });
  if (reset.status !== 0) throw new Error("Local database cleanup reset failed.");
}
