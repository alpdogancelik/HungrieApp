#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const target = arg('--target');
if (!['development','staging'].includes(target)) throw new Error('Target development or staging explicitly.');
const state = JSON.parse(fs.readFileSync(path.join(root,'secure/supabase-projects.local.json'),'utf8'));
const project = state.projects?.[target];
if (!project?.ref || project.ref === state.projects?.production?.ref ||
    project.ref === state.projects?.[target === 'development' ? 'staging' : 'development']?.ref) {
  throw new Error('Hosted target identity is incomplete or overlaps another environment.');
}
const token = fs.readFileSync(path.join(root,'secure/supabase-cli-hungrie/access-token'),'utf8').trim();
const sql = `select
  (select count(*) from supabase_migrations.schema_migrations)::int migrations,
  (select count(*) from public.profiles where deleted_at is null and deletion_pending_at is null)::int active_profiles,
  (select count(*) from private.account_access)::int account_rows,
  (select count(*) from private.account_access where account_type='customer')::int customers,
  (select count(*) from private.account_access where account_type='restaurant')::int restaurants,
  (select count(*) from private.account_access where account_type='admin')::int admins,
  (select count(*) from public.profiles p where p.deleted_at is null and p.deletion_pending_at is null
    and not exists(select 1 from private.account_access a where a.profile_id=p.id))::int unclassified_profiles,
  (select count(*) from private.account_access a where a.account_type='restaurant' and
    (a.status<>'active' or not exists(select 1 from private.restaurant_members m
      where m.profile_id=a.profile_id and m.restaurant_id=a.restaurant_id and m.role=a.restaurant_role)
      or not exists(select 1 from public.restaurants r where r.id=a.restaurant_id
        and r.is_active and r.lifecycle_status='active')))::int bad_restaurant_scopes,
  (select count(*) from private.account_access a where a.account_type='admin' and
    (a.status<>'pending' or a.onboarding_step<>'admin_mfa_enrollment_required'
      or a.admin_mfa_enrolled_at is not null))::int active_or_bad_admin_imports,
  (select count(*) from private.account_classification_runs where state='completed')::int completed_runs,
  (select coalesce(sum(inserted_count),0) from private.account_classification_runs where state='completed')::int ledger_insertions,
  (select count(*) from private.account_classification_entries)::int ledger_entries,
  (select count(*) from private.restaurant_members)::int legacy_memberships,
  (select count(*) from private.user_roles)::int legacy_roles,
  has_function_privilege('authenticated',
    'private.phase3_import_classification(uuid,text,text,jsonb)','execute') as client_import_execute,
  has_function_privilege('authenticated',
    'private.phase3_revert_classification(uuid)','execute') as client_revert_execute`;
const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({query:sql})
});
if (!response.ok) throw new Error(`Hosted verification failed (${response.status}).`);
const [result] = await response.json();
const passed = result?.migrations === 30 && result.account_rows === result.active_profiles &&
  result.unclassified_profiles === 0 && result.bad_restaurant_scopes === 0 &&
  result.active_or_bad_admin_imports === 0 && result.completed_runs === 1 &&
  result.ledger_insertions === result.ledger_entries &&
  result.ledger_entries === result.account_rows &&
  result.client_import_execute === false && result.client_revert_execute === false;
console.log(JSON.stringify({ target, passed, ...result }));
if (!passed) process.exitCode = 2;
