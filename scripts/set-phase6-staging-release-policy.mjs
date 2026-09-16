#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv.find((value) => value.startsWith("--mode="))?.slice(7);
if (!new Set(["normal", "block-current"]).has(mode) ||
    !process.argv.includes(`--confirm=staging:phase6-release-policy:${mode}`)) {
  throw new Error("A valid mode and exact Staging Phase 6 confirmation are required.");
}
const secure = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.staging;
if (!project?.ref || project.ref === state.projects?.development?.ref || project.ref === state.projects?.production?.ref) {
  throw new Error("Safe Staging project configuration is required.");
}
const token = fs.readFileSync(path.join(secure, "supabase-cli-hungrie/access-token"), "utf8").trim();
const minimums = mode === "normal" ? { ios: 28, android: 30 } : { ios: 29, android: 31 };
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const metadata = quote(JSON.stringify({ environment: "staging", mode, apiContract: 2, ...minimums }));
const query = `begin;
insert into private.client_release_policy(application,platform,minimum_build_number,minimum_api_contract,update_required,store_url,user_message_key,changed_by_profile_id,changed_at)
values ('customer','ios',${minimums.ios},2,true,'https://apps.apple.com/app/id6759683384','customer_update_required',null,statement_timestamp()),
       ('customer','android',${minimums.android},2,true,'https://play.google.com/store/apps/details?id=com.hungrie.app','customer_update_required',null,statement_timestamp())
on conflict(application,platform) do update set minimum_build_number=excluded.minimum_build_number,
  minimum_api_contract=excluded.minimum_api_contract,update_required=excluded.update_required,store_url=excluded.store_url,
  user_message_key=excluded.user_message_key,changed_by_profile_id=null,changed_at=statement_timestamp();
insert into private.audit_log(actor_profile_id,action,target_type,target_id,metadata)
values(null,${quote(`phase6_staging_release_policy_${mode}`)},'client_release_policy','customer',${metadata}::jsonb);
commit;`;
const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ query }),
});
if (!response.ok) throw new Error(`Staging release-policy update failed (${response.status}).`);
const checks = await Promise.all(Object.entries(minimums).map(async ([platform, minimum]) => {
  const result = await fetch(`${project.url}/rest/v1/rpc/get_client_release_policy_v1`, {
    method: "POST", headers: { apikey: project.publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ p_application: "customer", p_platform: platform, p_build_number: platform === "ios" ? 28 : 30, p_api_contract: 2 }),
  });
  const body = await result.json().catch(() => null);
  return result.ok && body?.policy_configured && body?.minimum_build_number === minimum && body?.update_required === (mode === "block-current");
}));
if (checks.some((passed) => !passed)) throw new Error("Staging release-policy verification failed.");
console.log(JSON.stringify({ environment: "staging", mode, minimums, apiContract: 2, verified: true, auditRecorded: true }));
