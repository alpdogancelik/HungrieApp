#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "scripts", "qualify-restaurant-earnings-phase4-hosted.mjs");
const expectedSourceSha256 = "d21bf7d2345da508d2809ff112ccdea10d498cdf7d00c5f636700243ccc30fb6";
const source = fs.readFileSync(sourcePath, "utf8");
const actualSourceSha256 = crypto.createHash("sha256").update(source).digest("hex");
if (actualSourceSha256 !== expectedSourceSha256) throw new Error("Accepted Phase 4 hosted harness changed; Phase 5 reuse requires review.");

const runId = process.argv.find(value => value.startsWith("--run-id="))?.slice(9);
if (!/^earnp5_[a-z0-9]{8,32}$/.test(runId || "")) throw new Error("Canonical Phase 5 run ID required.");

let staged = source
  .replace('const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");', `const root = ${JSON.stringify(root)};`)
  .replaceAll("earnp4", "earnp5")
  .replaceAll("Earnp4", "Earnp5")
  .replaceAll("Phase 4", "Phase 5")
  .replaceAll("phase4", "phase5")
  .replaceAll("development", "staging")
  .replaceAll("Development", "Staging")
  // Firebase is intentionally shared across non-production environments; reuse
  // the reviewed web app configuration only after the generated harness verifies
  // its exact project ID against the approved shared Firebase project.
  .replace("admin-firebase-web-staging.local.json", "admin-firebase-web-development.local.json");

const unsafeTargetGuard = 'if (!project?.ref || !project.url || !project.publishableKey || project.name !== "HungrieApp Staging" || project.ref === registry.projects?.staging?.ref || project.ref === registry.projects?.production?.ref) throw new Error("Exact isolated Staging target required.");';
const safeTargetGuard = 'if (!project?.ref || !project.url || !project.publishableKey || project.name !== "HungrieApp Staging" || project.ref !== "rlrfvqskzvpysewdxqcr" || project.ref === registry.projects?.development?.ref || project.ref === registry.projects?.production?.ref) throw new Error("Exact isolated Staging target required.");';
if (!staged.includes(unsafeTargetGuard)) throw new Error("Phase 5 target-guard transformation did not match reviewed source.");
staged = staged.replace(unsafeTargetGuard, safeTargetGuard);

const runDirectory = path.join(root, "secure", "restaurant-earnings-admin-commission-phase5", runId);
fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
fs.chmodSync(runDirectory, 0o700);
const generatedPath = path.join(runDirectory, "phase5-hosted-harness.mjs");
fs.writeFileSync(generatedPath, staged, { mode: 0o600 });
fs.chmodSync(generatedPath, 0o600);
await import(`${pathToFileURL(generatedPath).href}?v=${actualSourceSha256}`);
