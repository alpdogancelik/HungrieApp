#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secure = path.join(root, 'secure');
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const target = arg('--target');
if (!['development', 'staging'].includes(target) || arg('--confirm') !== `${target}:phase4-backup`) {
  throw new Error('Use --target=development|staging with matching --confirm=<target>:phase4-backup.');
}
const state = JSON.parse(fs.readFileSync(path.join(secure, 'supabase-projects.local.json'), 'utf8'));
const project = state.projects?.[target];
if (!project?.ref || !project.databasePassword || project.ref === state.projects?.production?.ref ||
    project.ref === state.projects?.[target === 'development' ? 'staging' : 'development']?.ref) {
  throw new Error('Environment credentials are incomplete or overlap another environment.');
}
const token = fs.readFileSync(path.join(secure, 'supabase-cli-hungrie/access-token'), 'utf8').trim();
const destination = path.join(secure, `phase4-${target}-backup`, new Date().toISOString().replaceAll(/[:.]/g, '-'));
fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
fs.chmodSync(destination, 0o700);
const files = [{ name: 'schema.sql', args: [] },
  { name: 'data.sql', args: ['--data-only', '--use-copy'] }];
for (const entry of files) {
  const output = path.join(destination, entry.name);
  const result = spawnSync('supabase', ['db', 'dump', '--project-ref', project.ref,
    '--password', project.databasePassword, '--file', output, ...entry.args], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SUPABASE_HOME: path.join(secure, 'supabase-cli-hungrie'),
      SUPABASE_ACCESS_TOKEN: token }
  });
  if (result.status !== 0 || !fs.existsSync(output) || fs.statSync(output).size < 1024) {
    throw new Error(`${target} ${entry.name} dump failed; command output withheld.`);
  }
  fs.chmodSync(output, 0o600);
}
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest = { environment: target, projectRef: project.ref, recordedAt: new Date().toISOString(),
  files: files.map(({ name }) => ({ name, bytes: fs.statSync(path.join(destination, name)).size,
    sha256: sha256(path.join(destination, name)) })) };
const manifestPath = path.join(destination, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
fs.chmodSync(manifestPath, 0o600);
console.log(JSON.stringify({ environment: target, manifestPath,
  files: manifest.files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })) }));
