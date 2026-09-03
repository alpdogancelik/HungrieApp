import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statePath = path.join(root, "secure", "supabase-projects.local.json");
const cliHome = path.join(root, "secure", "supabase-cli-hungrie");
const tokenPath = path.join(cliHome, "access-token");
if (!fs.existsSync(statePath) || !fs.existsSync(tokenPath)) {
  throw new Error("Missing ignored Supabase development credentials.");
}
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const project = state.projects?.development;
if (!project?.ref || !project?.databasePassword) {
  throw new Error("Development project configuration is incomplete.");
}
const environment = {
  ...process.env,
  SUPABASE_HOME: cliHome,
  SUPABASE_ACCESS_TOKEN: fs.readFileSync(tokenPath, "utf8").trim(),
  SUPABASE_DB_PASSWORD: project.databasePassword,
  PGPASSWORD: project.databasePassword,
};
const run = (args, stdio) => {
  const result = spawnSync("supabase", args, { cwd: root, env: environment, encoding: "utf8", stdio });
  if (result.status !== 0) process.exit(result.status || 1);
};
run(["link", "--project-ref", project.ref, "--password", project.databasePassword], ["ignore", "pipe", "pipe"]);
run(["test", "db", "--linked", "supabase/hosted-tests/milestone_3_hosted.sql"], "inherit");
