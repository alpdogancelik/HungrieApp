const { withNativeWind } = require("nativewind/metro");
const { getDefaultConfig } = require("expo/metro-config");
const { withSentryConfig } = require("@sentry/react-native/metro");
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

const existingEnhanceMiddleware = baseConfig.server?.enhanceMiddleware;
baseConfig.server = {
    ...(baseConfig.server || {}),
    enhanceMiddleware: (middleware, metroServer) => {
        const enhanced = existingEnhanceMiddleware
            ? existingEnhanceMiddleware(middleware, metroServer)
            : middleware;

        return (request, response, next) => {
            // In an Expo workspace, React Native development clients may encode
            // the percent signs in Metro's `unstable_path` asset query a second
            // time. Decode that query layer only; ordinary URLs are untouched.
            if (request.url?.includes("unstable_path=") && /%25(?:2f|3f|3d|26)/i.test(request.url)) {
                request.url = request.url.replace(/%25(2f|3f|3d|26)/gi, "%$1");
            }
            return enhanced(request, response, next);
        };
    },
};

const nativeWindInput = fs.realpathSync(path.join(projectRoot, "app", "globals.css"));
const nativeWindTailwindConfig = fs.realpathSync(path.join(projectRoot, "tailwind.config.js"));

const nativeWindConfig = withNativeWind(baseConfig, {
    input: nativeWindInput,
    configPath: nativeWindTailwindConfig,
    disableTypeScriptGeneration: true,
});

const sentryEnabled = String(process.env.EXPO_PUBLIC_SENTRY_ENABLED || "false") === "true";

module.exports = sentryEnabled
    ? withSentryConfig(nativeWindConfig, {
          includeWebReplay: false,
          enableSourceContextInDevelopment: false,
      })
    : nativeWindConfig;
