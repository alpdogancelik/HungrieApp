import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = path.join(ROOT_DIR, "supabase", "realtime", "order_private_broadcast_policy.sql");
const target = process.argv.find((value) => value.startsWith("--target="))?.split("=")[1];
const confirmation = process.argv.find((value) => value.startsWith("--confirm="))?.split("=")[1];

if (!new Set(["local", "development", "staging", "production"]).has(target)) {
  throw new Error("Use --target=local, development, staging, or production.");
}
if (confirmation !== target) {
  throw new Error(`Refusing to apply Realtime policy without --confirm=${target}.`);
}

const sql = fs.readFileSync(POLICY_PATH, "utf8");

if (target === "local") {
  const container = spawnSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .stdout.split("\n")
    .find((name) => name.startsWith("supabase_db_"));
  if (!container) throw new Error("Local Supabase database container is not running.");
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "postgres"],
    { cwd: ROOT_DIR, input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  if (result.status !== 0) throw new Error("Unable to apply the local managed Realtime policy.");
} else {
  const secureDir = path.join(ROOT_DIR, "secure");
  const statePath = path.join(secureDir, "supabase-projects.local.json");
  const tokenPath = path.join(secureDir, "supabase-cli-hungrie", "access-token");
  if (!fs.existsSync(statePath) || !fs.existsSync(tokenPath)) {
    throw new Error("Ignored Supabase development state or access token is unavailable.");
  }
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const projectRef = state.projects?.[target]?.ref;
  if (!projectRef) throw new Error(`${target} project reference is unavailable.`);
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${fs.readFileSync(tokenPath, "utf8").trim()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Unable to apply the hosted managed Realtime policy (${response.status}).`);
  const configResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/realtime`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${fs.readFileSync(tokenPath, "utf8").trim()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ private_only: true }),
  });
  if (!configResponse.ok) throw new Error(`Unable to enable private-only Realtime (${configResponse.status}).`);
}

console.log(`Applied the receive-only private Broadcast policy to ${target}.`);
