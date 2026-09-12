import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
if (arg("--target") !== "staging" || arg("--confirm") !== "staging:phase1-policy-probe") {
  throw new Error("Use --target=staging --confirm=staging:phase1-policy-probe after separate approval.");
}
const sqlPath = path.join(root, "scripts", "phase1-client-release-policy-probe.sql");
const sql = fs.readFileSync(sqlPath, "utf8");
const sha = crypto.createHash("sha256").update(sql).digest("hex");
if (arg("--expect-sha256") !== sha) throw new Error("The reviewed staging probe checksum does not match.");

const secureRoot = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secureRoot, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.staging;
if (!project?.ref) throw new Error("Staging project is not recorded.");
const token = fs.readFileSync(path.join(secureRoot, "supabase-cli-hungrie", "access-token"), "utf8").trim();
const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ query: sql })
});
if (!response.ok) throw new Error(`Staging release-policy probe failed (${response.status}).`);
const verification = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ query: "select count(*)::integer as retained_rows from private.client_release_policy" })
});
if (!verification.ok) throw new Error(`Staging fixture cleanup verification failed (${verification.status}).`);
const rows = await verification.json();
if (!Array.isArray(rows) || Number(rows[0]?.retained_rows) !== 0) {
  throw new Error("Staging policy fixture rows remain or cleanup could not be confirmed.");
}
console.log(JSON.stringify({ target: "staging", simulatedIosAndAndroidCases: 6, fixtureWritesRetained: 0, sha256: sha }));
