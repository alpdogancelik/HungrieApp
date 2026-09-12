#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secure = path.join(root,'secure');
const name = '20260912171000_phase3_reimport_recovery.sql';
const arg = (key) => process.argv.find((value) => value.startsWith(`${key}=`))?.slice(key.length+1);
const target = arg('--target');
const apply = process.argv.includes('--apply');
if (!['development','staging'].includes(target) ||
    (apply && arg('--confirm') !== `${target}:phase3-recovery-migration`)) {
  throw new Error('Target development or staging; apply requires matching confirmation.');
}
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sha = sha256(path.join(root,'supabase/migrations',name));
if (arg('--expect-sha256') !== sha) throw new Error('Recovery migration checksum mismatch.');
const state = JSON.parse(fs.readFileSync(path.join(secure,'supabase-projects.local.json'),'utf8'));
const project = state.projects?.[target];
if (!project?.ref || !project.databasePassword ||
    project.ref === state.projects?.production?.ref ||
    project.ref === state.projects?.[target === 'development' ? 'staging' : 'development']?.ref) {
  throw new Error('Hosted target identity is incomplete or overlaps another environment.');
}
const token = fs.readFileSync(path.join(secure,'supabase-cli-hungrie/access-token'),'utf8').trim();
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({query:sql})
  });
  if (!response.ok) throw new Error(`Hosted recovery preflight failed (${response.status}).`);
  return response.json();
};
const history = await query('select version from supabase_migrations.schema_migrations order by version');
const applied = new Set(history.map((r) => String(r.version)));
const pending = fs.readdirSync(path.join(root,'supabase/migrations')).filter((file) =>
  /^\d{14}_.+\.sql$/.test(file) && !applied.has(file.slice(0,14))).sort();
if (history.length !== 29 || pending.length !== 1 || pending[0] !== name) {
  throw new Error('Expected 29 applied migrations and only the recovery migration pending.');
}
const [before] = await query('select (select count(*) from private.account_access)::int account_rows,(select count(*) from private.account_classification_entries)::int ledger_entries,(select count(*) from private.account_classification_runs)::int runs');
if (apply) {
  const manifestPath = path.resolve(arg('--backup-manifest') || '');
  if (!manifestPath.startsWith(path.join(secure,`phase3-${target}-backup`) + path.sep)) {
    throw new Error('Fresh target backup manifest is required.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if (manifest.environment !== target || manifest.projectRef !== project.ref ||
      Date.now()-Date.parse(manifest.recordedAt) > 24*60*60*1000 ||
      !['schema.sql','data.sql'].every((file) => {
        const entry = manifest.files?.find((item) => item.name === file);
        const full = path.join(path.dirname(manifestPath),file);
        return entry && fs.existsSync(full) && sha256(full) === entry.sha256;
      })) throw new Error('Target backup missing, stale, or mismatched.');
}
const run = (extra) => spawnSync('supabase',['db','push','--project-ref',project.ref,
  '--password',project.databasePassword,'--skip-vault',...extra],{
  cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],
  env:{...process.env,SUPABASE_HOME:path.join(secure,'supabase-cli-hungrie'),
    SUPABASE_ACCESS_TOKEN:token}
});
const dry = run(['--dry-run']);
if (dry.status !== 0 || !`${dry.stdout}\n${dry.stderr}`.includes(name)) {
  throw new Error('Recovery migration dry-run failed.');
}
if (!apply) {
  console.log(JSON.stringify({target,mode:'dry-run',migration:name,sha256:sha,before}));
  process.exit(0);
}
const pushed = run(['--yes']);
if (pushed.status !== 0) throw new Error('Recovery migration push failed.');
const [after] = await query('select (select count(*) from supabase_migrations.schema_migrations)::int migrations,(select count(*) from private.account_access)::int account_rows,(select count(*) from private.account_classification_entries)::int ledger_entries,(select count(*) from private.account_classification_runs)::int runs');
if (after.migrations !== 30 || after.account_rows !== before.account_rows ||
    after.ledger_entries !== before.ledger_entries || after.runs !== before.runs) {
  throw new Error('Recovery migration changed classification data unexpectedly.');
}
console.log(JSON.stringify({target,mode:'applied',migration:name,sha256:sha,after}));
