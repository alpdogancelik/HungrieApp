import { spawn, spawnSync } from "node:child_process";

const container = "supabase_db_hungrie-app";
const orderId = "fixture_review_v2_concurrent";
const operations = [
  "14000000-0000-4000-8000-000000000001",
  "14000000-0000-4000-8000-000000000002",
];

const runSql = (sql) => {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: sql, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(String(result.stderr || "Local review-v2 concurrency SQL failed").trim());
  }
  return String(result.stdout || "").trim();
};

const clean = () => runSql(`
  delete from private.customer_review_operations where operation_id in
    ('${operations[0]}','${operations[1]}');
  delete from private.order_review_meal_reactions where order_id='${orderId}';
  delete from private.audit_log where target_id in
    (select id from public.order_reviews where order_id='${orderId}');
  delete from public.order_reviews where order_id='${orderId}';
  delete from public.order_items where order_id='${orderId}';
  delete from public.orders where id='${orderId}';
  delete from private.account_access where profile_id='fixture_customer';
`);

const submit = (operationId) => new Promise((resolve) => {
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
  child.stdin.end(`
    begin;
    set local role authenticated;
    select set_config('request.jwt.claims',jsonb_build_object(
      'role','authenticated','iss','https://securetoken.google.com/hungrieapp-a2288',
      'aud','hungrieapp-a2288','sub','fixture_firebase_customer')::text,true);
    select public.submit_my_customer_order_review_v2(
      '${orderId}',5::smallint,4::smallint,'Concurrent review',
      '[{"menuItemId":"fixture_menu_a","reaction":"liked"}]'::jsonb,
      '${operationId}'::uuid);
    commit;
  `);
});

try {
  clean();
  runSql(`
    insert into private.account_access(profile_id,account_type,status,activated_at)
      values('fixture_customer','customer','active',transaction_timestamp());
    insert into public.orders(id,profile_id,restaurant_id,status,payment_method,
      subtotal_kurus,total_kurus,delivered_at)
      values('${orderId}','fixture_customer','fixture_restaurant_a','delivered','cash',2500,2500,
        transaction_timestamp()-interval '1 hour');
    insert into public.order_items(id,order_id,menu_item_id,source_menu_item_id,
      name_snapshot,unit_price_kurus,quantity)
      values('${orderId}_item','${orderId}','fixture_menu_a','fixture_menu_a',
        'Fixture Meal',2500,1);
  `);

  const results = await Promise.all(operations.map(submit));
  const successes = results.filter(({ code }) => code === 0);
  const denials = results.filter(({ code }) => code !== 0);
  if (successes.length !== 1 || denials.length !== 1) {
    throw new Error(`Expected one success and one duplicate denial; got ${successes.length}/${denials.length}.`);
  }

  const reconciliation = runSql(`
    select concat_ws('|',
      (select count(*) from public.order_reviews where order_id='${orderId}'),
      (select count(*) from private.order_review_meal_reactions where order_id='${orderId}'),
      (select count(*) from private.customer_review_operations where operation_id in
        ('${operations[0]}','${operations[1]}')),
      (select count(*) from private.audit_log where action='order_review.submitted_v2'
        and target_id in (select id from public.order_reviews where order_id='${orderId}')),
      (select count(*) from public.order_reviews where restaurant_id='fixture_restaurant_a'
        and status='published' and order_id='${orderId}'));
  `);
  if (reconciliation !== "1|1|1|1|1") {
    throw new Error(`Concurrent review contribution mismatch: ${reconciliation}`);
  }
  process.stdout.write("Customer review v2 concurrent distinct-operation test passed (1 review, 1 reaction, 1 metric contribution).\n");
} finally {
  clean();
}
