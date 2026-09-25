#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { ACCOUNT_PREPARATION, buildPreparationSql, buildRecoverySql } from "./restaurant-staging-account-preparation.mjs";

const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const targetProfiles = Object.values(ACCOUNT_PREPARATION.accounts).map(a => a.profileId);
const cleanupGuard = [...targetProfiles, "ruip6ad_local_existing_owner", "ruip6ad_local_existing_manager", "ruip6ad_local_customer"];

function postgresAvailable() {
  const result = spawnSync("docker", ["exec", "supabase_db_hungrie-app", "pg_isready", "-U", "postgres"], { encoding: "utf8" });
  return result.status === 0;
}

function fixtureSql() {
  const profiles = [
    ...Object.entries(ACCOUNT_PREPARATION.accounts).map(([name, a]) => `(${q(a.profileId)},${q(a.profileId)},${q("Local " + name)},${q(a.email)})`),
    "('ruip6ad_local_existing_owner','ruip6ad_local_existing_owner','Existing owner','existing-owner@example.invalid')",
    "('ruip6ad_local_existing_manager','ruip6ad_local_existing_manager','Existing manager','existing-manager@example.invalid')",
    "('ruip6ad_local_customer','ruip6ad_local_customer','Order customer','order-customer@example.invalid')",
  ].join(",");
  const access = Object.entries(ACCOUNT_PREPARATION.accounts).map(([name, a]) => `(${q(a.profileId)},'customer',${q(name === "suspended" ? "revoked" : "active")},'none',${a.beforeVersion},${name === "suspended" ? "'2026-09-25 00:00:00+00'::timestamptz" : "null"},'2026-09-25 00:00:00+00'::timestamptz,'2026-09-25 00:00:00+00'::timestamptz,'2026-09-25 00:00:00+00'::timestamptz)`).join(",");
  const reservations = Object.values(ACCOUNT_PREPARATION.accounts).map(a => `(${q(a.email)},'customer',${q(a.profileId)},${q(a.profileId)})`).join(",");
  return `
begin;
do $$ begin if exists(select 1 from public.profiles where id in(${cleanupGuard.map(q).join(",")})) or exists(select 1 from public.restaurants where id in(${q(ACCOUNT_PREPARATION.restaurantId)},'lombard-kitchen')) then raise exception 'LOCAL_FIXTURE_COLLISION'; end if; end $$;
insert into public.profiles(id,firebase_uid,name,email) values ${profiles};
insert into public.restaurants(id,name,is_active,lifecycle_status,accepting_orders) values(${q(ACCOUNT_PREPARATION.restaurantId)},'Phase 4 Restaurant QA',true,'active',false),('lombard-kitchen','Local Lombard dependency',true,'active',false);
update public.restaurants set accepting_orders=false where id=${q(ACCOUNT_PREPARATION.restaurantId)};
insert into private.account_access(profile_id,account_type,status,onboarding_step,authz_version,revoked_at,activated_at,created_at,updated_at) values ${access};
insert into private.account_access(profile_id,account_type,status,onboarding_step,restaurant_id,restaurant_role,authz_version,activated_at) values
 ('ruip6ad_local_existing_owner','restaurant','active','none',${q(ACCOUNT_PREPARATION.restaurantId)},'owner',1,statement_timestamp()),
 ('ruip6ad_local_existing_manager','restaurant','active','none',${q(ACCOUNT_PREPARATION.restaurantId)},'manager',1,statement_timestamp());
insert into private.account_email_reservations(normalized_email,account_type,firebase_uid,profile_id) values ${reservations};
insert into public.addresses(id,profile_id,label,line1,city,country,is_default,created_at,updated_at) values
 ('zeQ0xgA79Up5XTNs-i_Dg',${q(ACCOUNT_PREPARATION.accounts.pending.profileId)},'Pending','Synthetic','Test','TRNC',true,'2026-09-25 00:00:00+00','2026-09-25 00:00:00+00'),
 ('7KnWuexTChn4F7o9hMtzH',${q(ACCOUNT_PREPARATION.accounts.suspended.profileId)},'Suspended','Synthetic','Test','TRNC',true,'2026-09-25 00:00:00+00','2026-09-25 00:00:00+00');
insert into public.favorites(profile_id,restaurant_id,created_at) values(${q(ACCOUNT_PREPARATION.accounts.suspended.profileId)},'lombard-kitchen','2026-09-25 00:00:00+00');
insert into private.notification_preferences(profile_id,created_at,updated_at) values(${q(ACCOUNT_PREPARATION.accounts.pending.profileId)},'2026-09-25 00:00:00+00','2026-09-25 00:00:00+00'),(${q(ACCOUNT_PREPARATION.accounts.suspended.profileId)},'2026-09-25 00:00:00+00','2026-09-25 00:00:00+00');
insert into private.account_provisioning_operations(operation_id,operation_kind,request_digest,state,target_profile_id)
select ('10000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'customer_bootstrap',repeat('a',64),'completed',case when g<=6 then ${q(ACCOUNT_PREPARATION.accounts.suspended.profileId)} when g=7 then ${q(ACCOUNT_PREPARATION.accounts.owner.profileId)} when g=8 then ${q(ACCOUNT_PREPARATION.accounts.manager.profileId)} else ${q(ACCOUNT_PREPARATION.accounts.pending.profileId)} end from generate_series(1,9) g;
insert into private.audit_log(actor_profile_id,action,target_type,target_id) select p.id,'local.fixture','profile',p.id from public.profiles p where p.id in(${targetProfiles.map(q).join(",")});
insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,delivered_at,canceled_at) values
 ('ruip6ad_local_delivered','ruip6ad_local_customer',${q(ACCOUNT_PREPARATION.restaurantId)},'delivered','cash',100,100,statement_timestamp(),null),
 ('ruip6ad_local_canceled','ruip6ad_local_customer',${q(ACCOUNT_PREPARATION.restaurantId)},'canceled','cash',100,100,null,statement_timestamp());
insert into private.account_invitations(id,normalized_email,account_type,restaurant_id,restaurant_role,token_digest,state,expires_at) select ('20000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'local-invite-'||g||'@example.invalid','restaurant',${q(ACCOUNT_PREPARATION.restaurantId)},'manager',md5(g::text)||md5('x'||g::text),'revoked',statement_timestamp()+interval '1 day' from generate_series(1,4) g;
insert into private.restaurant_operational_incidents(id,restaurant_id,incident_type,state,window_started_at,window_ended_at,ignored_order_count,eligible_order_count,threshold_snapshot) values('30000000-0000-0000-0000-000000000001',${q(ACCOUNT_PREPARATION.restaurantId)},'repeated_order_non_response','open',statement_timestamp()-interval '1 hour',statement_timestamp(),1,1,'{}');
insert into private.restaurant_commission_rules(id,restaurant_id,rate_bps,effective_from,created_by_profile_id,reason,operation_id,request_sha256) values('40000000-0000-0000-0000-000000000001',${q(ACCOUNT_PREPARATION.restaurantId)},1000,statement_timestamp(),'ruip6ad_local_existing_owner','Local fixture','50000000-0000-0000-0000-000000000001',repeat('b',64));
`;
}

function localBeforeState() {
  const access = Object.entries(ACCOUNT_PREPARATION.accounts).map(([name, a]) => ({ profile_id: a.profileId, account_type: "customer", status: name === "suspended" ? "revoked" : "active", onboarding_step: "none", restaurant_id: null, restaurant_role: null, authz_version: a.beforeVersion, created_by_profile_id: null, created_at: "2026-09-25T00:00:00+00:00", activated_at: "2026-09-25T00:00:00+00:00", revoked_at: name === "suspended" ? "2026-09-25T00:00:00+00:00" : null, status_reason_code: null }));
  const addresses = [["zeQ0xgA79Up5XTNs-i_Dg", ACCOUNT_PREPARATION.accounts.pending.profileId, "Pending"], ["7KnWuexTChn4F7o9hMtzH", ACCOUNT_PREPARATION.accounts.suspended.profileId, "Suspended"]].map(([id, profile_id, label]) => ({ id, profile_id, label, line1: "Synthetic", block: null, room: null, city: "Test", country: "TRNC", is_default: true, created_at: "2026-09-25T00:00:00+00:00", updated_at: "2026-09-25T00:00:00+00:00" }));
  return { schemaVersion: 1, stage: "before", runId: ACCOUNT_PREPARATION.runId, projectRef: ACCOUNT_PREPARATION.supabaseProjectRef, restaurantId: ACCOUNT_PREPARATION.restaurantId, planSha256: ACCOUNT_PREPARATION.planSha256, capturedAt: "2026-09-25T00:00:00.000Z", pendingMigrations: 0, schemaContractValid: true, earningsEnabled: false, restaurant: { id: ACCOUNT_PREPARATION.restaurantId, lifecycle_status: "active", is_active: true, accepting_orders: false }, restaurantSha256: ACCOUNT_PREPARATION.restaurantSha256, profiles: Object.values(ACCOUNT_PREPARATION.accounts).map(a => ({ id: a.profileId, firebase_uid: a.profileId, email: a.email, deletion_pending_at: null, deleted_at: null })), access, reservations: Object.values(ACCOUNT_PREPARATION.accounts).map(a => ({ normalized_email: a.email, account_type: "customer", firebase_uid: a.profileId, profile_id: a.profileId, invitation_id: null })), rowHashes: structuredClone(ACCOUNT_PREPARATION.rowHashes), disposable: { addresses, favorites: [{ profile_id: ACCOUNT_PREPARATION.accounts.suspended.profileId, restaurant_id: "lombard-kitchen", created_at: "2026-09-25T00:00:00+00:00" }], preferences: [ACCOUNT_PREPARATION.accounts.pending.profileId, ACCOUNT_PREPARATION.accounts.suspended.profileId].map(profile_id => ({ profile_id, order_status_enabled: true, restaurant_orders_enabled: true, review_replies_enabled: true, created_at: "2026-09-25T00:00:00+00:00", updated_at: "2026-09-25T00:00:00+00:00" })) }, identityRelationships: { memberships: 0, platformRoles: 0, orders: 0, reviews: 0, pushTokens: 0, invitations: 0, provisioning: 9, existingAudits: 4 }, restaurantCounts: structuredClone(ACCOUNT_PREPARATION.protectedCounts) };
}

function hashVariablesSql() {
  const lines = [];
  for (const [name, a] of Object.entries(ACCOUNT_PREPARATION.accounts)) {
    lines.push(`select encode(extensions.digest(to_jsonb(p)::text,'sha256'),'hex') ${name}_profile_hash from public.profiles p where id=${q(a.profileId)} \\gset`);
    lines.push(`select encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex') ${name}_access_hash from private.account_access x where profile_id=${q(a.profileId)} \\gset`);
    lines.push(`select encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex') ${name}_reservation_hash from private.account_email_reservations x where normalized_email=${q(a.email)} \\gset`);
  }
  lines.push("select encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex') pending_address_hash from public.addresses x where id='zeQ0xgA79Up5XTNs-i_Dg' \\gset");
  lines.push("select encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex') suspended_address_hash from public.addresses x where id='7KnWuexTChn4F7o9hMtzH' \\gset");
  lines.push("select encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex') favorite_hash from public.favorites x where profile_id='TBaq9HQIL9OBwLFP3MKchi3rpSA2' and restaurant_id='lombard-kitchen' \\gset");
  lines.push("select encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex') pending_preference_hash from private.notification_preferences x where profile_id='v9kzlLATn9fQxJ6oPTUjxTDj8MJ3' \\gset");
  lines.push("select encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex') suspended_preference_hash from private.notification_preferences x where profile_id='TBaq9HQIL9OBwLFP3MKchi3rpSA2' \\gset");
  lines.push(`select encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex') restaurant_hash from public.restaurants x where id=${q(ACCOUNT_PREPARATION.restaurantId)} \\gset`);
  return lines.join("\n") + "\n";
}

function locallyBoundPreparationSql() {
  let sql = buildPreparationSql("1".repeat(64), "2".repeat(64)).replace(/^begin;\n/, "").replace(/\ncommit;$/, "");
  const replacements = new Map();
  for (const [name, a] of Object.entries(ACCOUNT_PREPARATION.accounts)) {
    replacements.set(ACCOUNT_PREPARATION.rowHashes.profiles[a.profileId], `:'${name}_profile_hash'`);
    replacements.set(ACCOUNT_PREPARATION.rowHashes.access[a.profileId], `:'${name}_access_hash'`);
    replacements.set(ACCOUNT_PREPARATION.rowHashes.reservations[a.email], `:'${name}_reservation_hash'`);
  }
  replacements.set(ACCOUNT_PREPARATION.rowHashes.disposable["address:zeQ0xgA79Up5XTNs-i_Dg"], ":'pending_address_hash'");
  replacements.set(ACCOUNT_PREPARATION.rowHashes.disposable["address:7KnWuexTChn4F7o9hMtzH"], ":'suspended_address_hash'");
  replacements.set(ACCOUNT_PREPARATION.rowHashes.disposable["favorite:TBaq9HQIL9OBwLFP3MKchi3rpSA2:lombard-kitchen"], ":'favorite_hash'");
  replacements.set(ACCOUNT_PREPARATION.rowHashes.disposable["preference:v9kzlLATn9fQxJ6oPTUjxTDj8MJ3"], ":'pending_preference_hash'");
  replacements.set(ACCOUNT_PREPARATION.rowHashes.disposable["preference:TBaq9HQIL9OBwLFP3MKchi3rpSA2"], ":'suspended_preference_hash'");
  replacements.set(ACCOUNT_PREPARATION.restaurantSha256, ":'restaurant_hash'");
  for (const [literal, variable] of replacements) sql = sql.replaceAll(q(literal), variable);
  return sql;
}

function localRecoverySql() {
  return buildRecoverySql(localBeforeState(), "2".repeat(64)).replace(/^begin;\n/, "").replace(/\ncommit;$/, "");
}

test("generated preparation and recovery execute under real local PostgreSQL constraints and roll back", { timeout: 30_000 }, () => {
  assert.equal(postgresAvailable(), true, "local Supabase PostgreSQL must be running");
  const verifyPrepared = `
do $$ begin
 if (select count(*) from private.account_access where profile_id in(${targetProfiles.map(q).join(",")}) and account_type='restaurant' and restaurant_id=${q(ACCOUNT_PREPARATION.restaurantId)})<>4 then raise exception 'LOCAL_ACCESS_VERIFY'; end if;
 if exists(select 1 from private.restaurant_members where profile_id in(${targetProfiles.map(q).join(",")})) then raise exception 'LOCAL_MEMBERSHIP_VERIFY'; end if;
 if (select count(*) from private.audit_log where action='qualification.restaurant_identity_reclassified' and metadata->>'run_id'=${q(ACCOUNT_PREPARATION.runId)})<>4 then raise exception 'LOCAL_AUDIT_VERIFY'; end if;
 if (select count(*) from private.account_provisioning_operations where target_profile_id in(${targetProfiles.map(q).join(",")}))<>9 then raise exception 'LOCAL_HISTORY_VERIFY'; end if;
end $$;
`;
  const verifyRecovered = `
do $$ begin
 if (select count(*) from private.account_access where profile_id in(${targetProfiles.map(q).join(",")}) and account_type='customer' and restaurant_id is null and restaurant_role is null)<>4 then raise exception 'LOCAL_RECOVERY_ACCESS_VERIFY'; end if;
 if (select count(*) from private.account_access where profile_id in(${targetProfiles.map(q).join(",")}) and authz_version in (3,8))<>4 then raise exception 'LOCAL_RECOVERY_VERSION_VERIFY'; end if;
 if (select count(*) from public.addresses where id in('zeQ0xgA79Up5XTNs-i_Dg','7KnWuexTChn4F7o9hMtzH'))<>2 or (select count(*) from public.favorites where profile_id='TBaq9HQIL9OBwLFP3MKchi3rpSA2' and restaurant_id='lombard-kitchen')<>1 or (select count(*) from private.notification_preferences where profile_id in('v9kzlLATn9fQxJ6oPTUjxTDj8MJ3','TBaq9HQIL9OBwLFP3MKchi3rpSA2'))<>2 then raise exception 'LOCAL_RECOVERY_DISPOSABLE_VERIFY'; end if;
 if (select count(*) from private.audit_log where action='qualification.restaurant_identity_reclassification_recovered' and metadata->>'run_id'=${q(ACCOUNT_PREPARATION.runId)})<>4 then raise exception 'LOCAL_RECOVERY_AUDIT_VERIFY'; end if;
end $$;
rollback;
select count(*)=0 fixture_rolled_back from public.profiles where id in(${cleanupGuard.map(q).join(",")});
`;
  const script = "\\set ON_ERROR_STOP on\n" + fixtureSql() + hashVariablesSql() + locallyBoundPreparationSql() + verifyPrepared + localRecoverySql() + verifyRecovered;
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_hungrie-app", "psql", "-U", "postgres", "-d", "postgres", "-At"], { input: script, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /t\s*$/);
});
