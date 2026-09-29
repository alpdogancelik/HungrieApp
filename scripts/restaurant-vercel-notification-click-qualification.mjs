#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const CLICK_QUALIFICATION = Object.freeze({
  schemaVersion: 1,
  kind: "restaurant_vercel_notification_click_qualification",
  qualificationId: "restaurant-vercel-notification-click-qualification-20260929af",
  deploymentId: "dpl_CKP6p798ybfyty1PzF2WxWXP3xsJ",
  origin: "https://hungrie-restaurant-web-staging-eval-20260927a-bda2kh85w.vercel.app",
  projectId: "prj_PrVORzWTAxmAHL0SqNcA9WXJppS4",
  projectName: "hungrie-restaurant-web-staging-eval-20260927a",
  scope: "nurlan-ildirimli-s-projects",
  teamId: "team_799flI3SHCD8C2AXbbQ6NlBX",
  firebaseProjectId: "hungrieapp-a2288",
  firebaseAppId: "1:405094874808:web:34b9ea3e4b1d3b70a6fe4d",
  firebaseMessagingServiceAccount: "firebase-adminsdk-fbsvc@hungrieapp-a2288.iam.gserviceaccount.com",
  artifactManifestSha256: "9942625eaec41b5852b0360aae52c1df36d9e6cfcdec56e9e3e623727cc67de7",
  archiveSha256: "e57f1a0e47b1059c369c11d98454b6d9eba109e9aee01aa11be56081e6574c60",
  acceptedRoot: Object.freeze({ bytes: 17949, sha256: "cb2ec4a53388c995eb034e53bb26b8a7bb4a7fb83e444257357b1d744af4ff6e" }),
  acceptedServiceWorker: Object.freeze({ bytes: 2104, sha256: "70c2d705be9b56f8a8dd5fbcd2a8714f2193da23959619593c46cd091fc88eb3" }),
  prerequisiteQualification: Object.freeze({
    id: "restaurant-vercel-browser-notification-qualification-20260929ae",
    manifestSha256: "6f45cbc4167e89ee5a0e30de49e84db0ba19d3038adaecc5f6b03e5885081c1f",
    terminalSha256: "b209e177e413af7936fb4e9db7822c07b9f02a9e4eb5ba10671815c9eedcbcaa",
  }),
  expectedOrderId: "00000000-0000-4000-8000-2026092900af",
  expectedPath: "/orders/detail",
  evidenceDirectory: "secure/restaurant-vercel-notification-click-qualification/restaurant-vercel-notification-click-qualification-20260929af",
  authorityDirectory: "secure/restaurant-vercel-notification-click-qualification-authority",
  limits: Object.freeze({ bypassCreates: 1, bypassRevokes: 1, projectVerificationGets: 1, ownerContexts: 1, registrations: 1, foregroundSends: 0, backgroundSends: 1, clickObservations: 1, unregistrations: 1, retries: 0, authorityValidityMs: 2 * 60 * 60 * 1000 }),
});

export const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
export const canonical = value => `${JSON.stringify(value, null, 2)}\n`;

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

export function buildAuthorizationText({ sourceCommit, sourceManifestSha256, operatorSha256 }) {
  return `I authorize one manual notification-click qualification for ${CLICK_QUALIFICATION.qualificationId}, bound to checkpoint ${sourceCommit}, complete source-manifest SHA-256 ${sourceManifestSha256}, operator SHA-256 ${operatorSha256}, immutable Preview deployment ${CLICK_QUALIFICATION.deploymentId} at ${CLICK_QUALIFICATION.origin}, accepted artifact manifest ${CLICK_QUALIFICATION.artifactManifestSha256}, canonical archive ${CLICK_QUALIFICATION.archiveSha256}, and prerequisite qualification ${CLICK_QUALIFICATION.prerequisiteQualification.id} evidence-manifest SHA-256 ${CLICK_QUALIFICATION.prerequisiteQualification.manifestSha256}. I authorize exactly one short-lived Vercel automation-bypass creation and revocation, one visible isolated Owner browser, one fresh FCM token registration, zero foreground sends, exactly one direct token-targeted background FCM message carrying order ID ${CLICK_QUALIFICATION.expectedOrderId}, one physical owner click on the real OS/browser notification, automated exact-origin navigation verification at ${CLICK_QUALIFICATION.expectedPath}, and mandatory scoped token, browser-profile, and bypass cleanup with one independent post-revocation project GET. No simulated click, synthetic notification event, manual qualifying navigation, deployment, alias or domain change, Firebase or Vercel configuration change, Production access, account change, retry, or unrelated mutation is authorized. Credentials and raw token values must never be persisted. This authorization does not constitute Phase 6 acceptance unless every mandatory click and cleanup result passes.`;
}

export function validateClickNavigation(value) {
  if (!value || value.eventType !== "FRAME_NAVIGATED" || value.commandIssuedAfterSend !== false || value.origin !== CLICK_QUALIFICATION.origin || value.path !== CLICK_QUALIFICATION.expectedPath || value.orderId !== CLICK_QUALIFICATION.expectedOrderId || value.unexpectedOrigins?.length) throw new Error("Real notification-click navigation did not match the exact reviewed contract.");
  return { passed: true, origin: value.origin, path: value.path, orderId: value.orderId };
}

export function verifyPrerequisiteEvidence(repoRoot) {
  const root = path.join(repoRoot, "secure/restaurant-vercel-browser-notification-qualification", CLICK_QUALIFICATION.prerequisiteQualification.id);
  const manifest = path.join(root, "evidence-manifest.tsv"), terminal = path.join(root, "terminal-result.json");
  if (sha256(fs.readFileSync(manifest)) !== CLICK_QUALIFICATION.prerequisiteQualification.manifestSha256 || sha256(fs.readFileSync(terminal)) !== CLICK_QUALIFICATION.prerequisiteQualification.terminalSha256) throw new Error("Prerequisite notification evidence changed.");
  const value = JSON.parse(fs.readFileSync(terminal, "utf8"));
  if (value.notifications?.foreground !== "PASS" || value.notifications?.background !== "PASS" || value.cleanup?.token !== "PASS" || value.cleanup?.browser !== "PASS" || value.cleanup?.bypass !== "PASS" || value.productionTouched !== false || value.http429Observed !== false) throw new Error("Prerequisite notification qualification is incomplete.");
  return true;
}
