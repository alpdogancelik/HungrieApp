import assert from "node:assert/strict";
import test from "node:test";
import { INSPECTION, buildAuthorizationText, buildReadRequest, classifyInspection, collectInspection, sanitizeDeploymentResponse, sanitizeProjectResponse, sha256, validateApproval } from "./inspect-restaurant-vercel-project-protection.mjs";

const bindings = { sourceCommit: "a".repeat(40), sourceManifestSha256: "b".repeat(64), operatorSha256: "c".repeat(64) };
const approval = (overrides = {}) => {
  const authorizationText = buildAuthorizationText(bindings);
  return { schemaVersion: 1, kind: INSPECTION.kind, decision: "APPROVE_READ_ONLY_VERCEL_PROJECT_PROTECTION_INSPECTION", inspectionId: INSPECTION.inspectionId, issuedAt: "2026-09-28T18:00:00.000Z", expiresAt: "2026-09-28T20:00:00.000Z", authorizationText, authorizationTextSha256: sha256(Buffer.from(authorizationText)), ...bindings, projectId: INSPECTION.projectId, deploymentId: INSPECTION.deploymentId, scope: INSPECTION.scope, evidenceDirectory: INSPECTION.evidenceDirectory, limits: INSPECTION.limits, ...overrides };
};

const projectFixture = (overrides = {}) => ({ id: INSPECTION.projectId, name: INSPECTION.projectName, accountId: INSPECTION.teamId, enablePreviewFeedback: false, ssoProtection: { deploymentType: INSPECTION.expectedProtection }, protectionBypass: { existing_record: { note: "unrelated" } }, ...overrides });
const deploymentFixture = (overrides = {}) => ({ id: INSPECTION.deploymentId, name: INSPECTION.projectName, projectId: INSPECTION.projectId, teamId: INSPECTION.teamId, target: INSPECTION.expectedTarget, readyState: INSPECTION.expectedReadyState, url: INSPECTION.deploymentHostname, ...overrides });

test("exact approval is valid for exactly two hours", () => {
  assert.equal(validateApproval(approval(), { now: Date.parse("2026-09-28T19:00:00Z") }).inspectionId, INSPECTION.inspectionId);
  assert.throws(() => validateApproval(approval(), { now: Date.parse("2026-09-28T20:00:00Z") }), /not valid/);
  assert.throws(() => validateApproval(approval({ limits: { ...INSPECTION.limits, projectGets: 2 } }), { now: Date.parse("2026-09-28T19:00:00Z") }), /identity or limits/);
});

test("request contract permits only the two fixed authenticated GETs", () => {
  const project = buildReadRequest("project"), deployment = buildReadRequest("deployment");
  assert.equal(project.method, "GET"); assert.equal(project.body, null); assert.match(project.args.join(" "), new RegExp(`/v9/projects/${INSPECTION.projectId}`));
  assert.equal(deployment.method, "GET"); assert.equal(deployment.body, null); assert.match(deployment.args.join(" "), new RegExp(`/v13/deployments/${INSPECTION.deploymentId}`));
  for (const request of [project, deployment]) { assert.equal(request.command, "npx"); assert.equal(request.args.filter(value => value === "--scope").length, 1); assert.equal(request.args.includes(INSPECTION.scope), true); assert.equal(request.args.some(value => ["--method", "POST", "PATCH", "DELETE", "PUT", "deploy", "alias"].includes(value)), false); }
  assert.throws(() => buildReadRequest("environment"), /Unexpected/);
});

test("direct and wrapped provider shapes are sanitized without raw bodies or bypass keys", () => {
  const secretLikeKey = "sensitive-bypass-key";
  for (const value of [projectFixture({ protectionBypass: { [secretLikeKey]: { note: "x" } } }), { project: projectFixture({ protectionBypass: { [secretLikeKey]: { note: "x" } } }) }]) {
    const sanitized = sanitizeProjectResponse(value);
    assert.equal(sanitized.id, INSPECTION.projectId); assert.equal(sanitized.automationBypassRepresentation, "OBJECT"); assert.equal(sanitized.automationBypassCount, 1); assert.equal(JSON.stringify(sanitized).includes(secretLikeKey), false);
  }
  for (const value of [deploymentFixture(), { deployment: deploymentFixture() }]) assert.equal(sanitizeDeploymentResponse(value).id, INSPECTION.deploymentId);
});

test("reviewed project, protection, and deployment state passes", () => {
  const result = classifyInspection(sanitizeProjectResponse(projectFixture()), sanitizeDeploymentResponse(deploymentFixture()));
  assert.equal(result.classification, "PASS_REVIEWED_STATE"); assert.equal(result.firstFailure, null); assert.equal(result.assertions.every(row => row.passed), true);
});

test("wrong project or team is distinguished from provider schema drift", () => {
  for (const overrides of [{ id: "wrong" }, { name: "wrong" }, { accountId: "team_wrong" }]) assert.equal(classifyInspection(sanitizeProjectResponse(projectFixture(overrides)), sanitizeDeploymentResponse(deploymentFixture())).classification, "REAL_WRONG_PROJECT_OR_SCOPE");
  assert.equal(classifyInspection(sanitizeProjectResponse({ ...projectFixture(), id: undefined }), sanitizeDeploymentResponse(deploymentFixture())).classification, "PROVIDER_SCHEMA_OR_CANONICALIZATION_CHANGE");
});

test("protection drift is distinct from schema or canonicalization changes", () => {
  for (const overrides of [{ enablePreviewFeedback: true }, { ssoProtection: { deploymentType: "none" } }]) assert.equal(classifyInspection(sanitizeProjectResponse(projectFixture(overrides)), sanitizeDeploymentResponse(deploymentFixture())).classification, "REAL_PROTECTION_STATE_DRIFT");
  for (const overrides of [{ enablePreviewFeedback: undefined }, { ssoProtection: {} }, { protectionBypass: undefined }]) assert.equal(classifyInspection(sanitizeProjectResponse(projectFixture(overrides)), sanitizeDeploymentResponse(deploymentFixture())).classification, "PROVIDER_SCHEMA_OR_CANONICALIZATION_CHANGE");
});

test("deployment identity, target, state, and hostname drift fails closed", () => {
  for (const overrides of [{ id: "wrong" }, { name: "wrong" }, { target: "production" }, { readyState: "ERROR" }, { url: "wrong.vercel.app" }]) {
    const result = classifyInspection(sanitizeProjectResponse(projectFixture()), sanitizeDeploymentResponse(deploymentFixture(overrides)));
    assert.equal(result.classification, "REAL_DEPLOYMENT_IDENTITY_DRIFT"); assert.equal(result.firstFailure.observed, Object.values(overrides)[0]);
  }
});

test("malformed responses cannot pass", () => {
  const malformedProject = sanitizeProjectResponse([]), malformedDeployment = sanitizeDeploymentResponse("bad");
  assert.equal(classifyInspection(malformedProject, sanitizeDeploymentResponse(deploymentFixture())).classification, "PROVIDER_SCHEMA_OR_CANONICALIZATION_CHANGE");
  assert.equal(classifyInspection(sanitizeProjectResponse(projectFixture()), malformedDeployment).classification, "PROVIDER_SCHEMA_OR_CANONICALIZATION_CHANGE");
});

test("the two reads are sequential, bounded, and never retried", async () => {
  const calls = [], result = await collectInspection({ repoRoot: "/fixture", clock: () => "2026-09-28T19:00:00.000Z", transport: async ({ resource }) => { calls.push(resource); return resource === "project" ? projectFixture() : deploymentFixture(); } });
  assert.deepEqual(calls, ["project", "deployment"]); assert.equal(result.terminal.projectGets, 1); assert.equal(result.terminal.deploymentGets, 1); assert.equal(result.terminal.retries, 0); assert.equal(result.terminal.mutations, 0); assert.equal(result.terminal.classification, "PASS_REVIEWED_STATE");
});

test("project and deployment read failures retain attempted counts without retry", async () => {
  const projectFailure = await collectInspection({ repoRoot: "/fixture", transport: async () => { throw Object.assign(new Error("secret provider text"), { safe: { exitCode: 1, stderrBytes: 20, stderrSha256: "d".repeat(64) } }); } });
  assert.equal(projectFailure.terminal.classification, "INSPECTION_READ_FAILED"); assert.equal(projectFailure.terminal.projectGets, 1); assert.equal(projectFailure.terminal.deploymentGets, 0); assert.equal(JSON.stringify(projectFailure).includes("secret provider text"), false);
  const calls = [], deploymentFailure = await collectInspection({ repoRoot: "/fixture", transport: async ({ resource }) => { calls.push(resource); if (resource === "deployment") throw new Error("failed"); return projectFixture(); } });
  assert.deepEqual(calls, ["project", "deployment"]); assert.equal(deploymentFailure.terminal.projectGets, 1); assert.equal(deploymentFailure.terminal.deploymentGets, 1); assert.equal(deploymentFailure.terminal.retries, 0); assert.equal(deploymentFailure.terminal.mutations, 0);
});

test("authorization text explicitly excludes mutation, bypass, browser, Firebase, and FCM work", () => {
  const text = buildAuthorizationText(bindings);
  assert.match(text, /exactly one authenticated GET of project/); assert.match(text, /exactly one authenticated GET of immutable deployment/);
  assert.match(text, /zero retries, zero bypass creation or revocation, zero configuration mutation, zero deployment/);
  assert.match(text, /zero browser or account access, zero Firebase or FCM action/);
});
