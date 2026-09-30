const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const { createDeterministicMetroModuleIdFactory, shouldUseDeterministicMetroModuleIds } = require("./scripts/deterministic-metro-module-ids.cjs");
const deterministicModuleMap = require("./scripts/deterministic-metro-module-map.json");

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, "../..");
if (shouldUseDeterministicMetroModuleIds()) {
  config.serializer.createModuleIdFactory = () => createDeterministicMetroModuleIdFactory(workspaceRoot, deterministicModuleMap.modules);
}

module.exports = config;
