#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { classify, compareShadow, digest } from './phase3-classification-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const args = process.argv.slice(2);
const arg = (name) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
const target = arg('--target');
const mode = arg('--mode') || 'inventory';
const credentialPath = arg('--credential');
const expectedFirebaseProject = arg('--firebase-project');
const runId = arg('--run-id') || crypto.randomUUID();
if (!['development', 'staging'].includes(target) || !['inventory','apply','shadow'].includes(mode)) {
  throw new Error('Use --target=development|staging and --mode=inventory|apply|shadow.');
}
if (!credentialPath || !path.isAbsolute(credentialPath) ||
    !path.relative(root, credentialPath).startsWith('..') || !fs.existsSync(credentialPath)) {
  throw new Error('Supply an external Firebase Admin credential with --credential=absolute-path.');
}
if (!expectedFirebaseProject || !/^[a-z][a-z0-9-]+$/.test(expectedFirebaseProject)) {
  throw new Error('Specify the expected Firebase project explicitly.');
}
if (!/^[0-9a-f-]{36}$/.test(runId)) throw new Error('Run ID must be a UUID.');
const credential = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
if (credential.project_id !== expectedFirebaseProject) throw new Error('Firebase credential project mismatch.');
const state = JSON.parse(fs.readFileSync(path.join(root, 'secure/supabase-projects.local.json'), 'utf8'));
const project = state.projects?.[target];
if (!project?.ref || !project?.name || project.ref === state.projects?.production?.ref ||
    (target === 'development' && project.ref === state.projects?.staging?.ref)) {
  throw new Error('Supabase target identity is incomplete or overlaps another environment.');
}
const managementToken = fs.readFileSync(path.join(root, 'secure/supabase-cli-hungrie/access-token'), 'utf8').trim();
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: 'POST', headers: { authorization: `Bearer ${managementToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });
  if (!response.ok) throw new Error(`Hosted ${target} query failed (${response.status}); SQL details withheld.`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Database response is malformed.');
  return rows;
};
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const metadataResponse = await fetch(`https://api.supabase.com/v1/projects/${project.ref}`, {
  headers: { authorization: `Bearer ${managementToken}` }
});
if (!metadataResponse.ok) throw new Error(`Project metadata failed (${metadataResponse.status}).`);
const metadata = await metadataResponse.json();
if (metadata.name !== project.name || metadata.status !== 'ACTIVE_HEALTHY') {
  throw new Error('Hosted project identity or health changed.');
}
const credentialApp = admin.initializeApp({ credential: admin.credential.cert(credential),
  projectId: expectedFirebaseProject }, `phase3-${target}-${runId}`);
const readFirebaseUsers = async () => {
  const collected = [];
  let page;
  do {
    const result = await credentialApp.auth().listUsers(1000, page);
    collected.push(...result.users.map((u) => ({ uid: u.uid, email: u.email || '',
      emailVerified: u.emailVerified, disabled: u.disabled,
      platformRole: u.customClaims?.platform_role || null })));
    page = result.pageToken;
  } while (page);
  return collected.sort((a,b) => a.uid.localeCompare(b.uid));
};
const users = await readFirebaseUsers();

const [capabilities] = await query("select to_regclass('private.account_access') is not null as has_phase2");
const hasPhase2 = capabilities?.has_phase2 === true;
if (mode !== 'inventory' && !hasPhase2) throw new Error('Phase 2 schema is required before shadow comparison or import.');
const snapshotSql = `select
  (select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb) from public.profiles p) profiles,
  (select coalesce(jsonb_agg(${hasPhase2 ? 'to_jsonb(r)' : "to_jsonb(r) || jsonb_build_object('lifecycle_status',case when r.is_active then 'active' else 'pending' end)"} order by r.id),'[]'::jsonb) from public.restaurants r) restaurants,
  (select coalesce(jsonb_agg(to_jsonb(ur) order by ur.profile_id,ur.role),'[]'::jsonb) from private.user_roles ur) roles,
  (select coalesce(jsonb_agg(to_jsonb(rm) order by rm.profile_id,rm.restaurant_id),'[]'::jsonb) from private.restaurant_members rm) memberships,
  (select coalesce(jsonb_agg(jsonb_build_object('profile_id',o.profile_id) order by o.profile_id),'[]'::jsonb) from public.orders o) orders,
  (select coalesce(jsonb_agg(jsonb_build_object('profile_id',a.profile_id) order by a.profile_id),'[]'::jsonb) from public.addresses a) addresses,
  ${hasPhase2 ? "(select coalesce(jsonb_agg(to_jsonb(ac) order by ac.profile_id),'[]'::jsonb) from private.account_access ac)" : "'[]'::jsonb"} access,
  ${hasPhase2 ? "(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) from private.account_invitations i)" : "'[]'::jsonb"} invitations,
  ${hasPhase2 ? "(select coalesce(jsonb_agg(to_jsonb(e) order by e.normalized_email),'[]'::jsonb) from private.account_email_reservations e)" : "'[]'::jsonb"} reservations`;
const readSnapshot = async () => {
  const [row] = await query(snapshotSql);
  for (const field of ['profiles','restaurants','roles','memberships','orders','addresses','access','invitations','reservations']) {
    if (!Array.isArray(row?.[field])) throw new Error(`Snapshot ${field} is missing; Phase 2 may not be installed.`);
  }
  return row;
};
const snapshot = await readSnapshot();
const result = classify(snapshot, users);
const sourceSha256 = digest({ snapshot, users });
const proposalSha256 = digest(result.proposals);
const reportDir = path.join(root, 'secure', `phase3-${target}`);
fs.mkdirSync(reportDir, { recursive: true, mode: 0o700 });
fs.chmodSync(reportDir, 0o700);
const report = { environment: target, supabaseRef: project.ref,
  firebaseProject: expectedFirebaseProject, recordedAt: new Date().toISOString(),
  phase2Installed: hasPhase2,
  runId, sourceSha256, proposalSha256, counts: result.counts,
  proposals: result.proposals, conflicts: result.conflicts };
if (mode === 'apply') {
  if (arg('--confirm') !== `${target}:phase3-classification` || result.conflicts.length || !hasPhase2) {
    throw new Error('Import needs matching target confirmation, Phase 2, and zero inventory conflicts.');
  }
  const backupPath = arg('--backup-manifest');
  if (!backupPath || !path.resolve(backupPath).startsWith(path.join(root,'secure') + path.sep)) {
    throw new Error('A fresh ignored target backup manifest is required.');
  }
  const backup = JSON.parse(fs.readFileSync(backupPath,'utf8'));
  if (backup.environment !== target || backup.projectRef !== project.ref ||
      Date.now()-Date.parse(backup.recordedAt) > 24*60*60*1000 ||
      !['schema.sql','data.sql'].every((name) => {
        const entry = backup.files?.find((f) => f.name === name);
        const file = path.join(path.dirname(backupPath),name);
        return entry && fs.existsSync(file) &&
          crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === entry.sha256;
      })) throw new Error('Target backup is missing, stale, or does not match its manifest.');
  const fresh = await readSnapshot();
  if (digest(fresh) !== digest(snapshot)) throw new Error('Database source changed during inventory; retry.');
  if (digest(await readFirebaseUsers()) !== digest(users)) {
    throw new Error('Firebase identities changed during inventory; retry.');
  }
  const [applied] = await query(`select private.phase3_import_classification(${quote(runId)}::uuid,
    ${quote(target)},${quote(proposalSha256)},${quote(JSON.stringify(result.proposals))}::jsonb) inserted`);
  report.inserted = Number(applied?.inserted);
  const after = await readSnapshot();
  if (digest(after.roles) !== digest(snapshot.roles) ||
      digest(after.memberships) !== digest(snapshot.memberships)) {
    throw new Error('Legacy authority changed during import; stop and investigate.');
  }
  const [ledger] = await query(`select r.state,r.inserted_count,
    (select count(*) from private.account_classification_entries e where e.run_id=r.id)::int entry_count
    from private.account_classification_runs r where r.id=${quote(runId)}::uuid`);
  if (ledger?.state !== 'completed' || ledger.entry_count !== ledger.inserted_count ||
      after.access.length !== result.proposals.length) {
    throw new Error('Classification ledger or row coverage failed.');
  }
  report.ledger = ledger;
  const shadow = compareShadow(after, result.proposals, users);
  report.shadow = shadow;
  if (shadow.unexplained.length) report.exitGate = 'unexplained_shadow_differences';
  else report.exitGate = `${target}_rehearsal_passed`;
} else if (mode === 'shadow') {
  report.shadow = compareShadow(snapshot, result.proposals, users);
  report.exitGate = result.conflicts.length || report.shadow.unexplained.length ? 'blocked' : 'passed';
}
const reportPath = path.join(reportDir, `${mode}-${runId}-${Date.now()}.json`);
fs.writeFileSync(reportPath, JSON.stringify(report,null,2), { mode: 0o600, flag: 'wx' });
fs.chmodSync(reportPath, 0o600);
await credentialApp.delete();
console.log(JSON.stringify({ target, mode, runId, counts: result.counts,
  inserted: report.inserted, unexplainedShadow: report.shadow?.unexplained.length,
  reportPath, exitGate: report.exitGate || (result.conflicts.length ? 'conflicts' : 'inventory_clear') }));
if (result.conflicts.length || report.shadow?.unexplained.length) process.exitCode = 2;
