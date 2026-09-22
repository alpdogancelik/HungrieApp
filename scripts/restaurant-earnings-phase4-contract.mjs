import crypto from "node:crypto";

export const PHASE4_MIGRATION = "20260922100000_restaurant_earnings_admin_commission.sql";
export const PHASE4_MIGRATION_SHA256 = "bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94";
export const PHASE4_FIREBASE_PROJECT = "hungrieapp-a2288";
export const PHASE4_PREFIX_PATTERN = /^earnp4_[a-z0-9]{8,32}$/;
export const PHASE4_ACTIONS = new Set(["backup", "preflight", "apply", "verify-cleanup"]);

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function validateRunId(value) {
  if (!PHASE4_PREFIX_PATTERN.test(value || "")) {
    throw new Error("A unique earnp4_<8-32 lowercase letters or digits> run ID is required.");
  }
  return value;
}

export function expectedBaseline(localMigrationNames) {
  const ordered = [...localMigrationNames].filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort();
  const targetIndex = ordered.indexOf(PHASE4_MIGRATION);
  if (targetIndex < 0) throw new Error("The accepted Phase 1 migration is missing.");
  return ordered.slice(0, targetIndex).map((name) => name.slice(0, 14));
}

export function inspectMigrationHistory(localMigrationNames, remoteVersions) {
  const baseline = expectedBaseline(localMigrationNames);
  const remote = remoteVersions.map(String);
  const sameBaseline = baseline.length === remote.length && baseline.every((version, index) => version === remote[index]);
  const applied = new Set(remote);
  const pending = [...localMigrationNames]
    .filter((name) => /^\d{14}_.+\.sql$/.test(name) && !applied.has(name.slice(0, 14)))
    .sort();
  return {
    passed: sameBaseline && pending.length === 1 && pending[0] === PHASE4_MIGRATION,
    expectedCount: baseline.length,
    actualCount: remote.length,
    expectedLatest: baseline.at(-1) || null,
    actualLatest: remote.at(-1) || null,
    pending,
    missingBaselineVersions: baseline.filter((version) => !applied.has(version)),
    unexpectedRemoteVersions: remote.filter((version) => !baseline.includes(version)),
  };
}

export function validateEnvironment({ development, staging, production, metadata, firebaseProjectId, credentialProjectId }) {
  if (!development?.ref || development.name !== "HungrieApp Development" || metadata?.id !== development.ref) {
    throw new Error("The approved Development Supabase identity did not resolve exactly.");
  }
  if (development.ref === staging?.ref || development.ref === production?.ref) {
    throw new Error("Development is not isolated from Staging or Production.");
  }
  if (metadata.status !== "ACTIVE_HEALTHY") throw new Error("Development is not healthy.");
  if (firebaseProjectId !== PHASE4_FIREBASE_PROJECT || credentialProjectId !== PHASE4_FIREBASE_PROJECT) {
    throw new Error("The approved non-production Firebase identity did not resolve exactly.");
  }
  return true;
}

export function validateManifest(manifest, { projectRef, runId, now = Date.now(), requireFiles = true }) {
  if (manifest?.environment !== "development" || manifest.projectRef !== projectRef || manifest.runId !== runId) {
    throw new Error("The protected Phase 4 manifest identity does not match this run.");
  }
  const createdAt = Date.parse(manifest.createdAt);
  if (!Number.isFinite(createdAt) || now - createdAt < 0 || now - createdAt >= 86_400_000) {
    throw new Error("The protected Phase 4 manifest is missing, future-dated, or at least 24 hours old.");
  }
  if (requireFiles && (!Array.isArray(manifest.files) || manifest.files.length < 3)) {
    throw new Error("The protected Phase 4 backup scope is incomplete.");
  }
  return true;
}

export function sanitizePreflightEvidence({ history, metadata, firebaseProjectId, runId, migrationSha256 }) {
  return {
    capturedAt: new Date().toISOString(),
    environment: "development",
    supabaseProjectRef: metadata.id,
    supabaseStatus: metadata.status,
    supabaseRegion: metadata.region,
    firebaseProjectId,
    runId,
    migration: PHASE4_MIGRATION,
    migrationSha256,
    migrationHistory: history,
    secretsRecorded: false,
  };
}
