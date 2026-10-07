import { spawn, spawnSync } from "node:child_process";

const container = "supabase_db_hungrie-app";
const attemptId = "c2000000-0000-4000-8000-000000000001";
const intentId = "c1000000-0000-4000-8000-000000000001";
const run = (sql) => {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: sql, encoding: "utf8" });
  if (result.status !== 0) throw new Error(String(result.stderr || "Virtual POS SQL failed").trim());
  return String(result.stdout || "").trim();
};
const concurrent = (sql) => new Promise((resolve) => {
  const child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (value) => { stdout += value; }); child.stderr.on("data", (value) => { stderr += value; });
  child.on("close", (code) => resolve({ code, stdout, stderr })); child.stdin.end(sql);
});
const cleanup = () => run(`set session_replication_role=replica;
  delete from private.virtual_pos_payment_events where payment_attempt_id='${attemptId}';
  delete from private.virtual_pos_payment_operations where payment_attempt_id='${attemptId}';
  delete from private.virtual_pos_payment_attempts where id='${attemptId}';
  delete from private.virtual_pos_checkout_intents where id='${intentId}';
  set session_replication_role=origin;`);

try {
  cleanup();
  run(`insert into private.virtual_pos_checkout_intents(id,customer_profile_id,restaurant_id,amount_kurus,idempotency_identity,expires_at)
    values('${intentId}','fixture_customer','fixture_restaurant_a',50000,'c1000000-0000-4000-8000-000000000002',statement_timestamp()+interval '15 minutes');
    insert into private.virtual_pos_payment_attempts(id,checkout_intent_id,customer_profile_id,restaurant_id,provider_adapter_id,provider_contract_version,idempotency_identity,requested_amount_kurus,authorized_amount_kurus,state)
    values('${attemptId}','${intentId}','fixture_customer','fixture_restaurant_a','simulated','simulated-v1','c2000000-0000-4000-8000-000000000002',50000,50000,'checkout_pending');`);
  const transition = (state, operation, digest, kind) => concurrent(`begin;
    select private.apply_virtual_pos_transition_v1('${attemptId}','${state}','callback','${operation}',repeat('${digest}',64),'${kind}');
    commit;`);
  const results = await Promise.all([
    transition("authorized", "c3000000-0000-4000-8000-000000000001", "a", "authorized"),
    transition("failed", "c3000000-0000-4000-8000-000000000002", "b", "failed"),
  ]);
  if (results.filter((result) => result.code === 0).length !== 1 || results.filter((result) => result.code !== 0).length !== 1) throw new Error(`Expected one serialized winner: ${JSON.stringify(results)}`);
  const state = run(`select concat_ws('|',state::text,version::text,(select count(*) from private.virtual_pos_payment_events where payment_attempt_id='${attemptId}'),(select count(*) from private.virtual_pos_payment_operations where payment_attempt_id='${attemptId}')) from private.virtual_pos_payment_attempts where id='${attemptId}'`);
  if (!/^(authorized|failed)\|2\|1\|1$/.test(state)) throw new Error(`Invalid concurrent result: ${state}`);
  process.stdout.write("Virtual POS concurrent transitions serialized safely.\n");
} finally { cleanup(); }
