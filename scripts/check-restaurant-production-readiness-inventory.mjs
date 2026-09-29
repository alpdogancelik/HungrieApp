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
const classifications = new Set(['VERIFIED_READ_ONLY', 'DOCUMENTED_BUT_UNVERIFIED', 'NOT_ESTABLISHED', 'UNKNOWN']);
for (const value of Object.values(inventory.production)) expect(classifications.has(value), `Invalid Production classification: ${value}`);

const checklist = await json('docs/restaurant-production-readiness-checklist.json');
const statuses = new Set(checklist.allowedStatuses);
expect(checklist.overallStatus === 'NOT_YET_APPROVED_NOT_EXECUTED', 'Production readiness was advanced');
expect(checklist.productionMutationsAuthorized === false, 'Production mutation authorization changed');
for (const item of checklist.items) expect(statuses.has(item.status), `Invalid checklist status: ${item.id}`);
expect(checklist.items.some(item => item.mandatory && item.status === 'FAIL'), 'Confirmed local gaps are not fail-closed');
expect(checklist.items.some(item => item.mandatory && item.status === 'BLOCKED'), 'Provider readiness must remain blocked');

const localProjects = await json('secure/supabase-projects.local.json');
expect(Boolean(localProjects.projects?.development), 'Development Supabase record is missing');
expect(Boolean(localProjects.projects?.staging), 'Staging Supabase record is missing');
expect(!localProjects.projects?.production, 'Inventory is stale: a Production Supabase record now exists');

const customerFirebase = await text('mobile/lib/firebase.ts');
expect(customerFirebase.includes('hungrieapp-a2288'), 'ISO-01 evidence changed');
const customerSupabase = await text('mobile/lib/supabaseConfig.ts');
expect(customerSupabase.includes('appEnvironment === "production" && !Object.values(NON_PRODUCTION_PROJECTS).includes(projectRef)'), 'ISO-02 evidence changed');
const adminFirebase = await text('apps/admin-web/lib/firebase.ts');
expect(adminFirebase.includes('environment!=="development"&&environment!=="staging"'), 'ISO-04 evidence changed');
const functions = await text('functions/index.js');
expect(!functions.includes('dispatchRestaurantWebPushProduction'), 'ISO-05 evidence changed');
const deploy = await text('scripts/deploy-supabase-milestone10.mjs');
expect(deploy.includes('|| "hungrieapp-a2288"'), 'ISO-06 evidence changed');
const catalog = await text('scripts/create-production-catalog-release.mjs');
expect(catalog.includes('buildImportSql(transformed, "hungrieapp-a2288")'), 'ISO-07 evidence changed');

console.log('PASS: local Production architecture inventory verified; 10 gaps remain fail-closed; Production is not established, authorized, or executed.');
