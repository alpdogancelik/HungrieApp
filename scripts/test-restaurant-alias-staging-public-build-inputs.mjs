import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadStagingBuildInputContract, validateStagingPublicBuildInputs } from "./restaurant-alias-staging-public-build-inputs.mjs";

const root = path.resolve(import.meta.dirname, "..");
const secure = JSON.parse(fs.readFileSync(path.join(root, "secure/restaurant-alias-build-inputs/staging-preview.json"), "utf8"));

test("reviewed Staging contract covers every Restaurant public build input without raw values", () => {
  const contract = loadStagingBuildInputContract({ root });
  assert.equal(contract.value.variables.length, 9);
  assert.equal(contract.value.sourceReferences.EXPO_PUBLIC_RESTAURANT_POLL_MS.length, 2);
  assert.doesNotMatch(contract.bytes.toString("utf8"), /AIza|eyJ|B[A-Za-z0-9_-]{80,}/);
});

test("exact reviewed Staging values pass with sanitized fingerprints", () => {
  const result = validateStagingPublicBuildInputs({ root, environment: secure.values });
  assert.equal(result.passed, true);
  assert.equal(result.observations.length, 9);
  assert.ok(result.observations.every(row => !Object.hasOwn(row, "value")));
});

test("each missing or changed public input fails closed", () => {
  for (const name of Object.keys(secure.values)) {
    const missing = { ...secure.values }; delete missing[name];
    assert.throws(() => validateStagingPublicBuildInputs({ root, environment: missing }), new RegExp(name));
    assert.throws(() => validateStagingPublicBuildInputs({ root, environment: { ...secure.values, [name]: secure.values[name] + "x" } }), new RegExp(name));
  }
});

test("contract identity or source-reference drift fails closed", () => {
  const directory = fs.mkdtempSync("/tmp/restaurant-build-input-contract-");
  try {
    const original = loadStagingBuildInputContract({ root }).value;
    const wrongIdentity = path.join(directory, "wrong-identity.json");
    fs.writeFileSync(wrongIdentity, JSON.stringify({ ...original, easProjectId: "wrong" }));
    assert.throws(() => validateStagingPublicBuildInputs({ root, environment: secure.values, contractPath: wrongIdentity }), /identity/i);
    const wrongReferences = path.join(directory, "wrong-references.json");
    fs.writeFileSync(wrongReferences, JSON.stringify({ ...original, sourceReferences: { ...original.sourceReferences, EXPO_PUBLIC_FIREBASE_VAPID_KEY: ["apps/restaurant/src/firebase.ts"] } }));
    assert.throws(() => validateStagingPublicBuildInputs({ root, environment: secure.values, contractPath: wrongReferences }), /source reference/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
