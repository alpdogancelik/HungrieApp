import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAFE_DIR = path.join(ROOT_DIR, "secure");
const CLI_HOME = path.join(SAFE_DIR, "supabase-cli-hungrie");
const CLI_TOKEN_PATH = path.join(CLI_HOME, "access-token");
const PROJECTS = [
  { environment: "development", name: "HungrieApp Development" },
  { environment: "staging", name: "HungrieApp Staging" },
  { environment: "production", name: "HungrieApp Production" },
];

const args = process.argv.slice(2);
const valueFor = (name) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
};

const options = {
  write: args.includes("--write"),
  profile: valueFor("--profile") || "hungrie",
  organizationId: valueFor("--organization-id"),
  region: valueFor("--region") || "eu-central-1",
  output: valueFor("--output") || "secure/supabase-projects.local.json",
  environments: (valueFor("--environments") || "development,staging,production").split(",").filter(Boolean),
};

const invalidEnvironment = options.environments.find((environment) => !PROJECTS.some((entry) => entry.environment === environment));
if (invalidEnvironment) throw new Error(`Unsupported environment: ${invalidEnvironment}.`);
const desiredProjects = PROJECTS.filter((entry) => options.environments.includes(entry.environment));

const runSupabase = (commandArgs) => {
  if (options.profile !== "hungrie") throw new Error("Only the isolated hungrie CLI profile is supported.");
  fs.mkdirSync(CLI_HOME, { recursive: true, mode: 0o700 });
  fs.chmodSync(CLI_HOME, 0o700);
  if (!fs.existsSync(CLI_TOKEN_PATH)) throw new Error("Missing ignored Hungrie Supabase access token. Run npm run supabase:auth:capture.");
  const accessToken = fs.readFileSync(CLI_TOKEN_PATH, "utf8").trim();
  const result = spawnSync("supabase", [...commandArgs, "--output-format", "json"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, SUPABASE_HOME: CLI_HOME, SUPABASE_ACCESS_TOKEN: accessToken },
  });
  if (result.status !== 0) {
    const message = String(result.stderr || result.stdout || "Supabase CLI command failed").trim();
    throw new Error(message.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]"));
  }
  const output = String(result.stdout || "").trim();
  const start = output.indexOf("[") >= 0 && output.indexOf("[") < output.indexOf("{") ? output.indexOf("[") : output.indexOf("{");
  if (start < 0) return null;
  const parsed = JSON.parse(output.slice(start));
  return parsed?.projects || parsed;
};

const assertSafeOutput = () => {
  const outputPath = path.resolve(ROOT_DIR, options.output);
  const relative = path.relative(SAFE_DIR, outputPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Credential output must be a file under secure/.");
  }
  return outputPath;
};

const loadState = (outputPath) => {
  if (!fs.existsSync(outputPath)) {
    return { organizationId: options.organizationId, region: options.region, projects: {} };
  }
  return JSON.parse(fs.readFileSync(outputPath, "utf8"));
};

const saveState = (outputPath, state) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(outputPath, 0o600);
};

const password = () => crypto.randomBytes(32).toString("base64url");
const projectOrganizationId = (project) => project.organization_id || project.organizationId || project.organization?.id || null;
const belongsToTargetOrganization = (project) => projectOrganizationId(project) === options.organizationId;

const main = () => {
  if (!options.organizationId) throw new Error("--organization-id is required.");
  if (options.region !== "eu-central-1") throw new Error("Only the approved eu-central-1 region is allowed.");
  const outputPath = assertSafeOutput();
  const existing = runSupabase(["projects", "list"]);
  const projects = Array.isArray(existing) ? existing : [];
  const targetOrganizationProjects = projects.filter(belongsToTargetOrganization);
  const expectedNames = new Set(desiredProjects.map((project) => project.name));
  const unexpected = targetOrganizationProjects.filter((project) => !expectedNames.has(project.name));
  if (options.write && options.environments.includes("staging") && options.environments.includes("production") && unexpected.length) {
    throw new Error("The selected Milestone 11 organization contains projects other than staging and production; refusing to modify it.");
  }

  for (const desired of desiredProjects) {
    const match = projects.find((project) => project.name === desired.name && belongsToTargetOrganization(project));
    if (match && match.region !== options.region) {
      throw new Error(`${desired.name} exists outside ${options.region}; refusing to modify it.`);
    }
  }

  if (!options.write) {
    console.log("Dry run. Projects that would be created:");
    for (const desired of desiredProjects) {
      const match = projects.find((project) => project.name === desired.name && project.region === options.region && belongsToTargetOrganization(project));
      console.log(`- ${desired.name}: ${match ? "already exists" : "create"}`);
    }
    return;
  }

  const state = loadState(outputPath);
  for (const desired of desiredProjects) {
    const match = projects.find((project) => project.name === desired.name && project.region === options.region && belongsToTargetOrganization(project));
    if (match) {
      if (!state.projects?.[desired.environment]?.databasePassword) {
        throw new Error(`${desired.name} already exists but its database password is not in the ignored state file; refusing an incomplete adoption.`);
      }
      state.projects[desired.environment] = {
        ...state.projects[desired.environment],
        name: desired.name,
        ref: match.ref || match.id,
        region: match.region,
        organizationId: options.organizationId,
      };
      saveState(outputPath, state);
      console.log(`${desired.name}: retained existing project.`);
      continue;
    }

    const databasePassword = password();
    const created = runSupabase([
      "projects",
      "create",
      desired.name,
      "--org-id",
      options.organizationId,
      "--region",
      options.region,
      "--db-password",
      databasePassword,
      "--yes",
    ]);
    const project = created?.project || created?.created_project || created;
    if (!project?.ref && !project?.id) throw new Error(`Supabase did not return a project reference for ${desired.name}.`);
    const reportedMajor = String(project.database?.version || project.database_version || "17").match(/\d+/)?.[0];
    if (reportedMajor !== "17") throw new Error(`${desired.name} was not provisioned on PostgreSQL 17.`);
    state.projects[desired.environment] = {
      name: desired.name,
      ref: project.ref || project.id,
      region: project.region || options.region,
      databasePassword,
      organizationId: options.organizationId,
    };
    saveState(outputPath, state);
    projects.push(project);
    console.log(`${desired.name}: created.`);
  }

  console.log(`Local project credentials saved to ${path.relative(ROOT_DIR, outputPath)} with mode 0600.`);
};

try {
  main();
} catch (error) {
  console.error(`Provisioning failed: ${String(error.message || error)}`);
  process.exitCode = 1;
}
