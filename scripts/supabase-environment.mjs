import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = path.join(ROOT_DIR, "secure", "supabase-projects.local.json");
const CLI_HOME = path.join(ROOT_DIR, "secure", "supabase-cli-hungrie");
const CLI_TOKEN_PATH = path.join(CLI_HOME, "access-token");
const [action, environment = "development"] = process.argv.slice(2);
const allowedActions = new Set(["link", "push", "config", "types"]);
const allowedEnvironments = new Set(["development", "staging", "production"]);

if (!allowedActions.has(action) || !allowedEnvironments.has(environment)) {
  throw new Error("Usage: npm run supabase:environment -- <link|push|config|types> <development|staging|production>");
}
if (!fs.existsSync(STATE_PATH)) throw new Error("Missing ignored secure/supabase-projects.local.json.");
if (!fs.existsSync(CLI_TOKEN_PATH)) throw new Error("Missing ignored Hungrie Supabase access token. Run npm run supabase:auth:capture.");

const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
const accessToken = fs.readFileSync(CLI_TOKEN_PATH, "utf8").trim();
const project = state.projects?.[environment];
if (!project?.ref) throw new Error(`No ${environment} project is recorded.`);

const run = (commandArgs, stdio = "inherit") => {
  const result = spawnSync("supabase", commandArgs, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio,
    env: { ...process.env, SUPABASE_HOME: CLI_HOME, SUPABASE_ACCESS_TOKEN: accessToken },
  });
  if (result.status !== 0) {
    if (stdio === "inherit") process.exit(result.status || 1);
    throw new Error("Supabase CLI command failed; sensitive output was suppressed.");
  }
  return result;
};

const linkProject = () => {
  run(
    ["link", "--project-ref", project.ref, "--password", project.databasePassword],
    ["ignore", "pipe", "pipe"],
  );
};

if (action === "link") {
  if (!project.databasePassword) throw new Error(`No database password is recorded for ${environment}.`);
  linkProject();
  console.log(`Linked the ${environment} Supabase environment.`);
} else if (action === "push") {
  if (!project.databasePassword) throw new Error(`No database password is recorded for ${environment}.`);
  linkProject();
  run(["db", "push", "--linked", "--password", project.databasePassword, "--include-all"]);
} else if (action === "config") {
  if (!project.databasePassword) throw new Error(`No database password is recorded for ${environment}.`);
  linkProject();
  run(["config", "push", "--project-ref", project.ref, "--yes"]);
} else {
  const result = run(
    ["gen", "types", "typescript", "--project-id", project.ref, "--schema", "public"],
    ["ignore", "pipe", "inherit"],
  );
  const outputPath = path.join(ROOT_DIR, "mobile", "src", "types", "database.generated.ts");
  fs.writeFileSync(outputPath, result.stdout, "utf8");
  console.log(`Generated database types from ${environment}.`);
}
