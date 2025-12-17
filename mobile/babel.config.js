module.exports = function (api) {
    // Ensure Expo Router knows where the app directory is, especially for web bundling.
    process.env.EXPO_ROUTER_APP_ROOT = "./app";

    api.cache(true);
    return {
        presets: [
            ["babel-preset-expo", { jsxImportSource: "nativewind" }],
            // NativeWind ships a Babel preset (not a plugin), so keep it here to avoid Metro
            // treating the returned preset config as a plugin object.
            "nativewind/babel",
        ],
        plugins: [
            require.resolve("react-native-reanimated/plugin"),
        ],
    };
};
