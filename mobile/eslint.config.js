const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

module.exports = [
    {
        ignores: ["**/node_modules/**", "**/dist/**", ".expo/**", "android/**", "ios/**"],
        linterOptions: {
            reportUnusedDisableDirectives: false,
        },
    },
    ...compat.extends("expo"),
    {
        settings: {
            "import/resolver": {
                typescript: {
                    project: "./tsconfig.json",
                    alwaysTryTypes: true,
                },
                node: {
                    extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
                },
            },
        },
        rules: {
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/array-type": "off",
            "@typescript-eslint/no-require-imports": "off",
            "react-hooks/exhaustive-deps": "off",
            "unicode-bom": "off",
        },
    },
];
