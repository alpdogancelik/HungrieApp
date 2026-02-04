const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

module.exports = [
    {
        ignores: ["**/node_modules/**", "**/dist/**", ".expo/**", "android/**", "ios/**"],
    },
    ...compat.extends("expo"),
    {
        rules: {
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        },
    },
];
