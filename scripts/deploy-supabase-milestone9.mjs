import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!process.argv.includes("--confirm=development")) {
  throw new Error("Refusing hosted changes without --confirm=development.");
}
const secureDir = path.join(ROOT_DIR, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secureDir, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.development;
const cliHome = path.join(secureDir, "supabase-cli-hungrie");
const tokenPath = path.join(cliHome, "access-token");
if (!project?.ref || !project?.databasePassword || !fs.existsSync(tokenPath)) throw new Error("Ignored development credentials are unavailable.");
const accessToken = fs.readFileSync(tokenPath, "utf8").trim();
const environment = { ...process.env, SUPABASE_HOME: cliHome, SUPABASE_ACCESS_TOKEN: accessToken, SUPABASE_DB_PASSWORD: project.databasePassword, PGPASSWORD: project.databasePassword };

const pushed = spawnSync("supabase", ["db", "push", "--linked", "--include-all"], { cwd: ROOT_DIR, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
if (pushed.status !== 0) throw new Error("Hosted Milestone 9 migration push failed.");

const policySql = fs.readFileSync(path.join(ROOT_DIR, "supabase", "realtime", "order_private_broadcast_policy.sql"), "utf8");
const queryResponse = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
  method: "POST",
  headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
  body: JSON.stringify({ query: policySql }),
});
if (!queryResponse.ok) throw new Error(`Hosted Realtime policy application failed (${queryResponse.status}).`);

const configResponse = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/config/realtime`, {
  method: "PATCH",
  headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
  body: JSON.stringify({ private_only: true }),
});
if (!configResponse.ok) throw new Error(`Hosted private-only Realtime configuration failed (${configResponse.status}).`);

console.log("Deployed Milestone 9 schema, receive-only policy, and private-only Realtime configuration to development.");
