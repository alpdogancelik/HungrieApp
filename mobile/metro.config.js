const { withNativeWind } = require("nativewind/metro");
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const sharedPath = path.resolve(projectRoot, "..", "shared");

const baseConfig = getDefaultConfig(projectRoot);


if (fs.existsSync(sharedPath)) {
    baseConfig.watchFolders = [...(baseConfig.watchFolders || []), sharedPath];
}
baseConfig.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(projectRoot, "..", "node_modules"),
];

baseConfig.transformer = {
    ...(baseConfig.transformer || {}),
    babelTransformerPath: require.resolve("react-native-svg-transformer"),
};

const assetExts = baseConfig.resolver.assetExts.filter((ext) => ext !== "svg");
const sourceExts = baseConfig.resolver.sourceExts.includes("svg")
    ? baseConfig.resolver.sourceExts
    : [...baseConfig.resolver.sourceExts, "svg"];

baseConfig.resolver.assetExts = assetExts;
baseConfig.resolver.sourceExts = sourceExts;

const nativeWindInput = fs.realpathSync(path.join(projectRoot, "app", "globals.css"));
const nativeWindTailwindConfig = fs.realpathSync(path.join(projectRoot, "tailwind.config.js"));

module.exports = withNativeWind(baseConfig, {
    input: nativeWindInput,
    configPath: nativeWindTailwindConfig,
    disableTypeScriptGeneration: true,
});
