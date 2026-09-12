import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [environment, mode] = process.argv.slice(2).filter((value) => !value.startsWith("--"));
const confirmation = process.argv.find((value) => value.startsWith("--confirm="))?.split("=")[1];
if (!new Set(["development", "staging", "production"]).has(environment)) throw new Error("Choose development, staging, or production.");
if (!new Set(["maintenance", "testing", "active"]).has(mode)) throw new Error("Choose maintenance, testing, or active.");
if (confirmation !== `${environment}:${mode}`) throw new Error(`Refusing change without --confirm=${environment}:${mode}.`);
if (environment === "production" && mode === "active" && !process.argv.includes("--production-auth-ready")) {
  throw new Error("Production activation requires --production-auth-ready after the isolated Firebase production project is verified.");
}

const state = JSON.parse(fs.readFileSync(path.join(root, "secure", "supabase-projects.local.json"), "utf8"));
const token = fs.readFileSync(path.join(root, "secure", "supabase-cli-hungrie", "access-token"), "utf8").trim();
const project = state.projects?.[environment];
if (!project?.ref) throw new Error(`No ${environment} project is recorded.`);
if (environment === "production" && mode === "active") {
  const inspection = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: "select firebase_project_id from private.runtime_settings where singleton" }),
  });
  if (!inspection.ok) throw new Error(`Unable to verify production identity configuration (${inspection.status}).`);
  const rows = await inspection.json();
  if (rows?.[0]?.firebase_project_id === "hungrieapp-a2288") {
    throw new Error("Production activation is blocked while it still trusts the archived Firebase test project.");
  }
}
const query = `update private.runtime_settings set environment='${environment}', mode='${mode}', changed_at=now(), changed_by='explicit_runtime_command' where singleton returning environment, mode::text;`;
const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ query }),
});
if (!response.ok) throw new Error(`Runtime-mode update failed (${response.status}).`);
console.log(`${environment} runtime mode changed to ${mode}; no project identifiers or secrets were logged.`);
