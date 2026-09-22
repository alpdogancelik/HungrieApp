#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const sha256 = relative => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const staging = read("scripts/qualify-restaurant-earnings-phase5-staging.mjs");
const hosted = read("scripts/qualify-restaurant-earnings-phase5-hosted.mjs");
const ui = read("scripts/qualify-restaurant-earnings-phase5-ui.mjs");

const required = [
  [staging.includes('const expectedSupabase = "rlrfvqskzvpysewdxqcr"'), "exact Staging Supabase guard"],
  [staging.includes('const rejectedDevelopment = "rgjlsjwsitbnwoetmidb"'), "Development rejection"],
  [staging.includes('const expectedFirebase = "hungrieapp-a2288"'), "shared non-production Firebase guard"],
  [staging.includes('const expectedVercelProject = "prj_aCnq7HJXVEdrh0l40DDSCavVVPlz"'), "Admin Vercel project guard"],
  [staging.includes('const expectedEasProject = "a2d5538b-bd0c-4205-8153-ba08a3a9b2b1"'), "Restaurant EAS project guard"],
  [staging.includes('const migrationSha256 = "bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94"'), "accepted migration checksum"],
  [staging.includes("there is no default"), "no implicit environment"],
  [hosted.includes("expectedSourceSha256"), "checksum-pinned hosted harness reuse"],
  [ui.includes("expectedSourceSha256"), "checksum-pinned UI harness reuse"],
  [!hosted.includes("session_replication_role"), "no broad trigger bypass"],
  [!hosted.includes("DISABLE TRIGGER ALL"), "no all-trigger bypass"],
  [ui.includes("hungrie-admin-web-phase1.vercel.app"), "approved Admin alias"],
  [ui.includes("hungrie-restaurant--staging.expo.app"), "approved Restaurant Staging alias"],
];
const failed = required.filter(([ok]) => !ok).map(([, label]) => label);
if (failed.length) throw new Error(`Phase 5 static contract check failed: ${failed.join(", ")}`);

const protectedFiles = {
  migration: "supabase/migrations/20260922100000_restaurant_earnings_admin_commission.sql",
  generatedTypes: "packages/database-types/src/database.generated.ts",
  domain: "packages/domain/src/index.ts",
  lockfile: "package-lock.json",
};
const hashes = Object.fromEntries(Object.entries(protectedFiles).map(([name, file]) => [name, sha256(file)]));
if (hashes.migration !== "bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94") throw new Error("Accepted migration changed.");
if (hashes.generatedTypes !== "337a0f937c232354dd264e77ac05ade18f8f52244317abf918b74d3016360b37") throw new Error("Accepted generated types changed.");
if (hashes.domain !== "8364c546cbd3d08bbdca40d89993d888107070375eed57243241f99fe6a418fe") throw new Error("Accepted shared domain contract changed.");
if (hashes.lockfile !== "784150a7b56cfe45c137673fa3fe52d131c1af6aa4b15426d1b14a71aca96155") throw new Error("Accepted lockfile changed.");

console.log(JSON.stringify({ passed: true, checks: required.length, protectedHashes: hashes }));
