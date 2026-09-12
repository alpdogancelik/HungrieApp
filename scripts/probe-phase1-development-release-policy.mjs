import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
if (arg("--target") !== "development" || arg("--confirm") !== "development:phase1-policy-probe") {
  throw new Error("Use the separately approved development target and confirmation.");
}
const sql = fs.readFileSync(path.join(root, "scripts", "phase1-client-release-policy-probe.sql"), "utf8");
const sha = crypto.createHash("sha256").update(sql).digest("hex");
if (arg("--expect-sha256") !== sha) throw new Error("The reviewed probe SHA-256 does not match.");
const secure = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.development;
if (!project?.ref || project.name !== "HungrieApp Development" ||
    project.ref === state.projects?.staging?.ref || project.ref === state.projects?.production?.ref) {
  throw new Error("The target is not the recorded development project.");
}
const token = fs.readFileSync(path.join(secure, "supabase-cli-hungrie", "access-token"), "utf8").trim();
const query = async (statement) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: statement })
  });
  if (!response.ok) throw new Error(`Development policy query failed (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Development policy response is malformed.");
  return rows;
};
const [before] = await query("select (select count(*) from supabase_migrations.schema_migrations)::integer migrations,(select count(*) from private.client_release_policy)::integer policy_rows,(select count(*) from public.profiles)::integer profiles,(select count(*) from public.orders)::integer orders");
if (Number(before?.migrations) !== 25 || Number(before?.policy_rows) !== 0) throw new Error("Development probe preconditions are not met.");
await query(sql);
const [after] = await query("select (select count(*) from private.client_release_policy)::integer policy_rows,(select count(*) from public.profiles)::integer profiles,(select count(*) from public.orders)::integer orders");
if (Number(after?.policy_rows) !== 0 || Number(after?.profiles) !== Number(before.profiles) || Number(after?.orders) !== Number(before.orders)) {
  throw new Error("Probe cleanup or preserved development counts could not be confirmed.");
}
if (!project.url || !project.publishableKey) throw new Error("Development public API configuration is unavailable.");
const rpc = await fetch(`${project.url}/rest/v1/rpc/get_client_release_policy_v1`, {
  method: "POST",
  headers: { apikey: project.publishableKey, "content-type": "application/json" },
  body: JSON.stringify({ p_application: "customer", p_platform: "ios", p_build_number: 2, p_api_contract: 1 })
});
if (!rpc.ok) throw new Error(`Anonymous development release-policy RPC failed (${rpc.status}).`);
const publicResult = await rpc.json();
if (publicResult?.policy_configured !== false || publicResult?.update_required !== false) {
  throw new Error("Anonymous RPC did not return the safe unconfigured response after probe cleanup.");
}
console.log(JSON.stringify({ target: "development", ref: project.ref, simulatedCustomerCases: 6,
  fixtureWritesRetained: 0, anonymousRpc: "safe-unconfigured-response", sha256: sha,
  preservedCounts: { profiles: after.profiles, orders: after.orders } }));
