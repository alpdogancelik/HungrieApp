#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secure = path.join(root, 'secure');
const expected = [
  '20260906130000_admin_role_verification.sql',
  '20260907100000_admin_role_provisioning_hardening.sql',
  '20260909120000_order_detail_projection.sql',
  '20260912120000_client_release_policy_foundation.sql',
  '20260912160000_phase2_account_model_expand.sql',
  '20260912161000_phase2_account_helpers.sql',
  '20260912162000_phase2_account_rpcs.sql'
];
const state = JSON.parse(fs.readFileSync(path.join(secure, 'supabase-projects.local.json'), 'utf8'));
const staging = state.projects?.staging;
if (staging?.name !== 'HungrieApp Staging' || !staging.ref ||
    staging.ref === state.projects?.development?.ref || staging.ref === state.projects?.production?.ref) {
  throw new Error('Staging project identity is incomplete or overlaps another environment.');
}
const token = fs.readFileSync(path.join(secure, 'supabase-cli-hungrie/access-token'), 'utf8').trim();
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${staging.ref}/database/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });
  if (!response.ok) throw new Error(`Staging review query failed (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Staging review query returned malformed data.');
  return rows;
};
const response = await fetch(`https://api.supabase.com/v1/projects/${staging.ref}`, {
  headers: { authorization: `Bearer ${token}` }
});
if (!response.ok) throw new Error(`Staging metadata failed (${response.status}).`);
const metadata = await response.json();
if (metadata.name !== staging.name || metadata.status !== 'ACTIVE_HEALTHY') {
  throw new Error('Staging project identity or health changed.');
}
const history = await query('select version from supabase_migrations.schema_migrations order by version');
const applied = new Set(history.map((r) => String(r.version)));
const pending = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => /^\d{14}_.+\.sql$/.test(name) && !applied.has(name.slice(0,14))).sort();
if (history.length !== 21 || pending.length !== 9 ||
    expected.some((name,index) => pending[index] !== name) ||
    pending[7] !== '20260912170000_phase3_classification_backfill.sql' ||
    pending[8] !== '20260912171000_phase3_reimport_recovery.sql') {
  throw new Error('Staging migration history or seven-migration review batch changed.');
}
const files = expected.map((name) => {
  const bytes = fs.readFileSync(path.join(root,'supabase/migrations',name));
  return { name, bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
const batchSha256 = crypto.createHash('sha256').update(Buffer.concat(expected.map((name) =>
  fs.readFileSync(path.join(root,'supabase/migrations',name))))).digest('hex');
const [counts] = await query(`select
  (select count(*) from public.profiles)::int profiles,
  (select count(*) from public.orders)::int orders,
  (select count(*) from public.addresses)::int addresses,
  (select count(*) from private.restaurant_members)::int restaurant_memberships,
  (select count(*) from private.user_roles)::int admin_roles,
  to_regclass('private.account_access') is not null phase2_present`);
const report = { environment: 'staging', ref: staging.ref, recordedAt: new Date().toISOString(),
  appliedMigrations: history.length, reviewedPending: files, batchSha256,
  phase3MigrationsPending: pending.slice(7), counts };
const directory = path.join(secure, 'phase3-staging');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
fs.chmodSync(directory, 0o700);
const reportPath = path.join(directory, `migration-review-${Date.now()}.json`);
fs.writeFileSync(reportPath, JSON.stringify(report,null,2), { mode: 0o600, flag: 'wx' });
fs.chmodSync(reportPath, 0o600);
console.log(JSON.stringify({ environment: 'staging', appliedMigrations: history.length,
  reviewedPending: files, batchSha256, phase3MigrationsPending: pending.slice(7), counts, reportPath }));
