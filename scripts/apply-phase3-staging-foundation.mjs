#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secure = path.join(root, 'secure');
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const apply = process.argv.includes('--apply');
if (apply && arg('--confirm') !== 'staging:phase3-foundation-batch') {
  throw new Error('Staging foundation apply needs --confirm=staging:phase3-foundation-batch.');
}
const reviewPath = path.resolve(arg('--review-report') || '');
if (!reviewPath.startsWith(path.join(secure,'phase3-staging') + path.sep)) {
  throw new Error('A restricted staging migration review is required.');
}
const review = JSON.parse(fs.readFileSync(reviewPath,'utf8'));
if (review.environment !== 'staging' || review.appliedMigrations !== 21 ||
    review.reviewedPending?.length !== 7 ||
    Date.now() - Date.parse(review.recordedAt) > 24*60*60*1000 ||
    arg('--expect-sha256') !== review.batchSha256) {
  throw new Error('Staging review is stale or its batch checksum differs.');
}
const state = JSON.parse(fs.readFileSync(path.join(secure,'supabase-projects.local.json'),'utf8'));
const project = state.projects?.staging;
if (project?.name !== 'HungrieApp Staging' || project.ref !== review.ref ||
    !project.databasePassword || project.ref === state.projects?.production?.ref ||
    project.ref === state.projects?.development?.ref) {
  throw new Error('Staging project identity changed.');
}
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const migrationDir = path.join(root,'supabase/migrations');
const batch = review.reviewedPending.map((entry) => entry.name);
if (batch.some((name,index) => !/^\d{14}_.+\.sql$/.test(name) ||
    sha256(path.join(migrationDir,name)) !== review.reviewedPending[index].sha256)) {
  throw new Error('Reviewed migration files changed.');
}
const batchSha = crypto.createHash('sha256').update(Buffer.concat(batch.map((name) =>
  fs.readFileSync(path.join(migrationDir,name))))).digest('hex');
if (batchSha !== review.batchSha256) throw new Error('Reviewed batch checksum changed.');
if (apply) {
  const manifestPath = path.resolve(arg('--backup-manifest') || '');
  if (!manifestPath.startsWith(path.join(secure,'phase3-staging-backup') + path.sep)) {
    throw new Error('Restricted staging backup manifest is required.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if (manifest.environment !== 'staging' || manifest.projectRef !== project.ref ||
      Date.now()-Date.parse(manifest.recordedAt) > 24*60*60*1000 ||
      !['schema.sql','data.sql'].every((name) => {
        const entry = manifest.files?.find((f) => f.name === name);
        const file = path.join(path.dirname(manifestPath),name);
        return entry && fs.existsSync(file) && sha256(file) === entry.sha256;
      })) throw new Error('Staging backup is missing, stale, or mismatched.');
}
const token = fs.readFileSync(path.join(secure,'supabase-cli-hungrie/access-token'),'utf8').trim();
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({query:sql})
  });
  if (!response.ok) throw new Error(`Staging preflight SQL failed (${response.status}).`);
  return response.json();
};
const history = await query('select version from supabase_migrations.schema_migrations order by version');
const applied = new Set(history.map((r) => String(r.version)));
const pending = fs.readdirSync(migrationDir).filter((name) =>
  /^\d{14}_.+\.sql$/.test(name) && !applied.has(name.slice(0,14))).sort();
if (history.length !== 21 || pending.length !== 9 || batch.some((name,index) => pending[index] !== name) ||
    pending[7] !== '20260912170000_phase3_classification_backfill.sql' ||
    pending[8] !== '20260912171000_phase3_reimport_recovery.sql') {
  throw new Error('Staging migration state changed since review.');
}
const [before] = await query('select (select count(*) from public.profiles)::int profiles,(select count(*) from public.orders)::int orders,(select count(*) from public.addresses)::int addresses,(select count(*) from private.restaurant_members)::int memberships,(select count(*) from private.user_roles)::int roles');
if (JSON.stringify(before) !== JSON.stringify({ profiles: review.counts.profiles, orders: review.counts.orders,
  addresses: review.counts.addresses, memberships: review.counts.restaurant_memberships,
  roles: review.counts.admin_roles })) throw new Error('Staging source counts changed since review.');
const workdir = fs.mkdtempSync(path.join(secure,'phase3-staging-push-'));
try {
  const destination = path.join(workdir,'supabase/migrations');
  fs.mkdirSync(destination,{recursive:true,mode:0o700});
  fs.copyFileSync(path.join(root,'supabase/config.toml'),path.join(workdir,'supabase/config.toml'));
  for (const name of fs.readdirSync(migrationDir)) {
    if (/^\d{14}_.+\.sql$/.test(name) && !pending.slice(7).includes(name)) {
      fs.copyFileSync(path.join(migrationDir,name),path.join(destination,name));
    }
  }
  const run = (extra) => spawnSync('supabase', ['db','push','--project-ref',project.ref,
    '--password',project.databasePassword,'--skip-vault',...extra], {
    cwd: workdir, encoding: 'utf8', stdio: ['ignore','pipe','pipe'],
    env: { ...process.env, SUPABASE_HOME: path.join(secure,'supabase-cli-hungrie'),
      SUPABASE_ACCESS_TOKEN: token }
  });
  const dry = run(['--dry-run']);
  if (dry.status !== 0 || batch.some((name) => !`${dry.stdout}\n${dry.stderr}`.includes(name)) ||
      pending.slice(7).some((name) => `${dry.stdout}\n${dry.stderr}`.includes(name))) {
    throw new Error('Isolated staging foundation dry-run failed or listed Phase 3.');
  }
  if (!apply) {
    console.log(JSON.stringify({ target:'staging', mode:'dry-run', batch,
      batchSha256:batchSha, phase3Excluded:true }));
  } else {
    const pushed = run(['--yes']);
    if (pushed.status !== 0) throw new Error('Staging foundation push failed; inspect restricted operator logs.');
  }
} finally {
  fs.rmSync(workdir,{recursive:true,force:true});
}
if (!apply) process.exit(0);
const [after] = await query('select (select count(*) from supabase_migrations.schema_migrations)::int migrations,(select count(*) from public.profiles)::int profiles,(select count(*) from public.orders)::int orders,(select count(*) from private.restaurant_members)::int memberships,(select count(*) from private.account_access)::int account_rows');
if (after.migrations !== 28 || after.profiles !== before.profiles || after.orders !== before.orders ||
    after.memberships !== before.memberships || after.account_rows !== 0) {
  throw new Error('Staging foundation post-migration invariants failed.');
}
console.log(JSON.stringify({ target:'staging', mode:'applied', batch, batchSha256:batchSha,
  migrationCount:after.migrations, accountRows:after.account_rows, preservedCounts:before }));
