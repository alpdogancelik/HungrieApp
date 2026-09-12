import crypto from "node:crypto";
import fs from "node:fs";

const target = process.env.REVIEW_TARGET;
const expected = process.env.REVIEW_SHA256;
if (target !== "staging" || !/^[a-f0-9]{64}$/.test(expected || "")) {
  throw new Error("A staging target and reviewed SHA-256 are required.");
}
const file = "supabase/migrations/20260912120000_client_release_policy_foundation.sql";
const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (actual !== expected) throw new Error("Migration checksum differs from the reviewed SQL.");
console.log(JSON.stringify({ target, migration: file, sha256: actual, action: "validate-only" }));
