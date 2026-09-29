#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = async path => (await readFile(new URL(path, root))).toString('utf8');
const json = async path => JSON.parse(await text(path));
const expect = (condition, message) => { if (!condition) throw new Error(message); };

const acceptance = await json('docs/restaurant-responsive-ui-phase6-acceptance.json');
expect(acceptance.status === 'PASS_ACCEPTED_CLOSED', 'Phase 6 is not accepted and closed');
expect(acceptance.productionAuthorized === false && acceptance.productionTouched === false, 'Phase 6 record crossed the Production boundary');

const inventory = await json('docs/restaurant-production-architecture-inventory.json');
expect(inventory.method === 'LOCAL_READ_ONLY', 'Inventory method is not local/read-only');
expect(inventory.hostedRequests === 0 && inventory.productionMutations === 0, 'Inventory recorded hosted or Production activity');
expect(inventory.production.overall === 'NOT_ESTABLISHED', 'Production must remain not established');
expect(inventory.confirmedLocalGaps.length === 10, 'Expected ten confirmed local gaps');
expect(inventory.localRemediation?.status === 'LOCAL_PASS_HOSTED_NOT_EXECUTED' && inventory.localRemediation?.resolvedGapCount === 10, 'Ten-gap local remediation is not recorded');
expect(inventory.ownerSequencingDecision?.restaurantProductionHostingPlatform === 'VERCEL_INTENDED_DOCUMENTED_NOT_PROVISIONED', 'Intended Vercel decision is missing');
expect(inventory.ownerSequencingDecision?.firebaseProduction === 'DEFERRED_BY_OWNER' && inventory.ownerSequencingDecision?.supabaseProduction === 'DEFERRED_BY_OWNER', 'Production backend deferral is missing');
const classifications = new Set(['VERIFIED_READ_ONLY', 'DOCUMENTED_BUT_UNVERIFIED', 'NOT_ESTABLISHED', 'UNKNOWN']);
for (const value of Object.values(inventory.production)) expect(classifications.has(value), `Invalid Production classification: ${value}`);

const checklist = await json('docs/restaurant-production-readiness-checklist.json');
const statuses = new Set(checklist.allowedStatuses);
expect(checklist.overallStatus === 'NOT_YET_APPROVED_NOT_EXECUTED', 'Production readiness was advanced');
expect(checklist.productionMutationsAuthorized === false, 'Production mutation authorization changed');
expect(checklist.firebaseProductionProvisioning === 'DEFERRED_BY_OWNER' && checklist.supabaseProductionProvisioning === 'DEFERRED_BY_OWNER', 'Checklist backend deferral mismatch');
expect(checklist.restaurantProductionHostingPlatform === 'VERCEL_INTENDED_DOCUMENTED_NOT_PROVISIONED', 'Checklist Vercel decision mismatch');
for (const item of checklist.items) expect(statuses.has(item.status), `Invalid checklist status: ${item.id}`);
expect(checklist.confirmedLocalGapCount === 0 && checklist.locallyResolvedGapCount === 10, 'Local gap counts are not reconciled');
for (const id of ['SOURCE_ENVIRONMENT_BINDINGS', 'PRODUCTION_OPERATOR_CONTRACTS']) {
  const item = checklist.items.find(entry => entry.id === id);
  expect(item?.status === 'PASS' && item?.evidenceClassification === 'LOCAL_PASS_HOSTED_NOT_EXECUTED', `${id} is not locally remediated`);
}
expect(checklist.items.some(item => item.mandatory && item.status === 'BLOCKED'), 'Provider readiness must remain blocked');
const hostingDecision = checklist.items.find(item => item.id === 'HOSTING_TARGET_DECISION');
expect(hostingDecision?.status === 'PASS' && hostingDecision?.decision === 'VERCEL_INTENDED', 'Hosting target decision is not recorded');

const deferred = await text('docs/production-firebase-supabase-deferred-work.md');
expect(deferred.includes('Production Firebase provisioning: **DEFERRED BY OWNER**'), 'Firebase deferral handoff missing');
expect(deferred.includes('Production Supabase provisioning: **DEFERRED BY OWNER**'), 'Supabase deferral handoff missing');
expect(deferred.includes('Production Firebase ve Supabase\'e geçelim'), 'Exact resume trigger missing');

const localProjects = await json('secure/supabase-projects.local.json');
expect(Boolean(localProjects.projects?.development), 'Development Supabase record is missing');
expect(Boolean(localProjects.projects?.staging), 'Staging Supabase record is missing');
expect(!localProjects.projects?.production, 'Inventory is stale: a Production Supabase record now exists');

const customerFirebase = await text('mobile/lib/firebaseConfig.ts');
expect(customerFirebase.includes('Production requires explicit') && customerFirebase.includes('cannot use the Development/Staging Firebase project'), 'ISO-01 remediation missing');
const customerSupabase = await text('mobile/lib/supabaseConfig.ts');
expect(customerSupabase.includes('config.expectedProjectRef'), 'ISO-02 remediation missing');
const adminFirebase = await text('apps/admin-web/lib/firebase.ts');
expect(adminFirebase.includes('runtime.suffix'), 'ISO-04 remediation missing');
const functions = await text('functions/index.js');
expect(functions.includes('dispatchRestaurantWebPushProduction') && functions.includes('deleteHungrieAccountProduction'), 'ISO-05 remediation missing');
const deploy = await text('scripts/deploy-supabase-milestone10.mjs');
expect(deploy.includes('loadProductionOperatorContract'), 'ISO-06 remediation missing');
const catalog = await text('scripts/create-production-catalog-release.mjs');
expect(catalog.includes('buildImportSql(transformed, firebaseProjectId)'), 'ISO-07 remediation missing');
expect((await text('scripts/verify-supabase-milestone11-environment.mjs')).includes('row.firebase_project_id !== valueFor("--expect-firebase-project-id")'), 'ISO-08 remediation missing');
expect((await text('scripts/operate-firebase-production.mjs')).includes('loadProductionOperatorContract'), 'ISO-09 remediation missing');
expect((await json('docs/restaurant-nonproduction-tool-classification.json')).allowedEnvironments.includes('production') === false, 'ISO-10 remediation missing');

console.log('PASS: ten Production isolation gaps are locally remediated and fail closed; hosted Production remains not established, authorized, or executed.');
