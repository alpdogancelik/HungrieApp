#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STAGING_BUILD_INPUT_CONTRACT_PATH = "docs/restaurant-expo-alias-staging-public-build-input-contract.json";
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value, null, 2) + "\n";

function exactKeys(value, expected, label) {
  if (JSON.stringify(Object.keys(value || {}).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} fields differ from the reviewed schema.`);
}

export function loadStagingBuildInputContract({ root, contractPath = STAGING_BUILD_INPUT_CONTRACT_PATH } = {}) {
  if (!root) throw new Error("Repository root is required.");
  const absolute = path.resolve(root, contractPath);
  const bytes = fs.readFileSync(absolute);
  const value = JSON.parse(bytes);
  exactKeys(value, ["schemaVersion", "identity", "environment", "easEnvironment", "easProjectId", "firebaseProjectId", "supabaseProjectRef", "variables", "sourceReferences"], "Build-input contract");
  if (value.schemaVersion !== 1 || value.identity !== "restaurant-staging-preview-public-build-inputs-v1" || value.environment !== "staging" || value.easEnvironment !== "preview" || value.easProjectId !== "a2d5538b-bd0c-4205-8153-ba08a3a9b2b1" || value.firebaseProjectId !== "hungrieapp-a2288" || value.supabaseProjectRef !== "rlrfvqskzvpysewdxqcr") throw new Error("Build-input environment identity mismatch.");
  if (!Array.isArray(value.variables) || value.variables.length !== 9) throw new Error("Exactly nine reviewed public build inputs are required.");
  const names = value.variables.map(row => row.name);
  if (new Set(names).size !== names.length || JSON.stringify(names) !== JSON.stringify([...names].sort())) throw new Error("Build-input names must be unique and sorted.");
  for (const row of value.variables) {
    exactKeys(row, ["name", "utf8Bytes", "sha256"], `Build input ${row.name || "unknown"}`);
    if (!/^EXPO_PUBLIC_[A-Z0-9_]+$/.test(row.name || "") || !Number.isSafeInteger(row.utf8Bytes) || row.utf8Bytes < 1 || !/^[a-f0-9]{64}$/.test(row.sha256 || "")) throw new Error("Build-input fingerprint is invalid.");
  }
  if (JSON.stringify(Object.keys(value.sourceReferences).sort()) !== JSON.stringify(names)) throw new Error("Build-input source reference set differs from the reviewed variables.");
  return { path: absolute, bytes, sha256: sha256(bytes), value };
}

export function discoverRestaurantPublicBuildInputs({ root, sourceReferences }) {
  const discovered = new Map();
  for (const [name, relatives] of Object.entries(sourceReferences)) {
    if (!Array.isArray(relatives) || relatives.length < 1) throw new Error(`Source references are missing for ${name}.`);
    for (const relative of relatives) {
      const absolute = path.resolve(root, relative);
      if (!absolute.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(absolute)) throw new Error(`Reviewed source reference is missing for ${name}.`);
      const matches = fs.readFileSync(absolute, "utf8").match(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g) || [];
      for (const match of matches) {
        const found = match.slice("process.env.".length);
        if (!discovered.has(found)) discovered.set(found, new Set());
        discovered.get(found).add(path.relative(root, absolute).split(path.sep).join("/"));
      }
    }
  }
  return Object.fromEntries([...discovered].sort(([a], [b]) => Buffer.from(a).compare(Buffer.from(b))).map(([name, files]) => [name, [...files].sort()]));
}

export function validateStagingPublicBuildInputs({ root, environment = process.env, contractPath = STAGING_BUILD_INPUT_CONTRACT_PATH } = {}) {
  const contract = loadStagingBuildInputContract({ root, contractPath });
  const discovered = discoverRestaurantPublicBuildInputs({ root, sourceReferences: contract.value.sourceReferences });
  if (JSON.stringify(discovered) !== JSON.stringify(contract.value.sourceReferences)) throw new Error("Restaurant public build-input source references differ from the reviewed contract.");
  const observations = contract.value.variables.map(row => {
    const value = environment[row.name];
    if (typeof value !== "string" || value.length === 0) throw new Error(`Required public build input is missing: ${row.name}.`);
    const bytes = Buffer.from(value, "utf8");
    const digest = sha256(bytes);
    if (bytes.length !== row.utf8Bytes || digest !== row.sha256) throw new Error(`Public build input differs from the reviewed Staging value: ${row.name}.`);
    return { name: row.name, utf8Bytes: bytes.length, sha256: digest, passed: true };
  });
  return { schemaVersion: 1, passed: true, environment: contract.value.environment, easEnvironment: contract.value.easEnvironment, easProjectId: contract.value.easProjectId, firebaseProjectId: contract.value.firebaseProjectId, supabaseProjectRef: contract.value.supabaseProjectRef, contractSha256: contract.sha256, observations };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(import.meta.dirname, "..");
    const result = validateStagingPublicBuildInputs({ root });
    process.stdout.write(canonical(result));
  } catch (error) {
    process.stderr.write(canonical({ passed: false, error: { name: error?.name || "Error", message: String(error?.message || "Build-input validation failed.").slice(0, 300) } }));
    process.exitCode = 1;
  }
}
