const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const { createDeterministicMetroModuleIdFactory } = require("./scripts/deterministic-metro-module-ids.cjs");
const deterministicModuleMap = require("./scripts/deterministic-metro-module-map.json");

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, "../..");
config.serializer.createModuleIdFactory = () => createDeterministicMetroModuleIdFactory(workspaceRoot, deterministicModuleMap.modules);

module.exports = config;
