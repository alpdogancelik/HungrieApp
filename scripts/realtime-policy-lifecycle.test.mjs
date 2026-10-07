import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("the full local SQL entrypoint installs the managed Realtime policy first", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const command = packageJson.scripts?.["supabase:test"] ?? "";
  const installer = "npm run supabase:realtime:policy:local";
  const sqlSuite = "supabase test db --local supabase/tests";

  assert.notEqual(command.indexOf(installer), -1, "supabase:test must install the local managed-table policy");
  assert.notEqual(command.indexOf(sqlSuite), -1, "supabase:test must run the local SQL suite");
  assert.ok(
    command.indexOf(installer) < command.indexOf(sqlSuite),
    "the managed-table policy must be installed before SQL assertions run",
  );
});

test("the managed Realtime policy remains receive-only and status-aware", async () => {
  const sql = await readFile(
    new URL("supabase/realtime/order_private_broadcast_policy.sql", root),
    "utf8",
  );

  assert.match(sql, /for\s+select\s+to\s+authenticated/i);
  assert.doesNotMatch(sql, /for\s+(?:insert|update|delete|all)\b/i);
  assert.match(sql, /realtime\.messages\.extension\s*=\s*'broadcast'/i);
  assert.match(sql, /private\.can_subscribe_order_topic/i);
  assert.match(sql, /private\.can_subscribe_restaurant_v2_topic/i);
  assert.doesNotMatch(sql, /private\.can_subscribe_restaurant_v1_topic/i);
});
