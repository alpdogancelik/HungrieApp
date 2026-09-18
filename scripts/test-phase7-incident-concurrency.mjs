import { spawn, spawnSync } from "node:child_process";

const container = "supabase_db_hungrie-app", restaurant = "fixture_restaurant_b", prefix = "phase7_incident_concurrent_";
const runSql = sql => { const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: sql, encoding: "utf8" }); if (result.status !== 0) throw new Error(String(result.stderr || "Phase 7 incident SQL failed").trim()); return String(result.stdout || "").trim(); };
const detect = () => new Promise(resolve => { const child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { stdio: ["pipe", "pipe", "pipe"] }); let stdout = "", stderr = ""; child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; }); child.on("close", code => resolve({ code, stdout: stdout.trim(), stderr })); child.stdin.end("select private.detect_repeated_order_non_response_v1('2026-09-18 12:00:00+00');\n"); });
const clean = () => runSql(`delete from private.audit_log where action='restaurant.non_response_incident_opened' and metadata->>'restaurant_id'='${restaurant}';delete from private.restaurant_operational_incidents where restaurant_id='${restaurant}';delete from private.order_status_history where order_id like '${prefix}%';delete from public.orders where id like '${prefix}%';`);

try {
  clean();
  runSql(`insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,approval_deadline_at,canceled_at)select '${prefix}'||g,'fixture_customer','${restaurant}','canceled','cash',100,100,'2026-09-18 12:00:00+00'::timestamptz-(g||' minutes')::interval,'2026-09-18 12:00:00+00' from generate_series(1,3)g;insert into private.order_status_history(order_id,previous_status,new_status,source,reason,created_at)select '${prefix}'||g,'pending','canceled','system','approval_deadline_expired','2026-09-18 12:00:00+00' from generate_series(1,3)g;`);
  const results = await Promise.all([detect(), detect()]);
  if (results.some(value => value.code !== 0) || results.map(value => value.stdout).sort().join("|") !== "0|1") throw new Error("Concurrent detector calls did not serialize to one creation.");
  if (runSql(`select count(*) from private.restaurant_operational_incidents where restaurant_id='${restaurant}' and state<>'resolved'`) !== "1") throw new Error("Concurrent detector created duplicate unresolved incidents.");
  process.stdout.write("Phase 7 incident detector concurrency test passed.\n");
} finally { clean(); }
