import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = path.join(ROOT_DIR, "secure", "supabase-projects.local.json");
const CLI_HOME = path.join(ROOT_DIR, "secure", "supabase-cli-hungrie");
const CLI_TOKEN_PATH = path.join(CLI_HOME, "access-token");
const environment = process.argv[2] || "development";
const confirmation = process.argv.find((value) => value.startsWith("--confirm="))?.split("=")[1];
const firebaseEnvFile = process.argv.find((value) => value.startsWith("--firebase-env-file="))?.slice("--firebase-env-file=".length);
const sentryDsnFile = process.argv.find((value) => value.startsWith("--sentry-dsn-file="))?.slice("--sentry-dsn-file=".length);

if (!new Set(["development", "staging", "production"]).has(environment)) {
  throw new Error("Usage: npm run supabase:mobile-env -- <development|staging|production>");
}
if (confirmation !== environment) throw new Error(`Refusing environment generation without --confirm=${environment}.`);
if (environment === "production" && !firebaseEnvFile && !process.argv.includes("--internal-test-auth")) {
  throw new Error("Production requires an external production Firebase env file; use --internal-test-auth only for unpublished internal validation.");
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
const outputPath = path.join(ROOT_DIR, "secure", `eas-${environment}.env`);
const assertExternalFile = (filePath, label) => {
  if (!filePath || !path.isAbsolute(filePath) || !fs.existsSync(filePath)) throw new Error(`${label} must be an existing absolute file.`);
  const relative = path.relative(ROOT_DIR, filePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error(`${label} must stay outside the repository.`);
};
let firebaseLines;
if (firebaseEnvFile) {
  assertExternalFile(firebaseEnvFile, "Firebase env file");
  firebaseLines = fs.readFileSync(firebaseEnvFile, "utf8").split(/\r?\n/)
    .filter((line) => line.startsWith("EXPO_PUBLIC_FIREBASE_") && line.slice(line.indexOf("=") + 1).trim());
  if (!firebaseLines.some((line) => line.startsWith("EXPO_PUBLIC_FIREBASE_PROJECT_ID="))) throw new Error("Firebase env file is incomplete.");
} else {
  const firebaseExtra = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "mobile", "app.json"), "utf8")).expo.extra;
  firebaseLines = Object.entries(firebaseExtra)
    .filter(([name, value]) => name.startsWith("EXPO_PUBLIC_FIREBASE_") && String(value ?? "").trim())
    .map(([name, value]) => `${name}=${String(value)}`);
}
let sentryDsn = "";
if (sentryDsnFile) {
  assertExternalFile(sentryDsnFile, "Sentry DSN file");
  sentryDsn = fs.readFileSync(sentryDsnFile, "utf8").trim();
  if (!/^https:\/\//.test(sentryDsn)) throw new Error("Sentry DSN file is malformed.");
}
const repositoryLines = ["CATALOG", "PROFILE", "MEMBERSHIP", "RESTAURANT", "MENU", "ORDER", "REVIEW", "ADDRESS", "FAVORITES", "NOTIFICATION"]
  .map((domain) => `EXPO_PUBLIC_${domain}_REPOSITORY=supabase`);
fs.writeFileSync(
  outputPath,
  [
    `EXPO_PUBLIC_APP_ENV=${environment}`,
    `EXPO_PUBLIC_SUPABASE_URL=${project.url}`,
    `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
    "EXPO_PUBLIC_SUPABASE_ENABLED=true",
    "EXPO_PUBLIC_AUTH_REPOSITORY=firebase",
    ...repositoryLines,
    ...firebaseLines,
    ...(sentryDsn ? [`EXPO_PUBLIC_SENTRY_DSN=${sentryDsn}`] : []),
    "",
  ].join("\n"),
  { mode: 0o600 },
);
fs.chmodSync(outputPath, 0o600);
console.log(`Generated ignored EAS environment file for ${environment}; secret values were not logged.`);
