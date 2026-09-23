#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const digest = relative => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const utility = read("scripts/qualify-restaurant-earnings-phase4-development.mjs");
const contract = read("scripts/restaurant-earnings-phase4-contract.mjs");

const expectedHashes = {
  "package-lock.json": "20fcf6107b097abeb0d1dfb7e4c2d56cba0a7428ce2dc357b06b19f7896f6e33",
  "packages/database-types/src/database.generated.ts": "337a0f937c232354dd264e77ac05ade18f8f52244317abf918b74d3016360b37",
  "packages/domain/src/index.ts": "8364c546cbd3d08bbdca40d89993d888107070375eed57243241f99fe6a418fe",
  "supabase/migrations/20260922100000_restaurant_earnings_admin_commission.sql": "bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94",
  "apps/admin-web/components/AdminRestaurantCommissionPage.tsx": "bccfd9c1d8112ee8f1dfd90dbd87a5f9dc0f231584369d60e526802236cc95d4",
  "apps/admin-web/lib/commissionManagementModel.ts": "6e24854bbcc1f8b7fe40619d9def0f89cc6eb8ce162e1a8965ff2aaa3b9dee60",
  "apps/admin-web/lib/commissionRepository.ts": "b385d5a3a74d89ac778fa01ad1cca2e73c57a7d30d704839b7395b9e87a75a68",
};

const failures = [];
for (const [file, expected] of Object.entries(expectedHashes)) if (digest(file) !== expected) failures.push(`${file} protected hash changed`);
for (const required of ["--environment", "--run-id", "--expect-sha256", "--confirm", "backup", "preflight", "apply", "verify-cleanup", "transaction read only", "capabilityEnabled: false"]) {
  if (!utility.includes(required) && !contract.includes(required)) failures.push(`missing guard: ${required}`);
}
for (const forbidden of ["session_replication_role", "DISABLE TRIGGER ALL", "DISABLE TRIGGER USER"]) {
  if (utility.includes(forbidden) || contract.includes(forbidden)) failures.push(`forbidden broad cleanup bypass: ${forbidden}`);
}
if (!utility.includes("response withheld") || !utility.includes("output withheld")) failures.push("hosted error redaction guards missing");

if (failures.length) {
  console.error(JSON.stringify({ passed: false, failures }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ passed: true, protectedHashes: Object.keys(expectedHashes).length, explicitEnvironment: true, checksumPinned: true, broadTriggerBypassAbsent: true, hostedErrorsRedacted: true }));
}
