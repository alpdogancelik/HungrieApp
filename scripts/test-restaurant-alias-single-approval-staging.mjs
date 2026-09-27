import assert from "node:assert/strict";
import test from "node:test";
import { createHostedWorkflowOperations, deriveChildAuthorizations, executeWorkflowStateMachine, SINGLE_APPROVAL_WORKFLOW, validateComprehensiveApproval } from "./run-restaurant-alias-single-approval-staging.mjs";
import { DIAGNOSTIC_OPERATOR } from "./deploy-restaurant-alias-10-minute-diagnostic-staging.mjs";
import { SUPPORT } from "./restaurant-alias-diagnostic-execution-support.mjs";
import crypto from "node:crypto";

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const issuedAt = "2030-01-01T00:00:00.000Z";
const expiresAt = "2030-01-01T02:00:00.000Z";
const readOnlyAuthorizationText = `I authorize the Staging read-only EAS export check ${SINGLE_APPROVAL_WORKFLOW.checkId}; no deployment or hosted mutation is authorized, and exactly two clean exports may run.`;
const authorizationText = `I authorize one uninterrupted hosted execution for Staging run ${SINGLE_APPROVAL_WORKFLOW.runId}, including exactly one immutable deployment, conditional promotion, and verified rollback. Restaurant Earnings remains disabled.`;

function approval(overrides = {}) {
  return {
    contractVersion: 1, decision: SINGLE_APPROVAL_WORKFLOW.decision, approvedForCompleteHostedWorkflow: true, environment: "staging", checkId: SINGLE_APPROVAL_WORKFLOW.checkId, runId: SINGLE_APPROVAL_WORKFLOW.runId,
    checkpointParent: SINGLE_APPROVAL_WORKFLOW.parentCheckpoint, sourceCommit: "a".repeat(40), sourceManifestSha256: "b".repeat(64), applicationTree: DIAGNOSTIC_OPERATOR.applicationTree,
    proposalSha256: SUPPORT.proposalSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256, buildInputContractSha256: DIAGNOSTIC_OPERATOR.buildInputContractSha256,
    readOnlyAuthorizationText, readOnlyAuthorizationTextSha256: sha256(readOnlyAuthorizationText), authorizationText, authorizationTextSha256: sha256(authorizationText), issuedAt, expiresAt, limits: SINGLE_APPROVAL_WORKFLOW.limits,
    ...overrides,
  };
}

test("one comprehensive approval validates and derives a dynamic diagnostic window", () => {
  const value = approval();
  validateComprehensiveApproval(value, { now: Date.parse(issuedAt) + 1 });
  const children = deriveChildAuthorizations(value, { startedAt: "2030-01-01T00:10:00.000Z" });
  assert.equal(children.diagnostic.maintenanceWindowStart, "2030-01-01T00:10:00.000Z");
  assert.equal(children.diagnostic.maintenanceWindowEnd, expiresAt);
});

for (const [name, override] of [
  ["wrong run", { runId: "ruip6ad_wrong" }], ["wrong parent", { checkpointParent: "c".repeat(40) }], ["wrong manifest", { sourceManifestSha256: "bad" }],
  ["wrong artifact", { artifactManifestSha256: "d".repeat(64) }], ["wrong limits", { limits: { ...SINGLE_APPROVAL_WORKFLOW.limits, deploymentAttempts: 2 } }],
]) test(`comprehensive approval rejects ${name}`, () => assert.throws(() => validateComprehensiveApproval(approval(override), { now: Date.parse(issuedAt) + 1 })));

test("child authority derivation fails when too little time remains", () => assert.throws(() => deriveChildAuthorizations(approval(), { startedAt: "2030-01-01T01:31:00.000Z" }), /Insufficient/));

function operations({ failAt } = {}) {
  const calls = [];
  const names = ["readOnlyExports", "verifyFreshness", "baseline", "captureRollback", "exportArtifact", "initializeResources", "reserveDeployment", "deploy", "registerDeployment", "verifyImmutable", "qualifyAccounts", "prepareRecapture", "recaptureRollback", "verifyRecapture", "finalPreflight", "confirmRollbackReady", "promote", "observe", "rollback", "verifyRollback", "finalize"];
  const value = Object.fromEntries(names.map(name => [name, async () => { calls.push(name); if (name === failAt) throw new Error(`${name} failed`); return "PASS"; }]));
  value.recordTerminal = async () => { calls.push("recordTerminal"); };
  return { value, calls };
}

test("complete workflow runs once through exports, promotion, observation, rollback, and finalization", async () => {
  const { value, calls } = operations();
  const result = await executeWorkflowStateMachine({ operations: value, clock: { now: () => Date.parse(expiresAt) } });
  assert.equal(result.classification, "PASS");
  for (const name of ["deploy", "promote", "rollback", "verifyRollback"]) assert.equal(calls.filter(value => value === name).length, 1);
});

test("export failure stops before deployment and diagnostic authority work", async () => {
  const { value, calls } = operations({ failAt: "readOnlyExports" });
  const result = await executeWorkflowStateMachine({ operations: value });
  assert.equal(result.classification, "FAIL"); assert.equal(calls.includes("deploy"), false); assert.equal(calls.includes("promote"), false);
});

for (const gate of ["verifyImmutable", "qualifyAccounts", "finalPreflight", "confirmRollbackReady"])
  test(`${gate} failure prevents promotion`, async () => { const { value, calls } = operations({ failAt: gate }); await executeWorkflowStateMachine({ operations: value }); assert.equal(calls.includes("promote"), false); });

test("post-promotion observation failure performs one rollback and terminal reconciliation", async () => {
  const { value, calls } = operations({ failAt: "observe" });
  const result = await executeWorkflowStateMachine({ operations: value });
  assert.equal(result.classification, "FAIL"); assert.equal(calls.filter(value => value === "rollback").length, 1); assert.equal(calls.filter(value => value === "verifyRollback").length, 1); assert.equal(calls.includes("recordTerminal"), true); assert.equal(calls.includes("finalize"), true);
});

test("uncertain promotion performs one rollback without retrying promotion", async () => {
  const { value, calls } = operations({ failAt: "promote" });
  const result = await executeWorkflowStateMachine({ operations: value });
  assert.equal(result.classification, "FAIL"); assert.equal(calls.filter(value => value === "promote").length, 1); assert.equal(calls.filter(value => value === "rollback").length, 1); assert.equal(calls.filter(value => value === "verifyRollback").length, 1);
});

test("hosted operation adapter emits exact action confirmations and no retry command", async () => {
  const calls = []; const run = (command, args) => { calls.push([command, args]); return { status: 0 }; };
  const ops = createHostedWorkflowOperations({ repoRoot: "/repo", approval: approval(), authorityPath: "/authority", sourceManifestPath: "/manifest", accountsPath: "/accounts", chromePath: "/chrome", run });
  await ops.baseline(); await ops.deploy(); await ops.promote(); await ops.rollback();
  assert.equal(calls.length, 4);
  assert.ok(calls.every(([, args]) => args.some(value => value.includes(SINGLE_APPROVAL_WORKFLOW.runId))));
  assert.equal(calls.some(([, args]) => args.includes("retry")), false);
});
