import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BASELINE_FIREBASE_AUTHORIZED_DOMAINS, CONTINUATION, EXPECTED_FIREBASE_AUTHORIZED_DOMAINS, FIREBASE_AUTH_CONFIG_SCOPE, FIREBASE_AUTH_CONFIG_URL, FIREBASE_PROJECT_IDENTITY, buildAuthorizationText, buildBypassApiRequest, buildFirebaseAuthorizedDomainInspectionRequest, buildPostRevokeProjectVerificationRequest, buildProtectedBrowserBootstrap, buildProtectedRedirectRequest, classifySafetyError, createFirebaseAuthorizedDomainTransport, establishOwnerNotificationRoute, executeControlledContinuation, executeReservedQualification, finalizeQualificationEvidence, generateBypassSecret, inspectFirebaseAuthorizedDomains, persistReservedEvidence, reserveQualificationEvidence, runFirebaseAuthorizedDomainPreflight, runVercelQualificationPreflight, sanitizeContinuationError, sanitizeProtectedBootstrapEvidence, sha256, validateApproval, validateBypassSecret, validateFirebaseAuthorizedDomainResponse, validateFirebaseConfigResourceName, validateProtectedBootstrapResponse, validateProtectedBrowserRequest, validateTrustedFirebaseProjectIdentity, validateVercelQualificationPreflight, verifyBypassApiResponse, verifyBypassInventoryTransition, verifyCompletedFirebaseInspection, verifyCompletedVercelInspection, verifyEvidenceReservation, verifyPostRevokeProjectResponse } from "./restaurant-vercel-preview-browser-notification-continuation.mjs";

const bindings = { sourceCommit: "a".repeat(40), sourceManifestSha256: "b".repeat(64), operatorSha256: "c".repeat(64), qualifierSha256: "d".repeat(64) };
const approval = (overrides = {}) => {
  const authorizationText = buildAuthorizationText(bindings);
  return { schemaVersion: 1, kind: CONTINUATION.kind, decision: "APPROVE_CONTROLLED_VERCEL_BROWSER_NOTIFICATION_CONTINUATION", qualificationId: CONTINUATION.qualificationId, issuedAt: "2026-09-28T00:00:00.000Z", expiresAt: "2026-09-28T02:00:00.000Z", authorizationText, authorizationTextSha256: sha256(Buffer.from(authorizationText)), ...bindings, deploymentId: CONTINUATION.deploymentId, origin: CONTINUATION.origin, evidenceDirectory: CONTINUATION.evidenceDirectory, limits: CONTINUATION.limits, ...overrides };
};

test("exact comprehensive approval validates", () => assert.equal(validateApproval(approval(), { now: Date.parse("2026-09-28T01:00:00Z") }).qualificationId, CONTINUATION.qualificationId));
test("expired approval fails", () => assert.throws(() => validateApproval(approval(), { now: Date.parse("2026-09-28T02:00:00Z") }), /not currently valid/));
test("changed text, deployment, origin, limits, or evidence path fails", () => {
  for (const changed of [
    { authorizationText: approval().authorizationText + " changed" },
    { deploymentId: "wrong" }, { origin: "https://wrong.invalid" }, { evidenceDirectory: "secure/wrong" },
    { limits: { ...CONTINUATION.limits, foregroundFcmSends: 2 } },
  ]) assert.throws(() => validateApproval(approval(changed), { now: Date.parse("2026-09-28T01:00:00Z") }));
});
test("consumed or malformed authority cannot reach evidence reservation", () => {
  for (const qualificationId of ["restaurant-vercel-browser-notification-qualification-20260928d", "restaurant-vercel-browser-notification-qualification-20260928e", "restaurant-vercel-browser-notification-qualification-20260928f", "restaurant-vercel-browser-notification-qualification-20260928g", "restaurant-vercel-browser-notification-qualification-20260928h"]) assert.throws(() => validateApproval(approval({ qualificationId }), { now: Date.parse("2026-09-28T01:00:00Z") }), /Exact continuation approval/);
  assert.throws(() => validateApproval({ ...approval(), unexpected: true }, { now: Date.parse("2026-09-28T01:00:00Z") }), /fields differ/);
});

test("fresh continuation consumes the immutable passing Firebase inspection without another GET", () => {
  const verified = verifyCompletedFirebaseInspection(path.resolve(import.meta.dirname, ".."));
  assert.deepEqual(verified, { passed: true, inspectionId: "restaurant-vercel-firebase-domain-inspection-20260928b", configProjectIdentifierType: "PROJECT_NUMBER", requiredDomainPresent: true, evidenceManifestSha256: "1f3b1d05a466c01c3ef4ffb5b3592a57b99616c07ffa30524431f9ae702af7b7" });
  assert.match(buildAuthorizationText(bindings), /without repeating either inspection/);
});

test("fresh continuation consumes the completed Vercel project/protection inspection", () => {
  const verified = verifyCompletedVercelInspection(path.resolve(import.meta.dirname, ".."));
  assert.deepEqual(verified, { passed: true, inspectionId: "restaurant-vercel-project-protection-inspection-20260928a", targetNullReviewed: true, evidenceManifestSha256: "850a3ca589c061cc9127902e2eb42bc980e1f4d56406a3c3216e1edc54bab838" });
  assert.match(buildAuthorizationText(bindings), /without repeating either inspection/);
});

test("authorization explicitly prohibits the obsolete preliminary bypass inventory GET", () => {
  const text = buildAuthorizationText(bindings);
  assert.match(text, /no preliminary Protection Bypass inventory GET is authorized/);
  assert.match(text, /exactly one documented project GET to independently verify revocation/);
});

test("altered completed Vercel inspection evidence fails closed", t => {
  const sourceRoot = path.resolve(import.meta.dirname, ".."), fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vercel-inspection-binding-"));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const authorityRoot = "secure/restaurant-vercel-project-protection-inspection-authority", evidenceRoot = `secure/restaurant-vercel-project-protection-inspection/${CONTINUATION.vercelInspection.id}`;
  for (const relative of [`${authorityRoot}/${CONTINUATION.vercelInspection.id}.json`, `${authorityRoot}/${CONTINUATION.vercelInspection.id}-source-manifest.tsv`, `${evidenceRoot}/evidence-manifest.tsv`, `${evidenceRoot}/inspection.json`, `${evidenceRoot}/terminal-result.json`]) {
    fs.mkdirSync(path.dirname(path.join(fixtureRoot, relative)), { recursive: true }); fs.copyFileSync(path.join(sourceRoot, relative), path.join(fixtureRoot, relative));
  }
  assert.equal(verifyCompletedVercelInspection(fixtureRoot).targetNullReviewed, true);
  fs.appendFileSync(path.join(fixtureRoot, evidenceRoot, "inspection.json"), " ");
  assert.throws(() => verifyCompletedVercelInspection(fixtureRoot), error => error.code === "EVIDENCE_INTEGRITY");
});

const reviewedVercelInspection = () => ({ passed: true, inspectionId: CONTINUATION.vercelInspection.id, targetNullReviewed: true, evidenceManifestSha256: CONTINUATION.vercelInspection.evidenceManifestSha256 });
const vercelProject = (overrides = {}) => ({ id: CONTINUATION.projectId, name: CONTINUATION.projectName, accountId: "team_799flI3SHCD8C2AXbbQ6NlBX", enablePreviewFeedback: false, ssoProtection: { deploymentType: "all_except_custom_domains" }, protectionBypass: { existing: { note: "unrelated" } }, ...overrides });
const vercelDeployment = (overrides = {}) => ({ id: CONTINUATION.deploymentId, name: CONTINUATION.projectName, projectId: CONTINUATION.projectId, target: "preview", readyState: "READY", url: new URL(CONTINUATION.origin).hostname, ...overrides });

test("literal Preview and the exact inspection-backed null representation pass", () => {
  assert.equal(validateVercelQualificationPreflight({ projectResponse: vercelProject(), deploymentResponse: vercelDeployment(), requestedScope: CONTINUATION.scope, reviewedInspection: reviewedVercelInspection() }).targetRepresentation, "LITERAL_PREVIEW");
  assert.equal(validateVercelQualificationPreflight({ projectResponse: vercelProject(), deploymentResponse: vercelDeployment({ target: null }), requestedScope: CONTINUATION.scope, reviewedInspection: reviewedVercelInspection() }).targetRepresentation, "REVIEWED_NULL_PREVIEW");
});

test("inspection-backed null is not generalized to another deployment identity", () => {
  const failures = [
    [vercelDeployment({ target: "production" }), vercelProject(), CONTINUATION.scope],
    [vercelDeployment({ target: "staging" }), vercelProject(), CONTINUATION.scope],
    [vercelDeployment({ target: null, id: "dpl_wrong" }), vercelProject(), CONTINUATION.scope],
    [vercelDeployment({ target: null, url: "wrong.vercel.app" }), vercelProject(), CONTINUATION.scope],
    [vercelDeployment({ target: null, projectId: "prj_wrong" }), vercelProject(), CONTINUATION.scope],
    [vercelDeployment({ target: null }), vercelProject({ accountId: "team_wrong" }), CONTINUATION.scope],
    [vercelDeployment({ target: null, readyState: "ERROR" }), vercelProject(), CONTINUATION.scope],
    [vercelDeployment({ target: null, environment: "production" }), vercelProject(), CONTINUATION.scope],
    [vercelDeployment({ target: null }), vercelProject(), "wrong-scope"],
  ];
  for (const [deploymentResponse, projectResponse, requestedScope] of failures) assert.throws(() => validateVercelQualificationPreflight({ projectResponse, deploymentResponse, requestedScope, reviewedInspection: reviewedVercelInspection() }), error => error.code === "IDENTITY");
  assert.throws(() => validateVercelQualificationPreflight({ projectResponse: vercelProject(), deploymentResponse: vercelDeployment({ target: null }), requestedScope: CONTINUATION.scope, reviewedInspection: null }), /not the exact reviewed/);
});

test("malformed, missing, unsafe protection, and ambiguous responses fail closed", () => {
  for (const fixture of [
    { projectResponse: null, deploymentResponse: vercelDeployment() },
    { projectResponse: vercelProject(), deploymentResponse: [] },
    { projectResponse: vercelProject({ id: undefined }), deploymentResponse: vercelDeployment() },
    { projectResponse: vercelProject({ ssoProtection: undefined }), deploymentResponse: vercelDeployment() },
    { projectResponse: vercelProject({ protectionBypass: [] }), deploymentResponse: vercelDeployment() },
    { projectResponse: vercelProject(), deploymentResponse: vercelDeployment({ projectId: undefined }) },
  ]) assert.throws(() => validateVercelQualificationPreflight({ ...fixture, requestedScope: CONTINUATION.scope, reviewedInspection: reviewedVercelInspection() }), error => error.code === "IDENTITY");
});

test("the complete preflight persists the sanitized current deployment inspection and proceeds", async () => {
  const inspection = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../secure/restaurant-vercel-project-protection-inspection/restaurant-vercel-project-protection-inspection-20260928a/inspection.json"), "utf8"));
  inspection.deployment = vercelDeployment();
  const persisted = [];
  const result = await runVercelQualificationPreflight({ projectResponse: inspection.project, deploymentResponse: inspection.deployment, requestedScope: CONTINUATION.scope, reviewedInspection: reviewedVercelInspection(), persist: async evidence => persisted.push(evidence) });
  assert.equal(result.status, "PASS"); assert.equal(result.targetRepresentation, "LITERAL_PREVIEW"); assert.equal(persisted.length, 1); assert.equal(persisted[0].productionEvidence, false);
  assert.equal(JSON.stringify(persisted).includes("protectionBypass"), false);
});

test("full preflight persists a sanitized failure before throwing", async () => {
  const persisted = [];
  await assert.rejects(runVercelQualificationPreflight({ projectResponse: vercelProject(), deploymentResponse: vercelDeployment({ target: "production" }), requestedScope: CONTINUATION.scope, reviewedInspection: reviewedVercelInspection(), persist: async evidence => persisted.push(evidence) }), /exact reviewed Preview/);
  assert.equal(persisted.length, 1); assert.equal(persisted[0].classification, "IDENTITY"); assert.equal(persisted[0].credentialsPersisted, false); assert.equal(persisted[0].rawBodiesPersisted, false);
});

test("altered completed Firebase inspection evidence fails closed", t => {
  const sourceRoot = path.resolve(import.meta.dirname, ".."), fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-inspection-binding-"));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const authorityRoot = "secure/restaurant-vercel-firebase-domain-inspection-authority", evidenceRoot = `secure/restaurant-vercel-firebase-domain-inspection/${CONTINUATION.firebaseInspection.id}`;
  for (const relative of [`${authorityRoot}/${CONTINUATION.firebaseInspection.id}.json`, `${authorityRoot}/${CONTINUATION.firebaseInspection.id}-source-manifest.tsv`, `${evidenceRoot}/evidence-manifest.tsv`, `${evidenceRoot}/firebase-authorized-domain-inspection.json`, `${evidenceRoot}/terminal-result.json`]) {
    fs.mkdirSync(path.dirname(path.join(fixtureRoot, relative)), { recursive: true }); fs.copyFileSync(path.join(sourceRoot, relative), path.join(fixtureRoot, relative));
  }
  assert.equal(verifyCompletedFirebaseInspection(fixtureRoot).passed, true);
  fs.appendFileSync(path.join(fixtureRoot, evidenceRoot, "terminal-result.json"), " ");
  assert.throws(() => verifyCompletedFirebaseInspection(fixtureRoot), error => error.code === "EVIDENCE_INTEGRITY");
});
test("safety errors are distinct from ordinary qualification failures", () => {
  assert.equal(classifySafetyError(Object.assign(new Error(), { code: "UNEXPECTED_ORIGIN" })), true);
  assert.equal(classifySafetyError(Object.assign(new Error(), { code: "HTTP_429" })), false);
});

const firebaseConfig = (overrides = {}) => ({ name: `projects/${CONTINUATION.firebaseProjectId}/config`, authorizedDomains: [...EXPECTED_FIREBASE_AUTHORIZED_DOMAINS], ...overrides });

test("Firebase authorized-domain inspection uses the exact documented read-only request contract", () => {
  assert.deepEqual(buildFirebaseAuthorizedDomainInspectionRequest(), {
    method: "GET", url: FIREBASE_AUTH_CONFIG_URL, scope: FIREBASE_AUTH_CONFIG_SCOPE, projectId: CONTINUATION.firebaseProjectId, requestBody: null,
  });
  assert.equal(FIREBASE_AUTH_CONFIG_SCOPE, "https://www.googleapis.com/auth/identitytoolkit");
});

test("Firebase authorized-domain response accepts only the exact baseline with optional Preview hostname", () => {
  const pass = validateFirebaseAuthorizedDomainResponse({ status: 200, data: firebaseConfig() });
  assert.equal(pass.status, "PASS"); assert.equal(pass.authorizedDomainCount, 5); assert.equal(pass.requiredDomainPresent, true); assert.equal(pass.domainState, "AUTHORIZED_DOMAIN_PRESENT");
  const absent = validateFirebaseAuthorizedDomainResponse({ status: 200, data: firebaseConfig({ authorizedDomains: [...BASELINE_FIREBASE_AUTHORIZED_DOMAINS] }) });
  assert.equal(absent.status, "PASS"); assert.equal(absent.authorizedDomainCount, 4); assert.equal(absent.requiredDomainPresent, false); assert.equal(absent.domainState, "AUTHORIZED_DOMAIN_ABSENT");
  assert.equal(validateFirebaseAuthorizedDomainResponse({ status: 200, data: firebaseConfig({ name: "projects/wrong/config" }) }).failureKind, "PROJECT_SELECTION");
  assert.equal(validateFirebaseAuthorizedDomainResponse({ status: 200, data: firebaseConfig({ authorizedDomains: ["unexpected.example"] }) }).failureKind, "AUTHORIZED_DOMAIN_STATE_UNEXPECTED");
  assert.equal(validateFirebaseAuthorizedDomainResponse({ status: 200, data: firebaseConfig({ authorizedDomains: [...EXPECTED_FIREBASE_AUTHORIZED_DOMAINS, EXPECTED_FIREBASE_AUTHORIZED_DOMAINS[0]] }) }).failureKind, "RESPONSE_SCHEMA");
  assert.equal(validateFirebaseAuthorizedDomainResponse({ status: 200, data: { authorizedDomains: EXPECTED_FIREBASE_AUTHORIZED_DOMAINS } }).failureKind, "RESPONSE_SCHEMA");
});

test("Firebase Config identity accepts only the trusted textual ID or canonical project number", () => {
  assert.equal(validateFirebaseConfigResourceName(`projects/${CONTINUATION.firebaseProjectId}/config`).configProjectIdentifierType, "PROJECT_ID");
  assert.equal(validateFirebaseConfigResourceName(`projects/${CONTINUATION.firebaseProjectNumber}/config`).configProjectIdentifierType, "PROJECT_NUMBER");
  for (const name of ["projects/wrong-project/config", "projects/999999999999/config"]) assert.equal(validateFirebaseConfigResourceName(name).failureKind, "PROJECT_SELECTION");
  for (const name of [undefined, "", `projects/${CONTINUATION.firebaseProjectId}`, `projects/${CONTINUATION.firebaseProjectId}/config/extra`, `projects//config`]) assert.equal(validateFirebaseConfigResourceName(name).failureKind, "RESPONSE_SCHEMA");
  assert.equal(validateFirebaseConfigResourceName(`projects/${CONTINUATION.firebaseProjectNumber}/config`, { ...FIREBASE_PROJECT_IDENTITY, projectNumber: "999999999999" }).failureKind, "PROJECT_SELECTION");
  assert.equal(validateTrustedFirebaseProjectIdentity({ ...FIREBASE_PROJECT_IDENTITY, firebaseAppId: "1:999999999999:web:bad" }), null);
});

test("consumed HTTP-200 numeric-name fixture reaches authorized-domain validation", () => {
  const present = validateFirebaseAuthorizedDomainResponse({ status: 200, data: firebaseConfig({ name: `projects/${CONTINUATION.firebaseProjectNumber}/config` }) });
  assert.equal(present.status, "PASS"); assert.equal(present.configProjectIdentifierType, "PROJECT_NUMBER"); assert.equal(present.domainState, "AUTHORIZED_DOMAIN_PRESENT");
  const absent = validateFirebaseAuthorizedDomainResponse({ status: 200, data: firebaseConfig({ name: `projects/${CONTINUATION.firebaseProjectNumber}/config`, authorizedDomains: BASELINE_FIREBASE_AUTHORIZED_DOMAINS }) });
  assert.equal(absent.status, "PASS"); assert.equal(absent.domainState, "AUTHORIZED_DOMAIN_ABSENT");
  assert.equal(validateFirebaseAuthorizedDomainResponse({ status: 200, data: { name: `projects/${CONTINUATION.firebaseProjectNumber}/config` } }).failureKind, "RESPONSE_SCHEMA");
});

test("Firebase inspection distinguishes authentication, permission, HTTP, schema, and transport failures without persisting bodies", async () => {
  const forbidden = await inspectFirebaseAuthorizedDomains({ transport: async () => { const error = new Error("request rejected with bearer abc"); error.response = { status: 403, data: { error: { status: "PERMISSION_DENIED", message: `denied ${"x".repeat(100)}` } } }; throw error; } });
  assert.equal(forbidden.failureKind, "PERMISSION_FAILURE"); assert.equal(forbidden.httpStatus, 403); assert.equal(forbidden.providerCode, "PERMISSION_DENIED"); assert.equal(forbidden.responseBodyPersisted, false); assert.equal("providerMessage" in forbidden, false); assert.equal(forbidden.providerMessageBytes, 107); assert.match(forbidden.providerMessageSha256, /^[a-f0-9]{64}$/);
  assert.equal((await inspectFirebaseAuthorizedDomains({ transport: async () => ({ status: 401, data: {} }) })).failureKind, "AUTHENTICATION_FAILURE");
  assert.equal((await inspectFirebaseAuthorizedDomains({ transport: async () => ({ status: 500, data: {} }) })).failureKind, "HTTP_OR_PROVIDER_FAILURE");
  assert.equal((await inspectFirebaseAuthorizedDomains({ transport: async () => ({ status: 200, data: [] }) })).failureKind, "RESPONSE_SCHEMA");
  assert.equal((await inspectFirebaseAuthorizedDomains({ transport: async () => { throw new Error("socket closed"); } })).failureKind, "TRANSPORT_FAILURE");
});

test("Firebase preflight persists sanitized evidence before failing", async () => {
  const persisted = [];
  await assert.rejects(runFirebaseAuthorizedDomainPreflight({ transport: async () => ({ status: 200, data: firebaseConfig({ authorizedDomains: [] }) }), persist: async evidence => persisted.push(evidence) }), /AUTHORIZED_DOMAIN_STATE_UNEXPECTED/);
  assert.equal(persisted.length, 1); assert.equal(persisted[0].failureKind, "AUTHORIZED_DOMAIN_STATE_UNEXPECTED"); assert.equal(persisted[0].responseBodyPersisted, false);
});

test("Firebase transport pins service-account identity, OAuth scope, GET endpoint, and response adapter", async () => {
  let options, request;
  class GoogleAuthFixture { constructor(value) { options = value; } async request(value) { request = value; return { status: 200, data: firebaseConfig(), headers: { "content-type": "application/json" } }; } }
  const credentials = { type: "service_account", project_id: CONTINUATION.firebaseProjectId, client_email: "fixture@hungrieapp-a2288.iam.gserviceaccount.com", private_key: "fixture-private-key" };
  const transport = createFirebaseAuthorizedDomainTransport({ GoogleAuth: GoogleAuthFixture, credentials });
  const response = await transport(buildFirebaseAuthorizedDomainInspectionRequest());
  assert.deepEqual(options.scopes, [FIREBASE_AUTH_CONFIG_SCOPE]); assert.equal(options.credentials, credentials);
  assert.deepEqual(request, { url: FIREBASE_AUTH_CONFIG_URL, method: "GET", responseType: "json" }); assert.equal(response.status, 200);
  await assert.rejects(transport({ ...buildFirebaseAuthorizedDomainInspectionRequest(), method: "PATCH" }), /read-only contract/);
  assert.throws(() => createFirebaseAuthorizedDomainTransport({ GoogleAuth: GoogleAuthFixture, credentials: { ...credentials, project_id: "wrong" } }), /identity is invalid/);
});

test("bypass generation is cryptographically sourced as exactly 32 lowercase hex characters", () => {
  const supplied = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  const generated = generateBypassSecret(length => { assert.equal(length, 16); return supplied; });
  assert.equal(generated, supplied.toString("hex")); assert.match(generated, /^[a-f0-9]{32}$/);
});

test("generated bypass secrets are independently random without an undocumented preliminary inventory GET", () => {
  const first = generateBypassSecret(() => Buffer.alloc(16, 1));
  const second = generateBypassSecret(() => Buffer.alloc(16, 2));
  assert.notEqual(first, second);
  assert.equal(CONTINUATION.limits.preliminaryBypassInventoryGets, 0);
});

test("the consumed 64-character secret is rejected before request construction", () => {
  assert.throws(() => validateBypassSecret("ab".repeat(32)), /exactly 32/);
  assert.throws(() => buildBypassApiRequest({ action: "generate", secret: "ab".repeat(32) }), /exactly 32/);
  assert.throws(() => validateBypassSecret("_".repeat(32)), /exactly 32/);
});

test("creation and revocation requests use the exact project, PATCH method, scope, and schema", () => {
  const secret = "ab".repeat(16), create = buildBypassApiRequest({ action: "generate", secret }), revoke = buildBypassApiRequest({ action: "revoke", secret });
  assert.deepEqual(create, { endpoint: `/v1/projects/${CONTINUATION.projectId}/protection-bypass`, method: "PATCH", scope: CONTINUATION.scope, body: { generate: { secret, note: CONTINUATION.qualificationId } } });
  assert.deepEqual(revoke, { endpoint: `/v1/projects/${CONTINUATION.projectId}/protection-bypass`, method: "PATCH", scope: CONTINUATION.scope, body: { revoke: { secret, regenerate: false } } });
  assert.deepEqual(buildPostRevokeProjectVerificationRequest(), { endpoint: `/v9/projects/${CONTINUATION.projectId}`, method: "GET", scope: CONTINUATION.scope, body: null });
  assert.deepEqual(verifyBypassApiResponse({ protectionBypass: { baseline: {}, [secret]: { note: CONTINUATION.qualificationId } } }, { secret, expectedPresent: true }), { passed: true, present: true, inventoryCount: 2, secretSha256: sha256(Buffer.from(secret)), secretPersisted: false });
  assert.equal(verifyBypassApiResponse({ protectionBypass: { baseline: {} } }, { secret, expectedPresent: false }).present, false);
  assert.throws(() => verifyBypassApiResponse({ protectionBypass: [] }, { secret, expectedPresent: true }), /shape/);
  assert.throws(() => verifyBypassApiResponse({ protectionBypass: { [secret]: { note: "another-qualification" } } }, { secret, expectedPresent: true }), /ownership/);
});

test("post-revocation project read verifies identity, protection, absence, and unrelated records", () => {
  const secret = "ab".repeat(16), unrelated = "cd".repeat(16);
  const createdInventory = { [unrelated]: { note: "unrelated" }, [secret]: { note: CONTINUATION.qualificationId } };
  const revokedInventory = { [unrelated]: { note: "unrelated" } };
  const payload = vercelProject({ protectionBypass: revokedInventory });
  assert.deepEqual(verifyPostRevokeProjectResponse(payload, { secret, createdInventory, revokedInventory }), { passed: true, projectId: CONTINUATION.projectId, accountId: CONTINUATION.teamId, protectionType: "all_except_custom_domains", previewToolbar: false, preservedRecords: 1, removedSecretSha256: sha256(Buffer.from(secret)), secretPersisted: false, rawResponsePersisted: false });
  assert.throws(() => verifyPostRevokeProjectResponse(vercelProject({ accountId: "wrong", protectionBypass: revokedInventory }), { secret, createdInventory, revokedInventory }), /identity mismatch/);
  assert.throws(() => verifyPostRevokeProjectResponse(vercelProject({ protectionBypass: {} }), { secret, createdInventory, revokedInventory }), /does not match/);
  assert.throws(() => verifyPostRevokeProjectResponse(vercelProject({ protectionBypass: [] }), { secret, createdInventory, revokedInventory }), /malformed/);
});

const validBootstrapHeaders = () => ({ location: "/", "set-cookie": "_vercel_jwt=header.payload.signature_value_1234567890; Path=/; Secure; HttpOnly; SameSite=Lax" });

test("documented HTTP 302 bootstrap validates cookie, redirect, and follow-up request", () => {
  const bootstrap = validateProtectedBootstrapResponse({ requestUrl: `${CONTINUATION.origin}/`, status: 302, headers: validBootstrapHeaders() });
  assert.equal(bootstrap.redirectUrl, `${CONTINUATION.origin}/`);
  const follow = buildProtectedRedirectRequest(bootstrap);
  assert.deepEqual(follow, { url: `${CONTINUATION.origin}/`, method: "GET", headers: { Cookie: `_vercel_jwt=${bootstrap.cookie.value}`, "x-vercel-skip-toolbar": "1" }, redirect: "manual" });
  const evidence = sanitizeProtectedBootstrapEvidence(bootstrap);
  assert.equal(evidence.cookieValueBytes, Buffer.byteLength(bootstrap.cookie.value));
  assert.equal(evidence.credentialValuePersisted, false);
  assert.equal(JSON.stringify(evidence).includes(bootstrap.cookie.value), false);
  assert.equal(sanitizeContinuationError(new Error(`_vercel_jwt=${bootstrap.cookie.value} x-vercel-protection-bypass=${"ab".repeat(16)}`)).includes(bootstrap.cookie.value), false);
});

test("documented same-origin cookie-control redirect is accepted without exposing the bypass secret", () => {
  const bootstrap = validateProtectedBootstrapResponse({ requestUrl: `${CONTINUATION.origin}/`, status: 302, headers: { ...validBootstrapHeaders(), location: "/?x-vercel-set-bypass-cookie=true" } });
  assert.equal(bootstrap.redirectUrl, `${CONTINUATION.origin}/?x-vercel-set-bypass-cookie=true`);
});

test("bootstrap rejects missing cookies, HTTP 200, unexpected redirects, and malformed cookies", () => {
  const requestUrl = `${CONTINUATION.origin}/`;
  for (const fixture of [
    { status: 302, headers: { location: "/" }, pattern: /exactly one/ },
    { status: 200, headers: validBootstrapHeaders(), pattern: /HTTP 302/ },
    { status: 302, headers: { ...validBootstrapHeaders(), location: "https://firebase.googleapis.com/" }, pattern: /origin mismatch/ },
    { status: 302, headers: { ...validBootstrapHeaders(), location: "/?x-vercel-protection-bypass=leak" }, pattern: /bypass secret/ },
    { status: 302, headers: { ...validBootstrapHeaders(), location: "/?x-vercel-set-bypass-cookie=false" }, pattern: /cookie-control/ },
    { status: 302, headers: { ...validBootstrapHeaders(), location: "/?other=value" }, pattern: /cookie-control/ },
    { status: 302, headers: { location: "/", "set-cookie": "_vercel_jwt=short; Path=/; Secure; HttpOnly; SameSite=Lax" }, pattern: /malformed/ },
    { status: 302, headers: { location: ["/", "/dashboard"], "set-cookie": validBootstrapHeaders()["set-cookie"] }, pattern: /unambiguous/ },
  ]) assert.throws(() => validateProtectedBootstrapResponse({ requestUrl, ...fixture }), fixture.pattern);
});

test("revocation removes only the qualification-specific bypass", () => {
  const secret = "ab".repeat(16), baseline = { ["cd".repeat(16)]: { note: "unrelated", isEnvVar: true } }, before = { ...baseline, [secret]: { note: CONTINUATION.qualificationId, isEnvVar: false } };
  assert.deepEqual(verifyBypassInventoryTransition({ before, after: baseline, secret }), { passed: true, removedSecretSha256: sha256(Buffer.from(secret)), preservedRecords: 1, secretPersisted: false });
  assert.throws(() => verifyBypassInventoryTransition({ before, after: {}, secret }), /unrelated/);
  assert.throws(() => verifyBypassInventoryTransition({ before, after: before, secret }), /cleanup state/);
});

test("bootstrap contains the credential only for the exact origin and evidence errors redact it", () => {
  const secret = "cd".repeat(16), bootstrap = buildProtectedBrowserBootstrap(secret);
  assert.equal(bootstrap.url, `${CONTINUATION.origin}/`); assert.equal(bootstrap.method, "GET"); assert.equal(bootstrap.redirect, "manual");
  assert.equal(bootstrap.headers["x-vercel-protection-bypass"], secret); assert.equal(bootstrap.headers["x-vercel-set-bypass-cookie"], "true"); assert.equal(bootstrap.headers["x-vercel-skip-toolbar"], "1");
  assert.equal(sanitizeContinuationError(new Error(`failed ${secret}`)).includes(secret), false);
});

test("post-bootstrap requests cannot forward credentials and toolbar suppression remains document scoped", () => {
  assert.equal(validateProtectedBrowserRequest({ url: `${CONTINUATION.origin}/orders`, resourceType: "Document", headerNames: ["x-vercel-skip-toolbar"] }).toolbar, true);
  for (const [url, resourceType] of [["https://identitytoolkit.googleapis.com/v1/accounts", "Document"], [`${CONTINUATION.origin}/app.js`, "Script"]]) assert.throws(() => validateProtectedBrowserRequest({ url, resourceType, headerNames: ["x-vercel-skip-toolbar"] }));
  assert.throws(() => validateProtectedBrowserRequest({ url: "https://project.supabase.co/rest", resourceType: "XHR", headerNames: ["x-vercel-protection-bypass"] }), error => error.code === "CREDENTIAL_EXPOSURE");
});

test("owner notification context waits for authentication then explicitly opens operational settings", async () => {
  let observations = 0, navigated = null;
  const result = await establishOwnerNotificationRoute({
    origin: CONTINUATION.origin,
    cdp: { send: async (method, params) => { assert.equal(method, "Page.navigate"); navigated = params.url; return { frameId: "owner-frame", loaderId: "settings-loader" }; } },
    evaluate: async expression => expression.startsWith("({path:")
      ? (++observations < 2 ? { path: "/login", operational: false, loginFormVisible: true } : { path: "/dashboard", operational: true, loginFormVisible: false })
      : true,
    attempts: 3,
    intervalMs: 0,
    sleep: async () => {},
  });
  assert.equal(navigated, `${CONTINUATION.origin}/settings`);
  assert.equal(result.status, "PASS");
  assert.equal(result.requestedPath, "/settings");
});

test("owner notification context fails closed when authentication or settings readiness is absent", async () => {
  await assert.rejects(() => establishOwnerNotificationRoute({ origin: CONTINUATION.origin, cdp: { send: async () => ({}) }, evaluate: async () => ({ operational: false, loginFormVisible: true }), attempts: 2, intervalMs: 0, sleep: async () => {} }), /authenticated operational session/);
  await assert.rejects(() => establishOwnerNotificationRoute({ origin: CONTINUATION.origin, cdp: { send: async () => ({}) }, evaluate: async expression => expression.startsWith("({path:") ? { operational: true, loginFormVisible: false } : false, attempts: 2, intervalMs: 0, sleep: async () => {} }), /settings route/);
});

function operations(overrides = {}) {
  const calls = [];
  const op = {
    calls,
    verifyPrerequisites: async () => calls.push("verify"), createBypass: async () => calls.push("create-bypass"), awaitBypassPropagation: async () => calls.push("await-bypass-propagation"), bootstrapProtectedBrowser: async () => calls.push("bootstrap"),
    verifyParityEvidence: async () => calls.push("parity"),
    qualifyAccounts: async () => (calls.push("accounts"), { pending: "PASS", suspended: "PASS", owner: "PASS", manager: "PASS" }),
    verifyServiceWorker: async () => (calls.push("worker"), true), openOwnerNotificationContext: async () => (calls.push("open"), { id: 1 }),
    registerToken: async () => calls.push("register"), sendForeground: async () => calls.push("foreground"), sendBackground: async () => calls.push("background"),
    verifyRealClick: async () => (calls.push("click"), true), reconcileTokenRegistration: async () => (calls.push("reconcile-token"), false), unregisterToken: async () => calls.push("unregister"), closeBrowser: async () => calls.push("close"), reconcileBypassCreation: async () => (calls.push("reconcile-create"), false), revokeBypass: async () => calls.push("revoke"), verifyBypassRevoked: async () => calls.push("verify-revoked"),
    ...overrides,
  };
  return op;
}

function reservationFixture(t) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vercel-qualification-reservation-"));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const evidenceDirectory = path.join(repoRoot, CONTINUATION.evidenceDirectory);
  const prepared = { approval: { sourceCommit: "a".repeat(40), sourceManifestSha256: "b".repeat(64) }, authoritySha256: "c".repeat(64), paths: { evidenceDirectory } };
  return { repoRoot, evidenceDirectory, prepared, validatePrepared: () => prepared };
}

test("qualification D ordering defect is reproduced deterministically", t => {
  const fixture = reservationFixture(t), calls = [];
  fs.mkdirSync(fixture.evidenceDirectory, { recursive: true }); calls.push("create-evidence");
  const checkpointedValidator = () => { calls.push("validate-exclusive-path"); if (fs.existsSync(fixture.evidenceDirectory)) throw new Error("Exclusive continuation path already exists."); };
  assert.throws(checkpointedValidator, /already exists/);
  assert.deepEqual(calls, ["create-evidence", "validate-exclusive-path"]);
});

test("prepared authority validates before the absent path is atomically reserved", t => {
  const fixture = reservationFixture(t), calls = [];
  const reserved = reserveQualificationEvidence({ repoRoot: fixture.repoRoot, now: Date.parse("2026-09-28T01:00:00Z"), randomBytes: () => Buffer.alloc(32, 1), validatePrepared: () => { calls.push(fs.existsSync(fixture.evidenceDirectory) ? "path-present" : "path-absent"); return fixture.prepared; } });
  assert.deepEqual(calls, ["path-absent"]);
  assert.equal(fs.existsSync(path.join(fixture.evidenceDirectory, "evidence-reservation.json")), true);
  assert.equal(verifyEvidenceReservation({ evidenceDirectory: fixture.evidenceDirectory, reservationToken: reserved.reservationToken }).qualificationId, CONTINUATION.qualificationId);
  assert.throws(() => verifyEvidenceReservation({ evidenceDirectory: fixture.evidenceDirectory, reservationToken: "wrong" }), /identity mismatch/);
});

test("pre-existing and simultaneous reservations fail closed", t => {
  const first = reservationFixture(t); fs.mkdirSync(first.evidenceDirectory, { recursive: true });
  assert.throws(() => reserveQualificationEvidence({ repoRoot: first.repoRoot, validatePrepared: first.validatePrepared }), error => error.code === "EVIDENCE_INTEGRITY");
  const second = reservationFixture(t);
  reserveQualificationEvidence({ repoRoot: second.repoRoot, randomBytes: () => Buffer.alloc(32, 2), validatePrepared: second.validatePrepared });
  assert.throws(() => reserveQualificationEvidence({ repoRoot: second.repoRoot, randomBytes: () => Buffer.alloc(32, 3), validatePrepared: second.validatePrepared }), error => error.code === "EVIDENCE_INTEGRITY");
});

test("interruption before reservation creates no path", t => {
  const fixture = reservationFixture(t);
  assert.throws(() => reserveQualificationEvidence({ repoRoot: fixture.repoRoot, validatePrepared: () => { throw Object.assign(new Error("interrupted"), { code: "AUTHORIZATION" }); } }), /interrupted/);
  assert.equal(fs.existsSync(fixture.evidenceDirectory), false);
});

test("reserved evidence finalization is integrity-bound and idempotent", t => {
  const fixture = reservationFixture(t), reserved = reserveQualificationEvidence({ repoRoot: fixture.repoRoot, randomBytes: () => Buffer.alloc(32, 4), validatePrepared: fixture.validatePrepared });
  persistReservedEvidence({ evidenceDirectory: fixture.evidenceDirectory, reservationToken: reserved.reservationToken, name: "progress.json", value: { classification: "STARTED" } });
  const terminal = { classification: "ABORTED", reason: "INTERRUPTED", retryEligible: false };
  const first = finalizeQualificationEvidence({ evidenceDirectory: fixture.evidenceDirectory, reservationToken: reserved.reservationToken, terminal });
  const repeated = finalizeQualificationEvidence({ evidenceDirectory: fixture.evidenceDirectory, reservationToken: reserved.reservationToken, terminal });
  assert.equal(first.repeated, false); assert.equal(repeated.repeated, true); assert.equal(first.manifestSha256, repeated.manifestSha256);
  assert.throws(() => finalizeQualificationEvidence({ evidenceDirectory: fixture.evidenceDirectory, reservationToken: reserved.reservationToken, terminal: { ...terminal, reason: "CHANGED" } }), /different content/);
});

test("complete workflow passes and always cleans token, browser, and bypass", async () => {
  const op = operations(), result = await executeControlledContinuation({ operations: op });
  assert.equal(result.classification, "PASS");
  assert.deepEqual(op.calls, ["verify", "create-bypass", "await-bypass-propagation", "bootstrap", "parity", "accounts", "worker", "open", "register", "foreground", "background", "click", "unregister", "close", "revoke", "verify-revoked"]);
});

test("complete no-network lifecycle uses the reviewed API and browser contracts", async () => {
  const secret = generateBypassSecret(() => Buffer.from("0123456789abcdeffedcba9876543210", "hex"));
  const inventory = { "00000000000000000000000000000000": { note: "unrelated" } };
  const createdInventory = { ...inventory, [secret]: { note: CONTINUATION.qualificationId } };
  const requests = [], bootstrapResponse = validateProtectedBootstrapResponse({ requestUrl: `${CONTINUATION.origin}/`, status: 302, headers: validBootstrapHeaders() });
  const op = operations({
    createBypass: async () => {
      const request = buildBypassApiRequest({ action: "generate", secret }); requests.push(request);
      verifyBypassApiResponse({ protectionBypass: createdInventory }, { secret, expectedPresent: true });
    },
    bootstrapProtectedBrowser: async () => {
      const request = buildProtectedBrowserBootstrap(secret); requests.push(request, buildProtectedRedirectRequest(bootstrapResponse));
      assert.equal(new URL(request.url).origin, CONTINUATION.origin);
    },
    revokeBypass: async () => requests.push(buildBypassApiRequest({ action: "revoke", secret })),
    verifyBypassRevoked: async () => {
      const request = buildPostRevokeProjectVerificationRequest(); requests.push(request);
      verifyBypassApiResponse({ protectionBypass: inventory }, { secret, expectedPresent: false });
      verifyPostRevokeProjectResponse(vercelProject({ protectionBypass: inventory }), { secret, createdInventory, revokedInventory: inventory });
    },
  });
  const result = await executeControlledContinuation({ operations: op });
  assert.equal(result.classification, "PASS");
  assert.equal(requests.length, 5);
  assert.equal(requests.filter(request => request.method === "PATCH").length, 2);
  assert.equal(requests.filter(request => request.method === "GET" && request.endpoint?.includes("/protection-bypass")).length, 0);
  assert.equal(requests.filter(request => request.endpoint === `/v9/projects/${CONTINUATION.projectId}`).length, 1);
  assert.equal(requests.filter(request => request.url === `${CONTINUATION.origin}/`).length, 2);
  assert.equal(JSON.stringify(result).includes(secret), false);
});
test("reserved no-network lifecycle covers bootstrap, four accounts, notifications, and cleanup", async t => {
  const fixture = reservationFixture(t), op = operations();
  const completed = await executeReservedQualification({ repoRoot: fixture.repoRoot, operations: op, now: Date.parse("2026-09-28T01:00:00Z"), randomBytes: () => Buffer.alloc(32, 5), validatePrepared: fixture.validatePrepared });
  assert.equal(completed.result.classification, "PASS");
  assert.deepEqual(op.calls, ["verify", "create-bypass", "await-bypass-propagation", "bootstrap", "parity", "accounts", "worker", "open", "register", "foreground", "background", "click", "unregister", "close", "revoke", "verify-revoked"]);
  assert.equal(fs.existsSync(path.join(fixture.evidenceDirectory, "evidence-reservation.json")), true);
  assert.equal(fs.existsSync(path.join(fixture.evidenceDirectory, "terminal-result.json")), true);
  assert.equal(fs.existsSync(path.join(fixture.evidenceDirectory, "evidence-manifest.tsv")), true);
});
test("post-reservation safety interruption persists terminal evidence", async t => {
  const fixture = reservationFixture(t), interruption = Object.assign(new Error("operator interrupted"), { code: "EVIDENCE_INTEGRITY" });
  const completed = await executeReservedQualification({ repoRoot: fixture.repoRoot, operations: operations({ verifyPrerequisites: async () => { throw interruption; } }), now: Date.parse("2026-09-28T01:00:00Z"), randomBytes: () => Buffer.alloc(32, 6), validatePrepared: fixture.validatePrepared });
  assert.equal(completed.result.classification, "ABORTED");
  const terminal = JSON.parse(fs.readFileSync(path.join(fixture.evidenceDirectory, "terminal-result.json"), "utf8"));
  assert.equal(terminal.classification, "ABORTED"); assert.equal(terminal.retryEligible, false);
  assert.equal(fs.existsSync(path.join(fixture.evidenceDirectory, "evidence-manifest.tsv")), true);
});
test("unsupported real click is inconclusive without weakening delivery requirements", async () => {
  const result = await executeControlledContinuation({ operations: operations({ verifyRealClick: async () => false }) });
  assert.equal(result.classification, "INCONCLUSIVE"); assert.equal(result.notifications.background, "PASS"); assert.equal(result.notifications.click, "NOT_EXECUTED");
});
test("ordinary account failure preserves exhaustive matrix and blocks notification mutations", async () => {
  const op = operations({ qualifyAccounts: async () => ({ pending: "PASS", suspended: "FAIL", owner: "PASS", manager: "PASS" }) });
  const result = await executeControlledContinuation({ operations: op });
  assert.equal(result.classification, "FAIL"); assert.equal(result.notifications.registration, "NOT_EXECUTED"); assert.equal(op.calls.includes("register"), false); assert.equal(op.calls.at(-1), "verify-revoked");
});
test("notification failure triggers scoped cleanup without retry", async () => {
  let sends = 0; const op = operations({ sendForeground: async () => { sends += 1; throw new Error("delivery failed"); } });
  const result = await executeControlledContinuation({ operations: op });
  assert.equal(result.classification, "FAIL"); assert.equal(sends, 1); assert.equal(result.cleanup.token, "PASS"); assert.equal(result.cleanup.bypass, "PASS");
});
test("uncertain token registration is reconciled and cleaned without retry", async () => {
  for (const present of [false, true]) {
    let registrations = 0, cleanups = 0;
    const op = operations({ registerToken: async () => { registrations += 1; throw new Error("registration response unavailable"); }, reconcileTokenRegistration: async () => present, unregisterToken: async () => { cleanups += 1; } });
    const result = await executeControlledContinuation({ operations: op });
    assert.equal(registrations, 1); assert.equal(cleanups, present ? 1 : 0);
    assert.equal(result.cleanup.tokenRegistrationReconciliation, present ? "PRESENT_REQUIRES_CLEANUP" : "ABSENT_VERIFIED");
    if (present) assert.equal(result.cleanup.token, "PASS");
  }
});
test("safety failure aborts and cleanup failure remains terminal", async () => {
  const error = Object.assign(new Error("origin mismatch"), { code: "UNEXPECTED_ORIGIN" });
  const result = await executeControlledContinuation({ operations: operations({ verifyParityEvidence: async () => { throw error; }, revokeBypass: async () => { throw new Error("cleanup failed"); } }) });
  assert.equal(result.classification, "ABORTED"); assert.equal(result.cleanup.bypass, "FAIL");
});

test("API rejection and interrupted or uncertain creation reconcile without retry", async () => {
  for (const present of [false, true]) {
    let creates = 0, revokes = 0;
    const op = operations({ createBypass: async () => { creates += 1; throw new Error("provider response unavailable"); }, reconcileBypassCreation: async () => present, revokeBypass: async () => { revokes += 1; }, verifyBypassRevoked: async () => {} });
    const result = await executeControlledContinuation({ operations: op });
    assert.equal(creates, 1); assert.equal(revokes, present ? 1 : 0); assert.equal(result.cleanup.creationReconciliation, present ? "PRESENT_REQUIRES_REVOCATION" : "ABSENT_VERIFIED");
  }
});

test("failed bootstrap and ordinary qualification failure both revoke and verify cleanup", async () => {
  for (const override of [{ bootstrapProtectedBrowser: async () => { throw new Error("bootstrap failed"); } }, { qualifyAccounts: async () => ({ pending: "FAIL", suspended: "PASS", owner: "PASS", manager: "PASS" }) }]) {
    const op = operations(override), result = await executeControlledContinuation({ operations: op });
    assert.equal(result.classification, "FAIL"); assert.equal(op.calls.includes("revoke"), true); assert.equal(op.calls.includes("verify-revoked"), true);
  }
});

test("revocation verification failure is terminal ABORTED", async () => {
  const result = await executeControlledContinuation({ operations: operations({ verifyBypassRevoked: async () => { throw new Error("still present"); } }) });
  assert.equal(result.classification, "ABORTED"); assert.equal(result.cleanup.bypass, "FAIL");
});
