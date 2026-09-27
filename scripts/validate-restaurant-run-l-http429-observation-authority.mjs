#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const CONTRACT = Object.freeze({
  schemaVersion: 1,
  kind: "restaurant_http429_read_only_observation",
  observationId: "ruip6ao_20260927a",
  deploymentId: "qi1cdfilti",
  origin: "https://hungrie-restaurant--qi1cdfilti.expo.app",
  baseCheckpoint: "8800dc04967f3c6b34418c7c6a507ce90b32c784",
  baseSourceManifestSha256: "60c678761aa4da6b6de29311237851cd5bb99a87d11ed939626a0eba989ef90c",
  proposalPath: "docs/restaurant-run-l-http429-read-only-observation-proposal.md",
  proposalSha256: "7c6328dae803cece8e070762950537af966297242c23609fe82e36278095fbd8",
  applicationTree: "7430599b150adbd19ddafadce1195f1e418daf8a",
  artifactManifestPath: "docs/restaurant-expo-alias-staging-public-build-input-evidence/candidate-artifact-manifest.json",
  artifactManifestFileSha256: "406dbf42ba8c9fefb4f37c3edc36bbbfd24240ff242eae0e4c1d6ba1d66b41b1",
  acceptedArtifactManifestSha256: "d3af007214f8fd5cf200dbe8e81cef33a32d98e0fb889e63596dae856ac39e89",
  protectedRunLManifestPath: "secure/restaurant-alias-diagnostic/ruip6ad_20260927l/evidence-manifest.tsv",
  protectedRunLManifestSha256: "d9c2a388f3a9abcc0bdf1d97998614f691bb16c28b3519eb2d253a6633a53f7c",
  evidenceDirectory: "secure/restaurant-alias-http-observation/ruip6ao_20260927a",
  authorityDirectory: "secure/restaurant-alias-http-observation-authority",
  checkpointFiles: Object.freeze([
    "scripts/observe-restaurant-run-l-http429-read-only.mjs",
    "scripts/test-restaurant-run-l-http429-read-only.mjs",
    "scripts/validate-restaurant-run-l-http429-observation-authority.mjs",
  ]),
  limits: Object.freeze({
    chromeProfiles: 1,
    documentLoads: 2,
    browserSameOriginRequestStarts: 40,
    directGetRequests: 6,
    totalSameOriginRequestStarts: 46,
    directGetConcurrency: 1,
    retries: 0,
    observationDurationMs: 120000,
    authorityValidityMs: 7200000,
  }),
  resources: Object.freeze([
    Object.freeze({ path: "/_expo/static/css/components-1d9997ebe14e7e299d7e1eea098e7abf.css", bytes: 31975, sha256: "2cbc79f312e949a6beefb894a99b302a31bb78c86bd42546407b89f718acf80e" }),
    Object.freeze({ path: "/assets/__node_modules/@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.74f9bb7405caec741a24db735b2c5733.ttf", bytes: 56344, sha256: "20ccb90498d8ca511bb0be31a74eccd5f29fbe1161852ef72781b703929e98ec" }),
    Object.freeze({ path: "/assets/__node_modules/@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.7da0c1626a365ce0164d2ae4ebb0573b.ttf", bytes: 56376, sha256: "568dafd2db3728534b42c064e63ed1ff45ec97739bc21e407123dfddcb2ad255" }),
    Object.freeze({ path: "/assets/__node_modules/@expo-google-fonts/dm-sans/600SemiBold/DMSans_600SemiBold.b68921520b1d885dd7f854427cde3e82.ttf", bytes: 56336, sha256: "b3ee9c6f271318066adae56c3033e6e4192f88f5d127cb507686d89a0a269168" }),
    Object.freeze({ path: "/assets/__node_modules/@expo-google-fonts/outfit/600SemiBold/Outfit_600SemiBold.fff3440ed39188f5d5bf85305e8b6be8.ttf", bytes: 55492, sha256: "030d373c4e2a67d5e922a2694e1eaab3b9f1208f1301dba94a70bdebf52c1efa" }),
    Object.freeze({ path: "/assets/__node_modules/@expo-google-fonts/outfit/700Bold/Outfit_700Bold.91486df4e5279497efb060b0d3cc797b.ttf", bytes: 55392, sha256: "6654b93d21301ec61887d3cedd6c11d9df1b1dfb63f9cf45ac7995f6e2235ab1" }),
  ]),
});

export const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const exactKeys = (value, expected, label) => {
  const actual = Object.keys(value || {}).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error(`${label} fields differ from the reviewed schema.`);
};

export function buildSourceManifest(repoRoot, commit, spawn = spawnSync) {
  const tree = spawn("git", ["ls-tree", "-r", "--name-only", "-z", commit], { cwd: repoRoot, encoding: null, maxBuffer: 128 * 1024 * 1024 });
  if (tree.status !== 0) throw new Error("Unable to enumerate checkpoint.");
  const files = tree.stdout.toString("utf8").split("\0").filter(Boolean).sort();
  const lines = files.map(relative => {
    const blob = spawn("git", ["show", `${commit}:${relative}`], { cwd: repoRoot, encoding: null, maxBuffer: 128 * 1024 * 1024 });
    if (blob.status !== 0) throw new Error(`Unable to read checkpoint blob: ${relative}.`);
    return `${sha256(blob.stdout)}\t${blob.stdout.length}\t${relative}\n`;
  });
  const bytes = Buffer.from(lines.join(""));
  return { commit, files: files.length, bytes, sha256: sha256(bytes) };
}

function git(repoRoot, args, spawn = spawnSync, encoding = "utf8") {
  const result = spawn("git", args, { cwd: repoRoot, encoding, maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Git verification failed: ${args.join(" ")}.`);
  return result.stdout;
}

function commitBlobSha(repoRoot, commit, relative, spawn = spawnSync) {
  const value = git(repoRoot, ["show", `${commit}:${relative}`], spawn, null);
  return sha256(Buffer.isBuffer(value) ? value : Buffer.from(value));
}

export function verifyProtectedManifest(repoRoot) {
  const manifest = path.join(repoRoot, CONTRACT.protectedRunLManifestPath);
  if (!fs.existsSync(manifest) || sha256(fs.readFileSync(manifest)) !== CONTRACT.protectedRunLManifestSha256) throw new Error("Protected run-L manifest changed.");
  const root = path.dirname(manifest);
  const rows = fs.readFileSync(manifest, "utf8").trim().split("\n").filter(Boolean);
  if (rows.length !== 31) throw new Error("Protected run-L manifest is incomplete.");
  for (const row of rows) {
    const [expected, bytes, relative] = row.split("\t");
    const file = path.join(root, relative);
    if (!/^[a-f0-9]{64}$/.test(expected || "") || !fs.existsSync(file)) throw new Error(`Protected run-L file missing: ${relative}.`);
    const content = fs.readFileSync(file);
    if (content.length !== Number(bytes) || sha256(content) !== expected) throw new Error(`Protected run-L file changed: ${relative}.`);
  }
  return { passed: true, files: rows.length, manifestSha256: CONTRACT.protectedRunLManifestSha256 };
}

export function validateOwnerApproval(value, now = Date.now()) {
  const fields = ["schemaVersion", "kind", "decision", "approvedForHostedReadOnlyObservation", "observationId", "issuedAt", "expiresAt", "authorizationText", "authorizationTextSha256", "sourceCommit", "sourceManifestSha256", "proposalSha256", "operatorSha256", "validatorSha256", "deploymentId", "origin", "evidenceDirectory", "resources", "limits", "allowedMethods", "allowAuthentication", "allowHostedMutation"];
  exactKeys(value, fields, "Owner approval");
  if (value.schemaVersion !== 1 || value.kind !== CONTRACT.kind || value.decision !== "APPROVE_HTTP429_READ_ONLY_OBSERVATION" || value.approvedForHostedReadOnlyObservation !== true) throw new Error("Explicit read-only observation approval is required.");
  if (value.observationId !== CONTRACT.observationId || value.proposalSha256 !== CONTRACT.proposalSha256 || value.deploymentId !== CONTRACT.deploymentId || value.origin !== CONTRACT.origin || value.evidenceDirectory !== CONTRACT.evidenceDirectory) throw new Error("Owner approval identity mismatch.");
  if (!/^[a-f0-9]{40}$/.test(value.sourceCommit || "") || !/^[a-f0-9]{64}$/.test(value.sourceManifestSha256 || "") || !/^[a-f0-9]{64}$/.test(value.operatorSha256 || "") || !/^[a-f0-9]{64}$/.test(value.validatorSha256 || "")) throw new Error("Owner approval checkpoint or executable digest is invalid.");
  if (JSON.stringify(value.resources) !== JSON.stringify(CONTRACT.resources) || JSON.stringify(value.limits) !== JSON.stringify(CONTRACT.limits)) throw new Error("Owner approval resource or request limits differ from the reviewed contract.");
  if (JSON.stringify(value.allowedMethods) !== JSON.stringify(["GET"]) || value.allowAuthentication !== false || value.allowHostedMutation !== false) throw new Error("Owner approval grants an unauthorized capability.");
  if (value.authorizationTextSha256 !== sha256(Buffer.from(value.authorizationText || "")) || !value.authorizationText.includes(CONTRACT.observationId) || !value.authorizationText.includes(CONTRACT.deploymentId) || !/read-only/i.test(value.authorizationText) || !/no (?:hosted )?mutation/i.test(value.authorizationText)) throw new Error("Owner authorization text or digest is invalid.");
  const issued = Date.parse(value.issuedAt), expires = Date.parse(value.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued !== CONTRACT.limits.authorityValidityMs || now < issued || now >= expires) throw new Error("Owner approval is not currently valid for exactly two hours.");
  return value;
}

export function verifyCheckpoint({ repoRoot, approval, spawn = spawnSync }) {
  const head = String(git(repoRoot, ["rev-parse", "HEAD"], spawn)).trim();
  if (head !== approval.sourceCommit) throw new Error("Repository HEAD is not the approved observation checkpoint.");
  const parent = String(git(repoRoot, ["rev-parse", `${head}^`], spawn)).trim();
  if (parent !== CONTRACT.baseCheckpoint) throw new Error("Observation checkpoint is not a direct child of the reviewed base.");
  const inventory = String(git(repoRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", head], spawn)).trim().split("\n").filter(Boolean).sort();
  if (JSON.stringify(inventory) !== JSON.stringify([...CONTRACT.checkpointFiles].sort())) throw new Error("Observation checkpoint inventory differs from the reviewed scope.");
  const manifest = buildSourceManifest(repoRoot, head, spawn);
  if (manifest.sha256 !== approval.sourceManifestSha256) throw new Error("Approved source manifest was not reproduced.");
  const applicationTree = String(git(repoRoot, ["rev-parse", "HEAD:apps/restaurant"], spawn)).trim();
  if (applicationTree !== CONTRACT.applicationTree) throw new Error("Restaurant application tree changed.");
  if (commitBlobSha(repoRoot, head, CONTRACT.proposalPath, spawn) !== CONTRACT.proposalSha256) throw new Error("Observation proposal changed.");
  if (commitBlobSha(repoRoot, head, CONTRACT.artifactManifestPath, spawn) !== CONTRACT.artifactManifestFileSha256) throw new Error("Accepted artifact manifest file changed.");
  const operator = "scripts/observe-restaurant-run-l-http429-read-only.mjs";
  const validator = "scripts/validate-restaurant-run-l-http429-observation-authority.mjs";
  if (commitBlobSha(repoRoot, head, operator, spawn) !== approval.operatorSha256 || commitBlobSha(repoRoot, head, validator, spawn) !== approval.validatorSha256) throw new Error("Approved executable digest mismatch.");
  verifyProtectedManifest(repoRoot);
  return { passed: true, head, parent, inventory, manifest };
}

export function prepareAuthority({ repoRoot, approval, outputDirectory, now = Date.now(), spawn = spawnSync }) {
  validateOwnerApproval(approval, now);
  const checkpoint = verifyCheckpoint({ repoRoot, approval, spawn });
  const expectedDirectory = path.join(repoRoot, CONTRACT.authorityDirectory);
  if (path.resolve(outputDirectory) !== expectedDirectory) throw new Error("Authority output directory differs from the reviewed exclusive path.");
  fs.mkdirSync(expectedDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(expectedDirectory, 0o700);
  const authorityPath = path.join(expectedDirectory, `${CONTRACT.observationId}-authority.json`);
  const manifestPath = path.join(expectedDirectory, `${CONTRACT.observationId}-source-manifest.tsv`);
  if (fs.existsSync(authorityPath) || fs.existsSync(manifestPath) || fs.existsSync(path.join(repoRoot, CONTRACT.evidenceDirectory))) throw new Error("Observation authority or evidence path already exists; reuse is prohibited.");
  const authority = { ...approval, ownerApprovalSha256: sha256(Buffer.from(canonical(approval))) };
  const writeExclusive = (file, bytes) => {
    const descriptor = fs.openSync(file, "wx", 0o600);
    try { fs.writeFileSync(descriptor, bytes); } finally { fs.closeSync(descriptor); }
    fs.chmodSync(file, 0o600);
  };
  try {
    writeExclusive(manifestPath, checkpoint.manifest.bytes);
    writeExclusive(authorityPath, canonical(authority));
  } catch (error) {
    throw new Error(`Exclusive authority preparation failed: ${error.message}`);
  }
  return { authorityPath, manifestPath, authoritySha256: sha256(fs.readFileSync(authorityPath)), sourceManifestSha256: checkpoint.manifest.sha256 };
}

export function validatePreparedAuthority({ repoRoot, authorityPath, sourceManifestPath, now = Date.now(), spawn = spawnSync }) {
  const authority = JSON.parse(fs.readFileSync(authorityPath, "utf8"));
  const { ownerApprovalSha256, ...approval } = authority;
  if (ownerApprovalSha256 !== sha256(Buffer.from(canonical(approval)))) throw new Error("Prepared authority approval digest mismatch.");
  validateOwnerApproval(approval, now);
  const checkpoint = verifyCheckpoint({ repoRoot, approval, spawn });
  if (path.resolve(authorityPath) !== path.join(repoRoot, CONTRACT.authorityDirectory, `${CONTRACT.observationId}-authority.json`)) throw new Error("Authority path mismatch.");
  if (path.resolve(sourceManifestPath) !== path.join(repoRoot, CONTRACT.authorityDirectory, `${CONTRACT.observationId}-source-manifest.tsv`) || sha256(fs.readFileSync(sourceManifestPath)) !== approval.sourceManifestSha256 || !fs.readFileSync(sourceManifestPath).equals(checkpoint.manifest.bytes)) throw new Error("Prepared source manifest mismatch.");
  if (fs.existsSync(path.join(repoRoot, CONTRACT.evidenceDirectory))) throw new Error("Observation evidence directory already exists; replay prohibited.");
  return { authority, approval, checkpoint };
}
