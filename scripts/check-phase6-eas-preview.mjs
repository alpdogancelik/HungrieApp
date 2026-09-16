#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedPath = path.join(root, "secure", "eas-staging.env");
if (!fs.existsSync(expectedPath)) throw new Error("Generate the restricted Staging EAS environment first.");
const expected = Object.fromEntries(fs.readFileSync(expectedPath, "utf8").split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)]; }));
const required = Object.keys(expected).filter((name) => name !== "EXPO_PUBLIC_SENTRY_DSN" || expected[name]);
const missing = required.filter((name) => !(name in process.env));
const mismatched = required.filter((name) => name in process.env && process.env[name] !== expected[name]);
if (missing.length || mismatched.length) {
  throw new Error(`EAS Preview differs from the reviewed Staging environment. Missing: ${missing.join(", ") || "none"}; mismatched: ${mismatched.join(", ") || "none"}.`);
}
console.log(JSON.stringify({ environment: "preview", checkedVariables: required.length, exactMatch: true, secretsLogged: false }));
