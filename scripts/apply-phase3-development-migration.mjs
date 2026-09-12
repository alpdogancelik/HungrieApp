#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secure = path.join(root, 'secure');
const migrations = ['20260912170000_phase3_classification_backfill.sql',
  '20260912171000_phase3_reimport_recovery.sql'];
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const apply = process.argv.includes('--apply');
if (arg('--target') !== 'development' || (apply && arg('--confirm') !== 'development:phase3-migration')) {
  throw new Error('Target development explicitly; apply requires --confirm=development:phase3-migration.');
}
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sha = crypto.createHash('sha256').update(Buffer.concat(migrations.map((name) =>
  fs.readFileSync(path.join(root,'supabase/migrations',name))))).digest('hex');
if (arg('--expect-sha256') !== sha) throw new Error('Migration batch checksum differs from reviewed files.');
const state = JSON.parse(fs.readFileSync(path.join(secure, 'supabase-projects.local.json'), 'utf8'));
const project = state.projects?.development;
if (!project?.ref || !project.databasePassword || project.name !== 'HungrieApp Development' ||
    project.ref === state.projects?.staging?.ref || project.ref === state.projects?.production?.ref) {
  throw new Error('Development identity is incomplete or overlaps another environment.');
}
const token = fs.readFileSync(path.join(secure, 'supabase-cli-hungrie/access-token'), 'utf8').trim();
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });
  if (!response.ok) throw new Error(`Development SQL preflight failed (${response.status}).`);
  return response.json();
};
const metadataResponse = await fetch(`https://api.supabase.com/v1/projects/${project.ref}`, {
  headers: { authorization: `Bearer ${token}` }
});
if (!metadataResponse.ok) throw new Error(`Development metadata check failed (${metadataResponse.status}).`);
const metadata = await metadataResponse.json();
if (metadata.name !== project.name || metadata.status !== 'ACTIVE_HEALTHY') {
  throw new Error('Development project identity or health changed.');
}
const history = await query('select version from supabase_migrations.schema_migrations order by version');
const applied = new Set(history.map((row) => String(row.version)));
const pending = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => /^\d{14}_.+\.sql$/.test(name) && !applied.has(name.slice(0,14))).sort();
if (history.length !== 28 || pending.length !== 2 ||
    migrations.some((name,index) => pending[index] !== name)) {
  throw new Error('Expected 28 migrations applied and only two Phase 3 migrations pending in development.');
}
if (apply) {
  const manifestPath = path.resolve(arg('--backup-manifest') || '');
  if (!manifestPath.startsWith(secure + path.sep)) throw new Error('Fresh ignored backup manifest is required.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.environment !== 'development' || manifest.projectRef !== project.ref ||
      Date.now() - Date.parse(manifest.recordedAt) > 24 * 60 * 60 * 1000 ||
      !['schema.sql','data.sql'].every((name) => {
        const entry = manifest.files?.find((f) => f.name === name);
        const file = path.join(path.dirname(manifestPath), name);
        return entry && fs.existsSync(file) && sha256(file) === entry.sha256;
      })) throw new Error('Backup is stale, missing, or mismatched.');
}
const run = (extra) => spawnSync('supabase', ['db','push','--project-ref',project.ref,
  '--password',project.databasePassword,'--skip-vault',...extra], {
  cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'],
  env: { ...process.env, SUPABASE_HOME: path.join(secure,'supabase-cli-hungrie'),
    SUPABASE_ACCESS_TOKEN: token }
});
const dry = run(['--dry-run']);
if (dry.status !== 0 || migrations.some((name) => !`${dry.stdout}\n${dry.stderr}`.includes(name))) {
  throw new Error('Development migration dry-run failed.');
}
if (!apply) {
  console.log(JSON.stringify({ target: 'development', mode: 'dry-run', migrations, sha256: sha }));
  process.exit(0);
}
const pushed = run(['--yes']);
if (pushed.status !== 0) throw new Error('Development migration failed; inspect restricted operator logs.');
const [after] = await query("select (select count(*) from supabase_migrations.schema_migrations)::int migrations,(select count(*) from private.account_access)::int account_rows,(select count(*) from private.account_classification_runs)::int runs");
if (after?.migrations !== 30 || after.account_rows !== 0 || after.runs !== 0) {
  throw new Error('Development post-migration invariant failed.');
}
console.log(JSON.stringify({ target: 'development', mode: 'applied', migrations, sha256: sha,
  migrationCount: after.migrations, accountRows: after.account_rows }));
