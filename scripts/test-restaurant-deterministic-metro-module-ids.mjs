import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { canonicalMetroModulePath, createDeterministicMetroModuleIdFactory } = require("../apps/restaurant/scripts/deterministic-metro-module-ids.cjs");
const reviewedMap = require("../apps/restaurant/scripts/deterministic-metro-module-map.json");
const workspace = path.resolve(import.meta.dirname, "..");

test("the reviewed production module map is complete, compact, unique, and sorted", () => {
  assert.equal(reviewedMap.schemaVersion, 1);
  assert.equal(reviewedMap.modules.length, 2560);
  assert.equal(new Set(reviewedMap.modules).size, reviewedMap.modules.length);
  assert.deepEqual(reviewedMap.modules, [...reviewedMap.modules].sort((left, right) => Buffer.from(left).compare(Buffer.from(right))));
  const factory = createDeterministicMetroModuleIdFactory(workspace, reviewedMap.modules);
  assert.equal(factory("\0polyfill:assets-registry"), reviewedMap.modules.indexOf("virtual:polyfill:assets-registry"));
  assert.equal(factory(path.join(workspace, "apps/restaurant/app/dashboard.tsx")), reviewedMap.modules.indexOf("workspace:apps/restaurant/app/dashboard.tsx"));
});

test("Metro module IDs are stable across traversal order and workspace location", () => {
  const secondWorkspace = path.join(path.parse(workspace).root, "different-checkout");
  const relative = ["apps/restaurant/app/index.tsx", "node_modules/react/index.js", "packages/domain/src/index.ts"];
  const identities = relative.map(value => `workspace:${value}`).sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  const first = createDeterministicMetroModuleIdFactory(workspace, identities);
  const second = createDeterministicMetroModuleIdFactory(secondWorkspace, identities);
  const firstIds = relative.map(value => first(path.join(workspace, value)));
  const secondIds = [...relative].reverse().map(value => second(path.join(secondWorkspace, value))).reverse();
  assert.deepEqual(firstIds, secondIds);
  assert.deepEqual([...firstIds].sort((left, right) => left - right), [0, 1, 2]);
  assert.equal(new Set(firstIds).size, relative.length);
  assert.ok(firstIds.every(Number.isSafeInteger));
});

test("Metro module identity normalizes separators and rejects outside-workspace paths", () => {
  assert.equal(canonicalMetroModulePath(path.join(workspace, "apps/restaurant/app/index.tsx"), workspace), "workspace:apps/restaurant/app/index.tsx");
  assert.equal(canonicalMetroModulePath("\0polyfill:assets-registry", workspace), "virtual:polyfill:assets-registry");
  assert.throws(() => canonicalMetroModulePath(path.join(path.dirname(workspace), "outside.js"), workspace), /outside the reviewed workspace/);
  assert.throws(() => createDeterministicMetroModuleIdFactory(workspace, ["workspace:z", "workspace:a"]), /unique and sorted/);
  const factory = createDeterministicMetroModuleIdFactory(workspace, ["workspace:apps/restaurant/app/index.tsx"]);
  assert.throws(() => factory(path.join(workspace, "apps/restaurant/app/unknown.tsx")), /absent from the reviewed deterministic map/);
});
