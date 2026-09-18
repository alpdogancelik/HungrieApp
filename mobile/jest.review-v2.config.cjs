module.exports = {
  preset: "jest-expo",
  testEnvironment: "node",
  testMatch: ["**/*Phase4.test.ts", "**/*Phase4.test.tsx", "**/*Phase5.test.ts", "**/*Phase5.test.tsx"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  transform: { "^.+\\.[jt]sx?$": ["babel-jest", { configFile: "./babel.review-v2.config.cjs" }] },
  clearMocks: true,
};
