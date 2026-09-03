import { spawn, spawnSync } from "node:child_process";

const container = "supabase_db_hungrie-app";
const orderId = "fixture_m3_concurrent_claim";

const runSql = (sql) => {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: sql, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(String(result.stderr || "Local concurrency SQL failed").trim());
  }
  return String(result.stdout || "").trim();
};

const claimSql = `
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_courier"}',
  true
);
select public.claim_delivery('${orderId}');
commit;
`;

const claim = () =>
  new Promise((resolve) => {
    const child = spawn(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(claimSql);
  });

try {
  runSql(`
    delete from private.audit_log where target_id = '${orderId}';
    delete from private.order_status_history where order_id = '${orderId}';
    delete from private.order_contacts where order_id = '${orderId}';
    delete from public.orders where id = '${orderId}';
    insert into public.orders (
      id, profile_id, restaurant_id, status, payment_method,
      subtotal_kurus, delivery_fee_kurus, total_kurus
    ) values (
      '${orderId}', 'fixture_customer', 'fixture_restaurant_a', 'ready',
      'cash', 2500, 500, 3000
    );
    insert into private.order_contacts (
      order_id, customer_name, delivery_address_snapshot
    ) values ('${orderId}', 'Fixture Customer', '{"line1":"Synthetic"}');
  `);

  const results = await Promise.all([claim(), claim()]);
  const successes = results.filter((result) => result.code === 0);
  const denials = results.filter((result) => result.code !== 0);
  if (successes.length !== 1 || denials.length !== 1) {
    throw new Error("Exactly one of two concurrent courier claims must succeed.");
  }

  const reconciliation = runSql(`
    select concat_ws('|', courier_profile_id, status, (
      select count(*) from private.order_status_history
      where order_id = '${orderId}' and new_status = 'out_for_delivery'
    ))
    from public.orders where id = '${orderId}';
  `);
  if (reconciliation !== "fixture_courier|out_for_delivery|1") {
    throw new Error("Concurrent courier claim did not reconcile to one assignment and history row.");
  }
  process.stdout.write("Milestone 3 courier concurrency test passed.\n");
} finally {
  runSql(`
    delete from private.audit_log where target_id = '${orderId}';
    delete from private.order_status_history where order_id = '${orderId}';
    delete from private.order_contacts where order_id = '${orderId}';
    delete from public.orders where id = '${orderId}';
  `);
}
