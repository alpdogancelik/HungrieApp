import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = path.join(ROOT_DIR, "secure", "supabase-projects.local.json");
const CLI_HOME = path.join(ROOT_DIR, "secure", "supabase-cli-hungrie");
const CLI_TOKEN_PATH = path.join(CLI_HOME, "access-token");
const MOBILE_ENV_PATH = path.join(ROOT_DIR, "mobile", ".env.local");
const environment = process.argv[2] || "development";

if (!new Set(["development", "staging", "production"]).has(environment)) {
  throw new Error("Usage: npm run supabase:mobile-env -- <development|staging|production>");
}
if (!fs.existsSync(STATE_PATH)) throw new Error("Missing ignored secure/supabase-projects.local.json.");
if (!fs.existsSync(CLI_TOKEN_PATH)) throw new Error("Missing ignored Hungrie Supabase access token. Run npm run supabase:auth:capture.");

const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
const accessToken = fs.readFileSync(CLI_TOKEN_PATH, "utf8").trim();
const project = state.projects?.[environment];
if (!project?.ref) throw new Error(`No ${environment} project is recorded.`);

const result = spawnSync(
  "supabase",
  ["projects", "api-keys", "--project-ref", project.ref, "--output", "json"],
  {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, SUPABASE_HOME: CLI_HOME, SUPABASE_ACCESS_TOKEN: accessToken },
  },
);
if (result.status !== 0) throw new Error(String(result.stderr || "Unable to obtain Supabase API keys.").trim());

const keys = JSON.parse(result.stdout);
const publishable = keys.find((key) =>
  key.type === "publishable" || key.name === "anon" || key.id === "anon"
);
const publishableKey = publishable?.api_key || publishable?.key || publishable?.value;
if (!publishableKey) throw new Error("No publishable API key was returned.");
if (String(publishableKey).startsWith("sb_secret_")) throw new Error("Refusing to expose a Supabase secret key.");

project.url = `https://${project.ref}.supabase.co`;
project.publishableKey = publishableKey;
fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
fs.chmodSync(STATE_PATH, 0o600);
fs.writeFileSync(
  MOBILE_ENV_PATH,
  [
    `EXPO_PUBLIC_SUPABASE_URL=${project.url}`,
    `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
    "EXPO_PUBLIC_SUPABASE_ENABLED=false",
    "",
  ].join("\n"),
  { mode: 0o600 },
);
fs.chmodSync(MOBILE_ENV_PATH, 0o600);
console.log(`Configured ignored mobile environment for ${environment}; Supabase remains disabled.`);
