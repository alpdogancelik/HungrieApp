module.exports = function (api) {
    api.cache(true);
    return {
        presets: [
            ["babel-preset-expo", { jsxImportSource: "nativewind" }],
            "nativewind/babel",
        ],
        plugins: [
            // Keep only Reanimated to avoid duplicate worklet plugins during web bundling.
            require.resolve("react-native-reanimated/plugin"),
        ],
    };
};
