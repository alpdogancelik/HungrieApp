#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "scripts", "qualify-restaurant-earnings-phase4-ui.mjs");
const expectedSourceSha256 = "fc47e7e95f2d63dcf5b631498ed23f8f21c0c4257d044e4c1cd35da8e9e78261";
const source = fs.readFileSync(sourcePath, "utf8");
const actualSourceSha256 = crypto.createHash("sha256").update(source).digest("hex");
if (actualSourceSha256 !== expectedSourceSha256) throw new Error("Accepted Phase 4 UI harness changed; Phase 5 reuse requires review.");

const runId = process.argv.find(value => value.startsWith("--run-id="))?.slice(9);
if (!/^earnp5_[a-z0-9]{8,32}$/.test(runId || "")) throw new Error("Canonical Phase 5 run ID required.");

const adminUrl = "https://hungrie-admin-web-phase1.vercel.app";
const restaurantUrl = "https://hungrie-restaurant--staging.expo.app";
let staged = source
  .replace('const root = path.resolve(import.meta.dirname, "..");', `const root = ${JSON.stringify(root)};`)
  .replaceAll("earnp4", "earnp5")
  .replaceAll("Phase 4", "Phase 5")
  .replaceAll("phase4", "phase5")
  .replaceAll("development", "staging")
  .replaceAll("Development", "Staging")
  .replaceAll("http://localhost:3100", adminUrl)
  .replaceAll("http://127.0.0.1:3100", adminUrl)
  .replaceAll("http://localhost:3101", restaurantUrl)
  .replaceAll("http://127.0.0.1:3101", restaurantUrl);

const runDirectory = path.join(root, "secure", "restaurant-earnings-admin-commission-phase5", runId);
fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
fs.chmodSync(runDirectory, 0o700);
const generatedPath = path.join(runDirectory, "phase5-ui-harness.mjs");
fs.writeFileSync(generatedPath, staged, { mode: 0o600 });
fs.chmodSync(generatedPath, 0o600);
await import(`${pathToFileURL(generatedPath).href}?v=${actualSourceSha256}`);
