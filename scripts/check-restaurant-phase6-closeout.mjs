#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async (path) => readFile(new URL(path, root));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const acceptance = JSON.parse(await read('docs/restaurant-responsive-ui-phase6-acceptance.json'));
expect(acceptance.status === 'PASS_ACCEPTED_CLOSED', 'Phase 6 acceptance status is not closed');
expect(acceptance.productionAuthorized === false, 'Production authorization must remain false');
expect(acceptance.productionTouched === false, 'Production touched must remain false');

const evidence = [
  [acceptance.acceptedQualification.sourceManifestPath, acceptance.acceptedQualification.sourceManifestSha256],
  [acceptance.acceptedQualification.evidenceManifestPath, acceptance.acceptedQualification.evidenceManifestSha256],
  [acceptance.acceptedQualification.terminalRecordPath, acceptance.acceptedQualification.terminalRecordSha256],
  [acceptance.prerequisiteQualification.evidenceManifestPath, acceptance.prerequisiteQualification.evidenceManifestSha256],
  [acceptance.prerequisiteQualification.terminalRecordPath, acceptance.prerequisiteQualification.terminalRecordSha256],
];
for (const [path, expected] of evidence) {
  expect(sha256(await read(path)) === expected, `Evidence hash mismatch: ${path}`);
}

const index = (await read('docs/restaurant-responsive-ui-phase6-historical-evidence-integrity.tsv')).toString('utf8').trimEnd().split('\n');
expect(index.shift() === 'path\tkind\tclassification\tbytes\tsha256', 'Historical index header is invalid');
expect(index.length > 0, 'Historical index is empty');
for (const row of index) {
  const [path, kind, classification, bytes, expected] = row.split('\t');
  expect(path && kind && classification && bytes && expected, `Malformed historical index row: ${row}`);
  const value = await read(path);
  expect(value.byteLength === Number(bytes), `Historical evidence byte mismatch: ${path}`);
  expect(sha256(value) === expected, `Historical evidence hash mismatch: ${path}`);
}

const readiness = JSON.parse(await read('docs/restaurant-production-readiness-checklist.json'));
const allowed = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED', 'NOT_APPLICABLE']);
expect(readiness.overallStatus === 'NOT_YET_APPROVED_NOT_EXECUTED', 'Production readiness must remain not executed');
expect(readiness.productionMutationsAuthorized === false, 'Production mutation authorization must remain false');
for (const item of readiness.items) expect(allowed.has(item.status), `Invalid readiness status: ${item.id}`);
expect(readiness.items.some((item) => item.mandatory && ['BLOCKED', 'NOT_EXECUTED'].includes(item.status)), 'Production checklist must not be releasable');

for (const path of [
  'docs/restaurant-responsive-ui-integration-plan.md',
  'docs/restaurant-responsive-ui-phase6-review.md',
  'docs/HUNGRIE_COMPLETE_TECHNICAL_HANDOVER.md',
]) {
  const value = (await read(path)).toString('utf8');
  expect(value.includes('PASS / ACCEPTED / CLOSED'), `Current Phase 6 status missing: ${path}`);
}

console.log(`PASS: Phase 6 closeout; ${evidence.length} accepted evidence hashes and ${index.length} historical records verified; Production remains unauthorized and not executed.`);
