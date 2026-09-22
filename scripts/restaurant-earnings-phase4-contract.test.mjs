import assert from "node:assert/strict";
import test from "node:test";
import {
  PHASE4_MIGRATION,
  inspectMigrationHistory,
  validateEnvironment,
  validateManifest,
  validateRunId,
} from "./restaurant-earnings-phase4-contract.mjs";

const migrations = [
  "20260917100000_a.sql",
  "20260917110000_b.sql",
  "20260918100000_c.sql",
  "20260920170000_d.sql",
  "20260921100000_e.sql",
  PHASE4_MIGRATION,
];

test("canonical Phase 4 run IDs pass and unsafe namespaces fail", () => {
  assert.equal(validateRunId("earnp4_a1b2c3d4"), "earnp4_a1b2c3d4");
  for (const value of ["earnp4_short", "phase4_a1b2c3d4", "earnp4_A1B2C3D4", "earnp4_a1b2c3d4;drop"]) {
    assert.throws(() => validateRunId(value));
  }
});

test("migration gate passes only when earnings is the sole pending migration", () => {
  const result = inspectMigrationHistory(migrations, ["20260917100000", "20260917110000", "20260918100000", "20260920170000", "20260921100000"]);
  assert.equal(result.passed, true);
  assert.deepEqual(result.pending, [PHASE4_MIGRATION]);
});

test("migration gate reports every missing earlier migration", () => {
  const result = inspectMigrationHistory(migrations, ["20260917100000", "20260917110000"]);
  assert.equal(result.passed, false);
  assert.deepEqual(result.missingBaselineVersions, ["20260918100000", "20260920170000", "20260921100000"]);
  assert.deepEqual(result.pending, migrations.slice(2));
});

test("migration gate rejects unexpected remote history", () => {
  const result = inspectMigrationHistory(migrations, ["20260917100000", "20260917110000", "20260918100000", "20260920170000", "20260921100000", "20990101000000"]);
  assert.equal(result.passed, false);
  assert.deepEqual(result.unexpectedRemoteVersions, ["20990101000000"]);
});

test("environment gate accepts only the exact isolated Development and Firebase identities", () => {
  const input = {
    development: { ref: "dev-ref", name: "HungrieApp Development" },
    staging: { ref: "stage-ref" },
    production: { ref: "prod-ref" },
    metadata: { id: "dev-ref", status: "ACTIVE_HEALTHY" },
    firebaseProjectId: "hungrieapp-a2288",
    credentialProjectId: "hungrieapp-a2288",
  };
  assert.equal(validateEnvironment(input), true);
  assert.throws(() => validateEnvironment({ ...input, development: { ...input.development, ref: "stage-ref" } }));
  assert.throws(() => validateEnvironment({ ...input, firebaseProjectId: "production" }));
});

test("backup manifest must be exact, complete, and younger than 24 hours", () => {
  const now = Date.parse("2026-09-22T12:00:00Z");
  const manifest = { environment: "development", projectRef: "dev-ref", runId: "earnp4_a1b2c3d4", createdAt: "2026-09-22T11:00:00Z", files: [{}, {}, {}] };
  assert.equal(validateManifest(manifest, { projectRef: "dev-ref", runId: "earnp4_a1b2c3d4", now }), true);
  assert.throws(() => validateManifest({ ...manifest, createdAt: "2026-09-21T12:00:00Z" }, { projectRef: "dev-ref", runId: "earnp4_a1b2c3d4", now }));
  assert.throws(() => validateManifest({ ...manifest, files: [] }, { projectRef: "dev-ref", runId: "earnp4_a1b2c3d4", now }));
});
