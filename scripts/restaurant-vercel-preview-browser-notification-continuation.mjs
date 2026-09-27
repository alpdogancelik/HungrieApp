#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const CONTINUATION = Object.freeze({
  schemaVersion: 1,
  kind: "restaurant_vercel_preview_browser_notification_continuation",
  qualificationId: "restaurant-vercel-browser-notification-qualification-20260928e",
  consumedQualifications: Object.freeze([
    Object.freeze({ id: "restaurant-vercel-browser-notification-qualification-20260928b", manifest: "evidence-manifest.tsv", manifestSha256: "8b478d63808742057429821a5704db22d2e6cf4343ce82fe18189db96ba3c592", authoritySha256: "2d4af7ec3c33bbb6fb3836bf3754857be9109c20fe7cb43b5bbfd6aef3f765e6", sourceManifestSha256: "33f95fc58475b5ea3e91c0cf8b6aef045fcde9f043af82abcca05eb7d5811b85" }),
    Object.freeze({ id: "restaurant-vercel-browser-notification-qualification-20260928c", manifest: "evidence-manifest-final.tsv", manifestSha256: "6dc2701f56fddaf341519b4a6ad78ab88a6d037d8d0993ece3e91ad691ce399f", authoritySha256: "219381cafd5c1ec678a0a3936fc48ebecc7e961fac4a597d8b391eb229a3428e", sourceManifestSha256: "18ddf144ad7e237a3f286557cbd02c54b7be1b126a36d24c44006c1771a16fda" }),
    Object.freeze({ id: "restaurant-vercel-browser-notification-qualification-20260928d", manifest: "evidence-manifest-final.tsv", manifestSha256: "c3527e2fb8b5b8f3c3ddc2c73ab99102f25de34fda018e75df520192b5b55243", authoritySha256: "4685ce3d4796fdf78d1ae132184b351c64876fe5967bee1f3252cd3fbc016be5", sourceManifestSha256: "35f0170b113fa91c693c070d1b0a4602c0963b1903315612526417e5cecc31dc" }),
  ]),
  deploymentId: "dpl_8CM3s16BZRwK9Ls1eMMJCVKmWyYt",
  origin: "https://hungrie-restaurant-web-staging-eval-20260927a-h9m8zpwol.vercel.app",
  projectId: "prj_PrVORzWTAxmAHL0SqNcA9WXJppS4",
  projectName: "hungrie-restaurant-web-staging-eval-20260927a",
  scope: "nurlan-ildirimli-s-projects",
  firebaseProjectId: "hungrieapp-a2288",
  firebaseAppId: "1:405094874808:web:34b9ea3e4b1d3b70a6fe4d",
  firebaseAuthorizedDomain: "hungrie-restaurant-web-staging-eval-20260927a-h9m8zpwol.vercel.app",
  acceptedArtifactManifestSha256: "d3af007214f8fd5cf200dbe8e81cef33a32d98e0fb889e63596dae856ac39e89",
  canonicalArchiveSha256: "b6294bb5195779e3d9fb2e412fb61e82d08a0ac2f0ea25deb283dc4094832862",
  buildInputContractSha256: "f2c3e37d1e5699ea806e7fe2fd337aef4cb07ebb421ad2215209442546770c2e",
  acceptedRoot: Object.freeze({ bytes: 17919, sha256: "7a92f77b3ff18510ee0bbf37e2433d60e83fcdd09244ddb6724d885b795d1163" }),
  normalRoot: Object.freeze({ bytes: 18082, sha256: "18f1015e99ceb70ce8656b59259e0274f77bedc3440e5a9222ce0e8fb09f68a2", injectionBytes: 163 }),
  historicalQualificationManifestSha256: "b57ef17c2871ac322afc70148f72d7cc23de02b2ebaf3f9620c0a144e718cfff",
  toolbarInvestigationManifestSha256: "49273bb907a2571847cb7b4e4fb73d494536a16c398d4c40be448f76c39458ee",
  evidenceDirectory: "secure/restaurant-vercel-browser-notification-qualification/restaurant-vercel-browser-notification-qualification-20260928e",
  authorityDirectory: "secure/restaurant-vercel-browser-notification-qualification-authority",
  limits: Object.freeze({ bypassCreates: 1, bypassRevokes: 1, accountContexts: 4, concurrentAccountContexts: 1, pushRegistrations: 1, foregroundFcmSends: 1, backgroundFcmSends: 1, pushUnregistrations: 1, retries: 0, authorityValidityMs: 2 * 60 * 60 * 1000 }),
});

export const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
export const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
export const BYPASS_SECRET_PATTERN = /^[a-f0-9]{32}$/;

export function generateBypassSecret(randomBytes = crypto.randomBytes) {
  const secret = randomBytes(16).toString("hex");
  return validateBypassSecret(secret);
}

export function validateBypassSecret(secret) {
  if (typeof secret !== "string" || !BYPASS_SECRET_PATTERN.test(secret)) throw new Error("Vercel automation bypass secret must contain exactly 32 lowercase hexadecimal characters.");
  return secret;
}

export function assertUniqueBypassSecret(secret, protectionBypass) {
  validateBypassSecret(secret);
  if (!protectionBypass || typeof protectionBypass !== "object" || Array.isArray(protectionBypass)) throw new Error("Vercel bypass inventory shape is invalid.");
  if (Object.prototype.hasOwnProperty.call(protectionBypass, secret)) throw new Error("Generated Vercel automation bypass secret is not unique.");
  return secret;
}

export function buildBypassApiRequest({ action, secret }) {
  validateBypassSecret(secret);
  if (!['generate', 'revoke'].includes(action)) throw new Error("Unsupported Vercel bypass action.");
  const endpoint = `/v1/projects/${CONTINUATION.projectId}/protection-bypass`;
  const body = action === "generate" ? { generate: { secret, note: CONTINUATION.qualificationId } } : { revoke: { secret, regenerate: false } };
  return { endpoint, method: "PATCH", scope: CONTINUATION.scope, body };
}

function responseHeaderValues(headers, wanted) {
  const normalized = wanted.toLowerCase();
  if (headers instanceof Headers) {
    if (normalized === "set-cookie" && typeof headers.getSetCookie === "function") return headers.getSetCookie();
    const value = headers.get(wanted);
    return value === null ? [] : [value];
  }
  if (Array.isArray(headers)) return headers.filter(([name]) => String(name).toLowerCase() === normalized).flatMap(([, value]) => Array.isArray(value) ? value : [value]).map(String);
  if (headers && typeof headers === "object") return Object.entries(headers).filter(([name]) => name.toLowerCase() === normalized).flatMap(([, value]) => Array.isArray(value) ? value : [value]).map(String);
  throw new Error("Protected bootstrap response headers are malformed.");
}

export function validateProtectedBootstrapResponse({ requestUrl, status, headers }) {
  const requested = new URL(requestUrl);
  if (requested.origin !== CONTINUATION.origin || requested.pathname !== "/" || requested.search || requested.hash) throw Object.assign(new Error("Protected bootstrap request identity mismatch."), { code: "UNEXPECTED_ORIGIN" });
  if (status !== 302) throw new Error(`Protected bootstrap must return the documented HTTP 302 response; received ${status}.`);
  const locations = responseHeaderValues(headers, "location");
  if (locations.length !== 1) throw new Error("Protected bootstrap must return one unambiguous redirect location.");
  const redirectUrl = new URL(locations[0], requested);
  if (redirectUrl.origin !== CONTINUATION.origin || redirectUrl.pathname !== requested.pathname || redirectUrl.username || redirectUrl.password || redirectUrl.hash || [...redirectUrl.searchParams.keys()].some(key => /^x-vercel-(?:protection-bypass|set-bypass-cookie)$/i.test(key))) throw Object.assign(new Error("Protected bootstrap redirect escaped the reviewed exact-origin route."), { code: "UNEXPECTED_ORIGIN" });
  const cookies = responseHeaderValues(headers, "set-cookie").map(value => {
    const parts = value.split(";").map(part => part.trim()), separator = parts[0]?.indexOf("=") ?? -1;
    return { name: separator > 0 ? parts[0].slice(0, separator) : "", value: separator > 0 ? parts[0].slice(separator + 1) : "", attributes: parts.slice(1).map(part => part.toLowerCase()) };
  }).filter(cookie => cookie.name === "_vercel_jwt");
  if (cookies.length !== 1) throw new Error("Protected bootstrap must return exactly one _vercel_jwt cookie.");
  const cookie = cookies[0];
  if (!/^[A-Za-z0-9._~-]{32,8192}$/.test(cookie.value) || !cookie.attributes.includes("secure") || !cookie.attributes.includes("httponly") || !cookie.attributes.includes("path=/") || !cookie.attributes.includes("samesite=lax")) throw new Error("Protected bootstrap cookie is malformed or lacks required security attributes.");
  return { passed: true, redirectUrl: redirectUrl.href, cookie: { name: cookie.name, value: cookie.value }, cookiePersisted: false };
}

export function buildProtectedRedirectRequest(bootstrap) {
  if (!bootstrap?.passed || bootstrap.cookie?.name !== "_vercel_jwt" || !/^[A-Za-z0-9._~-]{32,8192}$/.test(bootstrap.cookie.value)) throw new Error("Validated protected bootstrap evidence is required.");
  const target = new URL(bootstrap.redirectUrl);
  if (target.origin !== CONTINUATION.origin) throw Object.assign(new Error("Protected redirect target origin mismatch."), { code: "UNEXPECTED_ORIGIN" });
  return { url: target.href, method: "GET", headers: { Cookie: `${bootstrap.cookie.name}=${bootstrap.cookie.value}`, "x-vercel-skip-toolbar": "1" }, redirect: "manual" };
}

export function sanitizeProtectedBootstrapEvidence(bootstrap) {
  if (!bootstrap?.passed || bootstrap.cookie?.name !== "_vercel_jwt") throw new Error("Validated protected bootstrap evidence is required.");
  const redirect = new URL(bootstrap.redirectUrl);
  return { passed: true, status: 302, redirectOrigin: redirect.origin, redirectPath: `${redirect.pathname}${redirect.search}`, cookieName: bootstrap.cookie.name, cookieValueBytes: Buffer.byteLength(bootstrap.cookie.value), cookieValueSha256: sha256(Buffer.from(bootstrap.cookie.value)), credentialValuePersisted: false };
}

export function verifyBypassInventoryTransition({ before, after, secret }) {
  validateBypassSecret(secret);
  for (const [label, inventory] of [["before", before], ["after", after]]) if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) throw new Error(`Vercel ${label} bypass inventory shape is invalid.`);
  if (!Object.prototype.hasOwnProperty.call(before, secret) || Object.prototype.hasOwnProperty.call(after, secret)) throw new Error("Qualification-specific bypass cleanup state is invalid.");
  const remaining = Object.fromEntries(Object.entries(before).filter(([key]) => key !== secret));
  if (canonical(remaining) !== canonical(after)) throw new Error("Bypass cleanup changed an unrelated record.");
  return { passed: true, removedSecretSha256: sha256(Buffer.from(secret)), preservedRecords: Object.keys(after).length, secretPersisted: false };
}

export function verifyBypassApiResponse(payload, { secret, expectedPresent }) {
  validateBypassSecret(secret);
  if (!payload || typeof payload !== "object" || !payload.protectionBypass || typeof payload.protectionBypass !== "object" || Array.isArray(payload.protectionBypass)) throw new Error("Vercel bypass response shape is invalid.");
  const present = Object.prototype.hasOwnProperty.call(payload.protectionBypass, secret);
  if (present !== expectedPresent) throw new Error(expectedPresent ? "Created Vercel bypass is absent from the response inventory." : "Revoked Vercel bypass remains in the response inventory.");
  return { passed: true, present, inventoryCount: Object.keys(payload.protectionBypass).length, secretSha256: sha256(Buffer.from(secret)), secretPersisted: false };
}

export function buildProtectedBrowserBootstrap(secret) {
  validateBypassSecret(secret);
  return { url: `${CONTINUATION.origin}/`, method: "GET", headers: { "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true", "x-vercel-skip-toolbar": "1" }, redirect: "manual" };
}

export function validateProtectedBrowserRequest({ url, resourceType, headerNames = [] }) {
  const origin = new URL(url).origin, normalized = headerNames.map(value => String(value).toLowerCase());
  if (normalized.includes("x-vercel-protection-bypass") || normalized.includes("x-vercel-set-bypass-cookie")) throw Object.assign(new Error("Protection credentials may only be used by the exact-origin bootstrap request."), { code: "CREDENTIAL_EXPOSURE" });
  const toolbar = normalized.includes("x-vercel-skip-toolbar");
  if (toolbar && (origin !== CONTINUATION.origin || resourceType !== "Document")) throw Object.assign(new Error("Toolbar automation header escaped the exact-origin Document boundary."), { code: "UNEXPECTED_ORIGIN" });
  return { passed: true, toolbar };
}

export function sanitizeContinuationError(error) {
  return String(error?.message || error).replace(/\b[a-f0-9]{32}\b/gi, "[REDACTED_BYPASS_SECRET]").replace(/(_vercel_jwt=)[^;\s"']+/gi, "$1[REDACTED]").replace(/(x-vercel-protection-bypass\s*[:=]\s*)[^\s,"']+/gi, "$1[REDACTED]").replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]").slice(0, 500);
}

export function buildSourceManifest(repoRoot, commit, spawn = spawnSync) {
  const tree = spawn("git", ["ls-tree", "-r", "--name-only", "-z", commit], { cwd: repoRoot, encoding: null, maxBuffer: 128 * 1024 * 1024 });
  if (tree.status !== 0) throw new Error("Unable to enumerate checkpoint.");
  const files = tree.stdout.toString("utf8").split("\0").filter(Boolean).sort();
  const bytes = Buffer.from(files.map(relative => {
    const blob = spawn("git", ["show", `${commit}:${relative}`], { cwd: repoRoot, encoding: null, maxBuffer: 128 * 1024 * 1024 });
    if (blob.status !== 0) throw new Error(`Unable to read checkpoint blob: ${relative}.`);
    return `${sha256(blob.stdout)}\t${blob.stdout.length}\t${relative}\n`;
  }).join(""));
  return { bytes, files: files.length, sha256: sha256(bytes) };
}

export function buildAuthorizationText({ sourceCommit, sourceManifestSha256, operatorSha256, qualifierSha256 }) {
  return `I authorize one controlled continuation of browser and notification qualification for qualification ${CONTINUATION.qualificationId}, bound to checkpoint ${sourceCommit}, complete source-manifest SHA-256 ${sourceManifestSha256}, continuation operator SHA-256 ${operatorSha256}, browser qualifier SHA-256 ${qualifierSha256}, immutable Vercel Preview deployment ${CONTINUATION.deploymentId} at ${CONTINUATION.origin}, project ${CONTINUATION.projectId} in scope ${CONTINUATION.scope}, accepted artifact manifest ${CONTINUATION.acceptedArtifactManifestSha256}, canonical archive ${CONTINUATION.canonicalArchiveSha256}, and build-input contract ${CONTINUATION.buildInputContractSha256}. I authorize creation and revocation of exactly one short-lived Vercel Protection Bypass for Automation secret while Vercel Authentication remains enabled; use of x-vercel-skip-toolbar: 1 only on Document requests whose origin exactly equals the immutable Preview origin; reuse of the independently verified 73-resource parity evidence and the separate ordinary-root mismatch and automation-header exact-root evidence; sequential isolated Pending, Suspended, Owner, and Manager browser qualification using the existing approved non-production accounts; and, only after all mandatory identity, parity, browser, runtime, service-worker, and four-account gates pass, exactly one Owner FCM token registration through restaurant_register_web_push_v1, one direct token-targeted foreground test message, one separate direct token-targeted background test message, real notification-click navigation verification where the test platform supports it, and exactly one scoped cleanup through restaurant_unregister_web_push_v1, Firebase deleteToken, ephemeral browser-profile removal, and bypass-secret revocation. I authorize no rebuild, deployment, alias or domain change, Vercel or Firebase configuration change, public exposure, account or password change, Firebase identity change, backend schema change, Expo action, Production access, Earnings activation, order/review/payment mutation, notification-infrastructure change, retry, or unrelated mutation. Protection credentials and account credentials must never be persisted in evidence or forwarded to Firebase, Supabase, Google, or any origin other than the exact Vercel Preview origin. Ordinary qualification failures must be recorded while remaining independent account checks continue; any identity, authorization, credential-exposure, unexpected-origin, evidence-integrity, or cleanup safety failure must stop further qualification without retry. Safe authorized cleanup remains mandatory after every terminal outcome. This authorization does not constitute Phase 6 acceptance.`;
}

function exactKeys(value, keys, label) {
  if (JSON.stringify(Object.keys(value || {}).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} fields differ from the reviewed schema.`);
}

export function validateApproval(approval, { now = Date.now() } = {}) {
  exactKeys(approval, ["schemaVersion", "kind", "decision", "qualificationId", "issuedAt", "expiresAt", "authorizationText", "authorizationTextSha256", "sourceCommit", "sourceManifestSha256", "operatorSha256", "qualifierSha256", "deploymentId", "origin", "evidenceDirectory", "limits"], "Qualification approval");
  if (approval.schemaVersion !== 1 || approval.kind !== CONTINUATION.kind || approval.decision !== "APPROVE_CONTROLLED_VERCEL_BROWSER_NOTIFICATION_CONTINUATION" || approval.qualificationId !== CONTINUATION.qualificationId) throw new Error("Exact continuation approval is required.");
  for (const key of ["sourceManifestSha256", "operatorSha256", "qualifierSha256", "authorizationTextSha256"]) if (!/^[a-f0-9]{64}$/.test(approval[key] || "")) throw new Error(`Invalid ${key}.`);
  if (!/^[a-f0-9]{40}$/.test(approval.sourceCommit || "") || approval.deploymentId !== CONTINUATION.deploymentId || approval.origin !== CONTINUATION.origin || approval.evidenceDirectory !== CONTINUATION.evidenceDirectory || JSON.stringify(approval.limits) !== JSON.stringify(CONTINUATION.limits)) throw new Error("Approval identity or limits mismatch.");
  const exactText = buildAuthorizationText(approval);
  if (approval.authorizationText !== exactText || sha256(Buffer.from(exactText)) !== approval.authorizationTextSha256) throw new Error("Authorization text or digest mismatch.");
  const issued = Date.parse(approval.issuedAt), expires = Date.parse(approval.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires - issued !== CONTINUATION.limits.authorityValidityMs || now < issued || now >= expires) throw new Error("Approval is not currently valid for exactly two hours.");
  return approval;
}

function continuationPaths(repoRoot) {
  const authorityDirectory = path.join(repoRoot, CONTINUATION.authorityDirectory);
  return {
    authorityDirectory,
    authorityPath: path.join(authorityDirectory, `${CONTINUATION.qualificationId}.json`),
    sourceManifestPath: path.join(authorityDirectory, `${CONTINUATION.qualificationId}-source-manifest.tsv`),
    evidenceDirectory: path.join(repoRoot, CONTINUATION.evidenceDirectory),
  };
}

function verifyCoreBindings({ repoRoot, approval, operatorPath = "scripts/restaurant-vercel-preview-browser-notification-continuation.mjs", qualifierPath = "scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs", spawn = spawnSync }) {
  const head = spawn("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
  if (head !== approval.sourceCommit) throw new Error("Checkpoint mismatch.");
  const manifest = buildSourceManifest(repoRoot, head, spawn);
  if (manifest.sha256 !== approval.sourceManifestSha256) throw new Error("Source manifest mismatch.");
  const read = relative => {
    const result = spawn("git", ["show", `${head}:${relative}`], { cwd: repoRoot, encoding: null, maxBuffer: 128 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Missing committed binding: ${relative}.`);
    return result.stdout;
  };
  if (sha256(read(operatorPath)) !== approval.operatorSha256 || sha256(read(qualifierPath)) !== approval.qualifierSha256) throw new Error("Executable binding mismatch.");
  const historical = path.join(repoRoot, "secure/restaurant-vercel-browser-notification-qualification/restaurant-vercel-browser-notification-qualification-20260928a/evidence-manifest.tsv");
  const toolbar = path.join(repoRoot, "secure/restaurant-vercel-toolbar-investigation/restaurant-vercel-toolbar-investigation-20260928a/evidence-manifest.tsv");
  if (sha256(fs.readFileSync(historical)) !== CONTINUATION.historicalQualificationManifestSha256 || sha256(fs.readFileSync(toolbar)) !== CONTINUATION.toolbarInvestigationManifestSha256) throw new Error("Protected prerequisite evidence changed.");
  for (const consumed of CONTINUATION.consumedQualifications) {
    const evidenceManifest = path.join(repoRoot, `secure/restaurant-vercel-browser-notification-qualification/${consumed.id}/${consumed.manifest}`);
    const authority = path.join(repoRoot, CONTINUATION.authorityDirectory, `${consumed.id}.json`);
    const sourceManifest = path.join(repoRoot, CONTINUATION.authorityDirectory, `${consumed.id}-source-manifest.tsv`);
    if (sha256(fs.readFileSync(evidenceManifest)) !== consumed.manifestSha256 || sha256(fs.readFileSync(authority)) !== consumed.authoritySha256 || sha256(fs.readFileSync(sourceManifest)) !== consumed.sourceManifestSha256) throw new Error("Consumed qualification evidence changed.");
  }
  return { head, manifest, historicalEvidence: true };
}

export function verifyLocalBindings(options) {
  const verified = verifyCoreBindings(options);
  const paths = continuationPaths(options.repoRoot);
  for (const target of [paths.authorityPath, paths.sourceManifestPath, paths.evidenceDirectory]) if (fs.existsSync(target)) throw Object.assign(new Error("Exclusive continuation path already exists."), { code: "EVIDENCE_INTEGRITY" });
  return verified;
}

export function prepareAuthority({ repoRoot, approval, now = Date.now(), spawn = spawnSync }) {
  validateApproval(approval, { now });
  const verified = verifyLocalBindings({ repoRoot, approval, spawn });
  const paths = continuationPaths(repoRoot), directory = paths.authorityDirectory;
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); fs.chmodSync(directory, 0o700);
  const authorityPath = paths.authorityPath, manifestPath = paths.sourceManifestPath;
  if (fs.existsSync(authorityPath) || fs.existsSync(manifestPath) || fs.existsSync(path.join(repoRoot, CONTINUATION.evidenceDirectory))) throw new Error("Continuation authority or evidence path already exists.");
  const authority = { ...approval, ownerApprovalSha256: sha256(Buffer.from(canonical(approval))) };
  for (const [file, bytes] of [[authorityPath, Buffer.from(canonical(authority))], [manifestPath, verified.manifest.bytes]]) {
    const descriptor = fs.openSync(file, "wx", 0o600); try { fs.writeFileSync(descriptor, bytes); } finally { fs.closeSync(descriptor); } fs.chmodSync(file, 0o600);
  }
  return { authorityPath, manifestPath, authoritySha256: sha256(fs.readFileSync(authorityPath)), sourceManifestSha256: sha256(fs.readFileSync(manifestPath)) };
}

export function validatePreparedAuthority({ repoRoot, now = Date.now(), spawn = spawnSync }) {
  const paths = continuationPaths(repoRoot);
  if (!fs.existsSync(paths.authorityPath) || !fs.existsSync(paths.sourceManifestPath)) throw Object.assign(new Error("Prepared continuation authority is incomplete."), { code: "AUTHORIZATION" });
  if (fs.existsSync(paths.evidenceDirectory)) throw Object.assign(new Error("Exclusive continuation evidence path already exists."), { code: "EVIDENCE_INTEGRITY" });
  const authority = JSON.parse(fs.readFileSync(paths.authorityPath, "utf8"));
  exactKeys(authority, ["schemaVersion", "kind", "decision", "qualificationId", "issuedAt", "expiresAt", "authorizationText", "authorizationTextSha256", "sourceCommit", "sourceManifestSha256", "operatorSha256", "qualifierSha256", "deploymentId", "origin", "evidenceDirectory", "limits", "ownerApprovalSha256"], "Prepared authority");
  const approval = { ...authority }; delete approval.ownerApprovalSha256;
  validateApproval(approval, { now });
  if (authority.ownerApprovalSha256 !== sha256(Buffer.from(canonical(approval)))) throw Object.assign(new Error("Prepared authority owner-approval digest mismatch."), { code: "AUTHORIZATION" });
  const verified = verifyCoreBindings({ repoRoot, approval, spawn });
  const sourceManifest = fs.readFileSync(paths.sourceManifestPath);
  if (!sourceManifest.equals(verified.manifest.bytes) || sha256(sourceManifest) !== approval.sourceManifestSha256) throw Object.assign(new Error("Prepared source manifest differs from the audited checkpoint."), { code: "EVIDENCE_INTEGRITY" });
  return { approval, authority, authoritySha256: sha256(fs.readFileSync(paths.authorityPath)), paths, verified };
}

export function reserveQualificationEvidence({ repoRoot, now = Date.now(), spawn = spawnSync, randomBytes = crypto.randomBytes, validatePrepared = validatePreparedAuthority }) {
  const prepared = validatePrepared({ repoRoot, now, spawn });
  const paths = prepared.paths || continuationPaths(repoRoot);
  const token = randomBytes(32).toString("hex");
  if (!/^[a-f0-9]{64}$/.test(token)) throw Object.assign(new Error("Evidence reservation token generation failed."), { code: "EVIDENCE_INTEGRITY" });
  fs.mkdirSync(path.dirname(paths.evidenceDirectory), { recursive: true, mode: 0o700 });
  try { fs.mkdirSync(paths.evidenceDirectory, { mode: 0o700 }); }
  catch (error) {
    if (error?.code === "EEXIST") throw Object.assign(new Error("Exclusive continuation evidence reservation already exists."), { code: "EVIDENCE_INTEGRITY" });
    throw error;
  }
  fs.chmodSync(paths.evidenceDirectory, 0o700);
  const reservation = {
    schemaVersion: 1,
    kind: "restaurant_vercel_qualification_evidence_reservation",
    qualificationId: CONTINUATION.qualificationId,
    reservedAt: new Date(now).toISOString(),
    sourceCommit: prepared.approval.sourceCommit,
    sourceManifestSha256: prepared.approval.sourceManifestSha256,
    authoritySha256: prepared.authoritySha256,
    reservationTokenSha256: sha256(Buffer.from(token)),
    owner: "checkpointed-qualification-runner",
  };
  const reservationPath = path.join(paths.evidenceDirectory, "evidence-reservation.json");
  try {
    const descriptor = fs.openSync(reservationPath, "wx", 0o600);
    try { fs.writeFileSync(descriptor, Buffer.from(canonical(reservation))); } finally { fs.closeSync(descriptor); }
  } catch (error) {
    const failure = { schemaVersion: 1, qualificationId: CONTINUATION.qualificationId, classification: "ABORTED", reason: "EVIDENCE_RESERVATION_INITIALIZATION_FAILED", capturedAt: new Date(now).toISOString() };
    fs.writeFileSync(path.join(paths.evidenceDirectory, "reservation-failure.json"), canonical(failure), { flag: "wx", mode: 0o600 });
    throw Object.assign(new Error("Evidence reservation marker creation failed."), { code: "EVIDENCE_INTEGRITY", cause: error });
  }
  return { ...prepared, reservation, reservationPath, reservationToken: token };
}

export function verifyEvidenceReservation({ evidenceDirectory, reservationToken }) {
  const reservationPath = path.join(evidenceDirectory, "evidence-reservation.json");
  if (!fs.existsSync(reservationPath)) throw Object.assign(new Error("Runner-owned evidence reservation is missing."), { code: "EVIDENCE_INTEGRITY" });
  const reservation = JSON.parse(fs.readFileSync(reservationPath, "utf8"));
  if (reservation.schemaVersion !== 1 || reservation.kind !== "restaurant_vercel_qualification_evidence_reservation" || reservation.qualificationId !== CONTINUATION.qualificationId || reservation.owner !== "checkpointed-qualification-runner" || reservation.reservationTokenSha256 !== sha256(Buffer.from(reservationToken || ""))) throw Object.assign(new Error("Runner-owned evidence reservation identity mismatch."), { code: "EVIDENCE_INTEGRITY" });
  return reservation;
}

export function persistReservedEvidence({ evidenceDirectory, reservationToken, name, value }) {
  verifyEvidenceReservation({ evidenceDirectory, reservationToken });
  if (!/^[a-z0-9][a-z0-9.-]*\.json$/.test(name) || ["evidence-reservation.json", "terminal-result.json"].includes(name)) throw Object.assign(new Error("Reserved evidence filename is not permitted."), { code: "EVIDENCE_INTEGRITY" });
  const target = path.join(evidenceDirectory, name), temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, canonical(value), { mode: 0o600 }); fs.renameSync(temporary, target); fs.chmodSync(target, 0o600);
  return { path: target, sha256: sha256(fs.readFileSync(target)) };
}

export function finalizeQualificationEvidence({ evidenceDirectory, reservationToken, terminal }) {
  verifyEvidenceReservation({ evidenceDirectory, reservationToken });
  const terminalPath = path.join(evidenceDirectory, "terminal-result.json"), manifestPath = path.join(evidenceDirectory, "evidence-manifest.tsv");
  const terminalBytes = Buffer.from(canonical(terminal));
  if (fs.existsSync(terminalPath) || fs.existsSync(manifestPath)) {
    if (!fs.existsSync(terminalPath) || !fs.existsSync(manifestPath) || !fs.readFileSync(terminalPath).equals(terminalBytes)) throw Object.assign(new Error("Terminal evidence was already finalized with different content."), { code: "EVIDENCE_INTEGRITY" });
    return { terminalSha256: sha256(terminalBytes), manifestSha256: sha256(fs.readFileSync(manifestPath)), repeated: true };
  }
  fs.writeFileSync(terminalPath, terminalBytes, { flag: "wx", mode: 0o600 });
  const files = fs.readdirSync(evidenceDirectory).filter(name => name !== "evidence-manifest.tsv").sort();
  const manifest = Buffer.from(`path\tbytes\tsha256\n${files.map(name => { const bytes = fs.readFileSync(path.join(evidenceDirectory, name)); return `${name}\t${bytes.length}\t${sha256(bytes)}`; }).join("\n")}\n`);
  fs.writeFileSync(manifestPath, manifest, { flag: "wx", mode: 0o600 });
  return { terminalSha256: sha256(terminalBytes), manifestSha256: sha256(manifest), repeated: false };
}

export async function executeReservedQualification({ repoRoot, operations, now = Date.now(), spawn = spawnSync, randomBytes = crypto.randomBytes, validatePrepared = validatePreparedAuthority }) {
  let reservation;
  try {
    reservation = reserveQualificationEvidence({ repoRoot, now, spawn, randomBytes, validatePrepared });
    persistReservedEvidence({ evidenceDirectory: reservation.paths.evidenceDirectory, reservationToken: reservation.reservationToken, name: "progress.json", value: { schemaVersion: 1, qualificationId: CONTINUATION.qualificationId, startedAt: new Date(now).toISOString(), classification: "STARTED" } });
    const result = await executeControlledContinuation({ operations, persist: state => persistReservedEvidence({ evidenceDirectory: reservation.paths.evidenceDirectory, reservationToken: reservation.reservationToken, name: "progress.json", value: { schemaVersion: 1, qualificationId: CONTINUATION.qualificationId, updatedAt: new Date().toISOString(), ...state } }) });
    const terminal = { schemaVersion: 1, qualificationId: CONTINUATION.qualificationId, completedAt: new Date().toISOString(), ...result, retryEligible: false };
    return { result, evidence: finalizeQualificationEvidence({ evidenceDirectory: reservation.paths.evidenceDirectory, reservationToken: reservation.reservationToken, terminal }) };
  } catch (error) {
    if (!reservation) throw error;
    const terminal = { schemaVersion: 1, qualificationId: CONTINUATION.qualificationId, classification: "ABORTED", reason: sanitizeContinuationError(error), completedAt: new Date().toISOString(), retryEligible: false };
    finalizeQualificationEvidence({ evidenceDirectory: reservation.paths.evidenceDirectory, reservationToken: reservation.reservationToken, terminal });
    throw error;
  }
}

export function classifySafetyError(error) {
  return ["AUTHORIZATION", "CREDENTIAL_EXPOSURE", "EVIDENCE_INTEGRITY", "IDENTITY", "UNEXPECTED_ORIGIN", "UNEXPECTED_MUTATION"].includes(error?.code);
}

export async function executeControlledContinuation({ operations, persist = async () => {} }) {
  const results = { prerequisites: "NOT_EXECUTED", accounts: {}, notifications: {}, cleanup: {}, classification: "ABORTED" };
  let bypassAttempted = false, bypassCreated = false, tokenRegistered = false, browser = null;
  try {
    await operations.verifyPrerequisites(); results.prerequisites = "PASS"; await persist(results);
    bypassAttempted = true; await operations.createBypass(); bypassCreated = true; await persist(results);
    await operations.bootstrapProtectedBrowser(); results.bootstrap = "PASS"; await persist(results);
    await operations.verifyParityEvidence();
    const matrix = await operations.qualifyAccounts(); results.accounts = matrix; await persist(results);
    const mandatoryBrowserPass = ["pending", "suspended", "owner", "manager"].every(name => matrix[name] === "PASS") && await operations.verifyServiceWorker();
    if (!mandatoryBrowserPass) { results.notifications = { registration: "NOT_EXECUTED", foreground: "NOT_EXECUTED", background: "NOT_EXECUTED", click: "NOT_EXECUTED" }; results.classification = "FAIL"; return results; }
    browser = await operations.openOwnerNotificationContext();
    await operations.registerToken(browser); tokenRegistered = true; results.notifications.registration = "PASS"; await persist(results);
    await operations.sendForeground(browser); results.notifications.foreground = "PASS"; await persist(results);
    await operations.sendBackground(browser); results.notifications.background = "PASS"; await persist(results);
    results.notifications.click = await operations.verifyRealClick(browser) ? "PASS" : "NOT_EXECUTED";
    results.classification = results.notifications.click === "PASS" ? "PASS" : "INCONCLUSIVE";
    return results;
  } catch (error) {
    results.classification = classifySafetyError(error) ? "ABORTED" : "FAIL";
    results.error = sanitizeContinuationError(error);
    return results;
  } finally {
    if (tokenRegistered) { try { await operations.unregisterToken(browser); results.cleanup.token = "PASS"; } catch { results.cleanup.token = "FAIL"; results.classification = "ABORTED"; } }
    if (browser) { try { await operations.closeBrowser(browser); results.cleanup.browser = "PASS"; } catch { results.cleanup.browser = "FAIL"; results.classification = "ABORTED"; } }
    if (bypassAttempted && !bypassCreated) {
      try { bypassCreated = await operations.reconcileBypassCreation(); results.cleanup.creationReconciliation = bypassCreated ? "PRESENT_REQUIRES_REVOCATION" : "ABSENT_VERIFIED"; }
      catch { results.cleanup.creationReconciliation = "FAILED"; results.classification = "ABORTED"; }
    }
    if (bypassCreated) {
      try { await operations.revokeBypass(); await operations.verifyBypassRevoked(); results.cleanup.bypass = "PASS"; }
      catch { results.cleanup.bypass = "FAIL"; results.classification = "ABORTED"; }
    }
    await persist(results);
  }
}
