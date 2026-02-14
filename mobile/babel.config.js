module.exports = function (api) {
    // Ensure Expo Router knows where the app directory is, especially for web bundling.
    process.env.EXPO_ROUTER_APP_ROOT = "./app";

    api.cache(true);
    return {
        presets: [
            ["babel-preset-expo", { jsxImportSource: "nativewind" }],
            "nativewind/babel",
        ],
        plugins: [
            // Reanimated plugin must be last.
            require.resolve("react-native-reanimated/plugin"),
        ],
    };
};
