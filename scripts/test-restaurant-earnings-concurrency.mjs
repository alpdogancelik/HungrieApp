import { spawn, spawnSync } from "node:child_process";

const container = "supabase_db_hungrie-app";
const stableOperation = "eb000000-0000-4000-8000-000000000001";
const raceOperation = "eb000000-0000-4000-8000-000000000002";
const stableEffective = "2098-01-01 00:00:00+00";
const raceEffective = "2026-09-22 10:00:00+00";
const orderRaceId = "earnings_concurrency_order";
const deliveryOrderId = "earnings_concurrency_delivery";

const runSql = (sql) => {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: sql, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(String(result.stderr || "Restaurant earnings SQL failed").trim());
  }
  return String(result.stdout || "").trim();
};

const runConcurrentSql = (sql) => new Promise((resolve) => {
  const child = spawn(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  child.stdin.end(sql);
});

const adminClaims = `select set_config('request.jwt.claims',jsonb_build_object(
  'role','authenticated','iss','https://securetoken.google.com/hungrieapp-a2288',
  'aud','hungrieapp-a2288','sub','fixture_firebase_super_admin','email_verified',true,
  'auth_time',extract(epoch from statement_timestamp())::bigint,
  'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);`;
const ownerClaims = `select set_config('request.jwt.claims',jsonb_build_object(
  'role','authenticated','iss','https://securetoken.google.com/hungrieapp-a2288',
  'aud','hungrieapp-a2288','sub','fixture_firebase_owner')::text,true);`;

const cleanup = () => runSql(`
  set session_replication_role=replica;
  delete from private.delivered_order_financial_snapshots
    where order_id in ('${orderRaceId}','${deliveryOrderId}');
  delete from private.order_commission_terms
    where order_id in ('${orderRaceId}','${deliveryOrderId}');
  delete from private.order_status_history
    where order_id in ('${orderRaceId}','${deliveryOrderId}');
  delete from private.audit_log where metadata->>'operation_id' in
    ('${stableOperation}','${raceOperation}') or target_id in
    ('${orderRaceId}','${deliveryOrderId}');
  delete from public.orders where id in ('${orderRaceId}','${deliveryOrderId}');
  delete from private.restaurant_commission_rules where operation_id in
    ('${stableOperation}','${raceOperation}');
  delete from private.account_access where profile_id='fixture_super_admin';
  set session_replication_role=origin;
`);

const schedule = (operationId, effective, rate = 875) => runConcurrentSql(`
  begin;
  set local role authenticated;
  ${adminClaims}
  select public.admin_schedule_restaurant_commission_v1(
    'fixture_restaurant_a',${rate},'${effective}','Concurrency qualification','${operationId}');
  commit;
`);

try {
  cleanup();
  runSql(`insert into private.account_access(profile_id,account_type,status,activated_at,
    admin_role,admin_mfa_enrolled_at) values('fixture_super_admin','admin','active',
    statement_timestamp(),'super_admin',statement_timestamp());`);

  const stableResults = await Promise.all([
    schedule(stableOperation, stableEffective),
    schedule(stableOperation, stableEffective),
  ]);
  if (stableResults.some(({ code }) => code !== 0)) {
    throw new Error(`Stable-operation concurrency failed: ${JSON.stringify(stableResults)}`);
  }
  const replayFlags = stableResults.map(({ stdout }) => stdout.includes('"replayed": true')).sort();
  if (replayFlags.join("|") !== "false|true") {
    throw new Error(`Expected one original and one replayed schedule: ${JSON.stringify(stableResults)}`);
  }
  if (runSql(`select concat_ws('|',
    (select count(*) from private.restaurant_commission_rules where operation_id='${stableOperation}'),
    (select count(*) from private.audit_log where action='restaurant.commission_rule_scheduled_v1'
      and metadata->>'operation_id'='${stableOperation}'))`) !== "1|1") {
    throw new Error("Concurrent stable operation did not produce exactly one rule and audit event.");
  }

  const creatingOrder = runConcurrentSql(`
    begin;
    insert into public.orders(id,profile_id,restaurant_id,status,payment_method,
      subtotal_kurus,total_kurus,created_at) values('${orderRaceId}','fixture_customer',
      'fixture_restaurant_a','pending','cash',1000,1000,'2026-09-22 11:00:00+00');
    select pg_sleep(1);
    commit;
  `);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const racingSchedule = schedule(raceOperation, raceEffective, 990);
  const [orderResult, scheduleResult] = await Promise.all([creatingOrder, racingSchedule]);
  if (orderResult.code !== 0 || scheduleResult.code === 0
      || !scheduleResult.stderr.includes("Effective time would change an existing order rule")) {
    throw new Error(`Order/schedule serialization failed: ${JSON.stringify({ orderResult, scheduleResult })}`);
  }
  if (runSql(`select concat_ws('|',
    (select commission_rate_bps from private.order_commission_terms where order_id='${orderRaceId}'),
    (select count(*) from private.restaurant_commission_rules where operation_id='${raceOperation}'))`) !== "800|0") {
    throw new Error("Rejected backdating race changed the committed order terms.");
  }

  runSql(`insert into public.orders(id,profile_id,restaurant_id,status,payment_method,
    subtotal_kurus,total_kurus,created_at) values('${deliveryOrderId}','fixture_customer',
    'fixture_restaurant_a','out_for_delivery','pos',2500,2500,'2026-09-22 12:00:00+00');`);
  const deliver = () => runConcurrentSql(`
    begin;
    set local role authenticated;
    ${ownerClaims}
    select public.transition_order('${deliveryOrderId}','delivered',null);
    commit;
  `);
  const deliveryResults = await Promise.all([deliver(), deliver()]);
  if (deliveryResults.filter(({ code }) => code === 0).length !== 1
      || deliveryResults.filter(({ code }) => code !== 0).length !== 1) {
    throw new Error(`Expected one delivery transition and one replay denial: ${JSON.stringify(deliveryResults)}`);
  }
  if (runSql(`select concat_ws('|',
    (select count(*) from private.delivered_order_financial_snapshots where order_id='${deliveryOrderId}'),
    (select commission_kurus from private.delivered_order_financial_snapshots where order_id='${deliveryOrderId}'),
    (select status from public.orders where id='${deliveryOrderId}'))`) !== "1|200|delivered") {
    throw new Error("Concurrent delivery did not preserve one identical authoritative snapshot.");
  }

  const planResult = runSql(`
    begin;
    set local session_replication_role=replica;
    insert into public.restaurants(id,name,is_active,lifecycle_status,accepting_orders,
      description,cuisine,address,delivery_fee_kurus,minimum_order_kurus,opening_hours)
    values('earnings_plan_restaurant','Plan Fixture',false,'pending',false,'','','',0,0,'{}');
    insert into private.restaurant_commission_rules(id,restaurant_id,rate_bps,
      commission_contract_version,effective_from,created_by_profile_id,reason,
      operation_id,request_sha256) values('eb100000-0000-4000-8000-000000000001',
      'earnings_plan_restaurant',800,1,'2025-01-01','fixture_super_admin','Plan fixture',
      'eb100000-0000-4000-8000-000000000011',repeat('e',64));
    insert into public.orders(id,profile_id,restaurant_id,status,payment_method,
      subtotal_kurus,total_kurus,delivered_at,created_at)
    select 'earnings_plan_'||g,'fixture_customer','earnings_plan_restaurant','delivered',
      case when g%2=0 then 'cash'::public.payment_method else 'pos'::public.payment_method end,
      1000,1000,'2026-01-01 00:00:00+00'::timestamptz+(g||' minutes')::interval,
      '2025-12-31 23:00:00+00'::timestamptz+(g||' minutes')::interval
    from generate_series(1,10000)g;
    insert into private.order_commission_terms(order_id,restaurant_id,commission_rule_id,
      commission_rate_bps,commission_contract_version)
    select id,'earnings_plan_restaurant','eb100000-0000-4000-8000-000000000001',800,1
    from public.orders where id like 'earnings_plan_%';
    insert into private.delivered_order_financial_snapshots(order_id,restaurant_id,
      delivered_at,payment_method,subtotal_kurus,discount_kurus,commission_base_kurus,
      commission_rate_bps,commission_kurus,restaurant_net_kurus,commission_rule_id,
      commission_contract_version)
    select id,'earnings_plan_restaurant',delivered_at,payment_method,1000,0,1000,800,80,920,
      'eb100000-0000-4000-8000-000000000001',1 from public.orders
    where id like 'earnings_plan_%';
    analyze private.delivered_order_financial_snapshots;
    do $plan$
    declare v_summary json;v_series json;v_page json;
    begin
      execute $sql$explain(format json) select sum(commission_base_kurus),sum(commission_kurus),
        sum(restaurant_net_kurus),count(*) from private.delivered_order_financial_snapshots
        where restaurant_id='earnings_plan_restaurant'
          and delivered_at>='2026-01-07 20:00:00+00' and delivered_at<'2026-01-07 23:00:00+00'$sql$
        into v_summary;
      execute $sql$explain(format json) select date_trunc('day',delivered_at),
        sum(commission_base_kurus) from private.delivered_order_financial_snapshots
        where restaurant_id='earnings_plan_restaurant'
          and delivered_at>='2026-01-07 20:00:00+00' and delivered_at<'2026-01-07 23:00:00+00'
        group by 1$sql$ into v_series;
      execute $sql$explain(format json) select order_id,delivered_at
        from private.delivered_order_financial_snapshots
        where restaurant_id='earnings_plan_restaurant'
          and delivered_at>='2026-01-07 20:00:00+00' and delivered_at<'2026-01-07 23:00:00+00'
        order by delivered_at desc,order_id desc limit 25$sql$ into v_page;
      if v_summary::text not like '%delivered_financial_snapshots_restaurant_cursor_idx%'
        or v_series::text not like '%delivered_financial_snapshots_restaurant_cursor_idx%'
        or v_page::text not like '%delivered_financial_snapshots_restaurant_cursor_idx%'
        or v_summary::text like '%"Node Type": "Seq Scan"%'
        or v_series::text like '%"Node Type": "Seq Scan"%'
        or v_page::text like '%"Node Type": "Seq Scan"%' then
        raise exception 'Representative earnings plans did not use the reviewed cursor index';
      end if;
    end $plan$;
    select 'plans_passed';
    rollback;
  `);
  if (!planResult.includes("plans_passed")) {
    throw new Error(`Representative plan qualification did not complete: ${planResult}`);
  }

  process.stdout.write(
    "Restaurant earnings concurrency and 10,000-row query-plan qualification passed.\n",
  );
} finally {
  cleanup();
}
