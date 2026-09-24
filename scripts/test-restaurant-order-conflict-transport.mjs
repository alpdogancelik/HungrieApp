import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

const dbContainer = "supabase_db_hungrie-app";
const restContainer = "supabase_rest_hungrie-app";
const apiBase = "http://127.0.0.1:54321/rest/v1";
const prefix = "conflict_transport_";

function sql(statement) {
  const result = spawnSync("docker", ["exec", "-i", dbContainer, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-At"], {
    input: statement,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Local SQL failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function jwt(secret, subject) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = encode({
    sub: subject,
    role: "authenticated",
    aud: "hungrieapp-a2288",
    iss: "https://securetoken.google.com/hungrieapp-a2288",
    iat: now,
    exp: now + 600,
  });
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function request(path, token, body, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(`${apiBase}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        apikey: anonKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: response.status, body: parsed, elapsedMs: Number((performance.now() - started).toFixed(3)) };
  } finally {
    clearTimeout(timer);
  }
}

async function rpc(name, token, body, timeoutMs) {
  return request(`rpc/${name}`, token, body, timeoutMs);
}

function operation(suffix) {
  const hex = crypto.createHash("sha256").update(suffix).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function version(orderId) {
  return sql(`select updated_at from public.orders where id='${orderId}';`);
}

function expectConflict(result, message) {
  assert.equal(result.status, 409, `${message}: expected HTTP 409, got ${result.status}`);
  assert.equal(result.body?.code, "40001", `${message}: client-visible conflict code changed`);
  assert.ok(result.elapsedMs < 2000, `${message}: response took ${result.elapsedMs} ms`);
}

function cleanup() {
  sql(`
begin;
select set_config('hungrie.runtime_write_bypass','on',true);
delete from private.notification_deliveries where event_id in
  (select id from private.notification_events where order_id like '${prefix}%');
delete from private.notification_events where order_id like '${prefix}%';
delete from private.restaurant_customer_cancellation_messages where order_id like '${prefix}%';
delete from private.restaurant_order_visibility where order_id like '${prefix}%';
delete from private.restaurant_financial_integrity_alerts where order_id like '${prefix}%';
delete from private.delivered_order_financial_snapshots where order_id like '${prefix}%';
delete from private.order_commission_terms where order_id like '${prefix}%';
delete from private.order_status_history where order_id like '${prefix}%';
delete from private.order_contacts where order_id like '${prefix}%';
delete from private.order_import_metadata where order_id like '${prefix}%';
delete from public.product_reviews where order_id like '${prefix}%';
delete from public.order_reviews where order_id like '${prefix}%';
delete from public.order_items where order_id like '${prefix}%';
delete from private.audit_log where actor_profile_id like '${prefix}%' or target_id like '${prefix}%';
delete from public.orders where id like '${prefix}%';
delete from private.restaurant_operations where profile_id like '${prefix}%';
delete from private.account_access where profile_id like '${prefix}%';
delete from private.restaurant_commission_rules where restaurant_id like '${prefix}%';
delete from public.profiles where id like '${prefix}%';
delete from public.restaurants where id like '${prefix}%';
commit;
`);
}

const restImage = execFileSync("docker", ["inspect", restContainer, "--format", "{{.Config.Image}}"], { encoding: "utf8" }).trim();
assert.equal(restImage, "public.ecr.aws/supabase/postgrest:v14.5", "Qualification requires local PostgREST 14.5");
const localStatus = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }));
assert.match(localStatus.API_URL, /^http:\/\/127\.0\.0\.1:/, "Only the local Supabase API may be tested");
const anonKey = localStatus.ANON_KEY;
assert.ok(anonKey && localStatus.JWT_SECRET, "Local Supabase credentials unavailable");

const ownerToken = jwt(localStatus.JWT_SECRET, `${prefix}owner_uid`);
const otherToken = jwt(localStatus.JWT_SECRET, `${prefix}other_owner_uid`);
const orderIds = {
  stale: `${prefix}stale_order`,
  acknowledge: `${prefix}ack_order`,
  cancel: `${prefix}cancel_order`,
  replay: `${prefix}replay_order`,
  concurrent: `${prefix}concurrent_order`,
};

const evidence = { postgrest: "14.5", probes: {}, cleanup: false };

cleanup();
try {
  assert.equal(sql("select private.restaurant_earnings_enabled_v1();"), "f", "Earnings must remain disabled");
  assert.equal(sql(`select count(*) from public.profiles where id like '${prefix}%';`), "0", "Stale local profiles exist");

  sql(`
begin;
select set_config('hungrie.runtime_write_bypass','on',true);
insert into public.profiles(id,firebase_uid,name,email,preferred_language) values
  ('${prefix}owner','${prefix}owner_uid','Conflict Owner','conflict-owner@example.invalid','en'),
  ('${prefix}other_owner','${prefix}other_owner_uid','Other Owner','conflict-other@example.invalid','tr'),
  ('${prefix}customer','${prefix}customer_uid','Conflict Customer','conflict-customer@example.invalid','en');
insert into public.restaurants(id,name,description,cuisine,address,is_active,lifecycle_status,accepting_orders,
  delivery_eta_min_minutes,delivery_eta_max_minutes,delivery_fee_kurus,minimum_order_kurus,opening_hours) values
  ('${prefix}restaurant_a','Conflict Restaurant A','Local qualification','Fixture','Local A',true,'active',true,20,30,0,0,'{}'),
  ('${prefix}restaurant_b','Conflict Restaurant B','Local qualification','Fixture','Local B',true,'active',true,20,30,0,0,'{}');
insert into private.account_access(profile_id,account_type,status,onboarding_step,activated_at,restaurant_id,restaurant_role) values
  ('${prefix}owner','restaurant','active','none',statement_timestamp(),'${prefix}restaurant_a','owner'),
  ('${prefix}other_owner','restaurant','active','none',statement_timestamp(),'${prefix}restaurant_b','owner'),
  ('${prefix}customer','customer','active','none',statement_timestamp(),null,null);
insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,approval_deadline_at)
select id,'${prefix}customer','${prefix}restaurant_a','pending','cash',1000,1000,statement_timestamp()+interval '10 minutes'
from unnest(array['${Object.values(orderIds).join("','")}']) id;
commit;
`);

  const conflictSideEffectQuery = `
select jsonb_build_object(
  'history',(select count(*) from private.order_status_history where order_id in
    ('${orderIds.stale}','${orderIds.acknowledge}','${orderIds.cancel}')),
  'visibility',(select count(*) from private.restaurant_order_visibility where order_id in
    ('${orderIds.stale}','${orderIds.acknowledge}','${orderIds.cancel}')),
  'cancellationMessages',(select count(*) from private.restaurant_customer_cancellation_messages where order_id='${orderIds.cancel}'),
  'audit',(select count(*) from private.audit_log where target_id in
    ('${orderIds.stale}','${orderIds.acknowledge}','${orderIds.cancel}')),
  'notifications',(select count(*) from private.notification_events where order_id in
    ('${orderIds.stale}','${orderIds.acknowledge}','${orderIds.cancel}')),
  'completedOperations',(select count(*) from private.restaurant_operations where operation_id in
    ('${operation("stale-transition")}','${operation("stale-acknowledgement")}','${operation("stale-cancellation")}'))
)::text;`;
  const conflictSideEffectBaseline = JSON.parse(sql(conflictSideEffectQuery));

  const staleVersion = "2000-01-01T00:00:00Z";
  const staleTransition = await rpc("restaurant_transition_order_v1", ownerToken, {
    p_order_id: orderIds.stale,
    p_expected_version: staleVersion,
    p_new_status: "preparing",
    p_reason_code: null,
    p_note: null,
    p_operation_id: operation("stale-transition"),
  });
  expectConflict(staleTransition, "stale transition");
  evidence.probes.staleTransition = staleTransition;

  const staleAcknowledgement = await rpc("restaurant_acknowledge_order_seen_v1", ownerToken, {
    p_order_id: orderIds.acknowledge,
    p_order_version: staleVersion,
    p_operation_id: operation("stale-acknowledgement"),
  });
  expectConflict(staleAcknowledgement, "stale acknowledgement");
  evidence.probes.staleAcknowledgement = staleAcknowledgement;

  const staleCancellation = await rpc("restaurant_cancel_order_v2", ownerToken, {
    p_order_id: orderIds.cancel,
    p_expected_version: staleVersion,
    p_reason_code: "other",
    p_customer_message: "",
    p_operation_id: operation("stale-cancellation"),
  });
  expectConflict(staleCancellation, "stale cancellation");
  evidence.probes.staleCancellation = staleCancellation;

  const staleSideEffects = JSON.parse(sql(conflictSideEffectQuery));
  assert.deepEqual(staleSideEffects, conflictSideEffectBaseline, "A stale conflict produced side effects");
  assert.deepEqual(staleSideEffects, {
    audit: 0,
    history: 0,
    visibility: 0,
    notifications: 0,
    completedOperations: 0,
    cancellationMessages: 0,
  });
  evidence.probes.staleSideEffects = staleSideEffects;

  const denied = await rpc("restaurant_transition_order_v1", otherToken, {
    p_order_id: orderIds.stale,
    p_expected_version: version(orderIds.stale),
    p_new_status: "preparing",
    p_reason_code: null,
    p_note: null,
    p_operation_id: operation("cross-tenant"),
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.body?.code, "42501");
  evidence.probes.crossTenantDenial = denied;

  const replayVersion = version(orderIds.replay);
  const replayArgs = {
    p_order_id: orderIds.replay,
    p_expected_version: replayVersion,
    p_new_status: "preparing",
    p_reason_code: null,
    p_note: null,
    p_operation_id: operation("stable-replay"),
  };
  const firstReplay = await rpc("restaurant_transition_order_v1", ownerToken, replayArgs);
  const secondReplay = await rpc("restaurant_transition_order_v1", ownerToken, replayArgs);
  assert.equal(firstReplay.status, 200);
  assert.equal(secondReplay.status, 200);
  assert.deepEqual(secondReplay.body, firstReplay.body);
  assert.equal(sql(`select count(*) from private.order_status_history where order_id='${orderIds.replay}' and source='restaurant';`), "1");
  evidence.probes.idempotentReplay = { first: firstReplay, second: secondReplay };

  const changedReplay = await rpc("restaurant_transition_order_v1", ownerToken, { ...replayArgs, p_new_status: "ready" });
  assert.equal(changedReplay.status, 400);
  assert.equal(changedReplay.body?.code, "22023");
  evidence.probes.changedReplayDenied = changedReplay;

  const concurrentVersion = version(orderIds.concurrent);
  const concurrent = await Promise.all([
    rpc("restaurant_transition_order_v1", ownerToken, {
      p_order_id: orderIds.concurrent,
      p_expected_version: concurrentVersion,
      p_new_status: "preparing",
      p_reason_code: null,
      p_note: null,
      p_operation_id: operation("concurrent-prepare"),
    }),
    rpc("restaurant_transition_order_v1", ownerToken, {
      p_order_id: orderIds.concurrent,
      p_expected_version: concurrentVersion,
      p_new_status: "canceled",
      p_reason_code: "other",
      p_note: null,
      p_operation_id: operation("concurrent-cancel"),
    }),
  ]);
  assert.deepEqual(concurrent.map(value => value.status).sort((a, b) => a - b), [200, 409]);
  expectConflict(concurrent.find(value => value.status === 409), "concurrent loser");
  evidence.probes.concurrentTransitions = concurrent;

  const recovered = await rpc("restaurant_get_order_v1", ownerToken, { p_order_id: orderIds.concurrent });
  assert.equal(recovered.status, 200);
  assert.ok(["preparing", "canceled"].includes(recovered.body?.status));
  assert.notEqual(recovered.body?.updated_at, concurrentVersion);
  evidence.probes.authoritativeRecovery = recovered;

  const currentCancel = await rpc("restaurant_cancel_order_v2", ownerToken, {
    p_order_id: orderIds.cancel,
    p_expected_version: version(orderIds.cancel),
    p_reason_code: "other",
    p_customer_message: "Local qualification",
    p_operation_id: operation("current-cancellation"),
  });
  assert.equal(currentCancel.status, 200);
  assert.equal(currentCancel.body?.status, "canceled");
  evidence.probes.currentCancellation = currentCancel;

  assert.equal(sql(`select count(*) from pg_stat_activity where
    (query like '%restaurant_transition_order_v1%' or query like '%restaurant_acknowledge_order_seen_v1%')
    and pid<>pg_backend_pid();`), "0", "A PostgREST retry backend remained active");
  assert.equal(sql("select private.restaurant_earnings_enabled_v1();"), "f", "Earnings state changed");
  evidence.activeRetryBackends = 0;
  evidence.earningsDisabled = true;
} finally {
  cleanup();
  evidence.cleanup = sql(`select
    (select count(*) from public.profiles where id like '${prefix}%')+
    (select count(*) from public.restaurants where id like '${prefix}%')+
    (select count(*) from public.orders where id like '${prefix}%')+
    (select count(*) from private.restaurant_operations where profile_id like '${prefix}%');`) === "0";
}

assert.equal(evidence.cleanup, true, "Local qualification fixtures were not fully removed");
console.log(JSON.stringify(evidence, null, 2));
