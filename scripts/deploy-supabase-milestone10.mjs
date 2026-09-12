import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const environment = process.argv.find((value) => value.startsWith("--environment="))?.split("=")[1] || "development";
const confirmation = process.argv.find((value) => value.startsWith("--confirm="))?.split("=")[1];
const firebaseProjectId = process.argv.find((value) => value.startsWith("--firebase-project-id="))?.split("=")[1] || "hungrieapp-a2288";
const expoTokenFile = process.argv.find((value) => value.startsWith("--expo-token-file="))?.slice("--expo-token-file=".length);
if (!new Set(["development", "staging", "production"]).has(environment) || confirmation !== environment) {
  throw new Error(`Refusing hosted changes without matching --environment=${environment} --confirm=${environment}.`);
}
if (!/^[a-z][a-z0-9-]{4,29}$/.test(firebaseProjectId)) throw new Error("Provide a valid --firebase-project-id.");
if (!expoTokenFile || !path.isAbsolute(expoTokenFile) || !fs.existsSync(expoTokenFile)) {
  throw new Error("Provide --expo-token-file=/absolute/path outside the repository.");
}
const relativeTokenPath = path.relative(root, expoTokenFile);
if (!relativeTokenPath.startsWith("..") && !path.isAbsolute(relativeTokenPath)) {
  throw new Error("The Expo access-token file must remain outside the repository.");
}

const secureDir = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secureDir, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.[environment];
const cliHome = path.join(secureDir, "supabase-cli-hungrie");
const accessTokenPath = path.join(cliHome, "access-token");
if (!project?.ref || !project?.databasePassword || !fs.existsSync(accessTokenPath)) {
  throw new Error(`Ignored ${environment} Supabase credentials are unavailable.`);
}
project.url ||= `https://${project.ref}.supabase.co`;

const expoAccessToken = fs.readFileSync(expoTokenFile, "utf8").trim();
if (!/^[A-Za-z0-9._~-]+$/.test(expoAccessToken)) throw new Error("Expo access-token file is empty or malformed.");
const workerStatePath = path.join(secureDir, "milestone-10-worker.local.json");
let workerState = {};
if (fs.existsSync(workerStatePath)) workerState = JSON.parse(fs.readFileSync(workerStatePath, "utf8"));
let workerSecret = workerState.environments?.[environment]?.workerSecret || (environment === "development" ? workerState.workerSecret : null);
if (!workerSecret) {
  workerSecret = crypto.randomBytes(32).toString("hex");
  workerState.environments ||= {};
  workerState.environments[environment] = { workerSecret };
  fs.writeFileSync(workerStatePath, `${JSON.stringify(workerState, null, 2)}\n`, { mode: 0o600 });
}
fs.chmodSync(workerStatePath, 0o600);

const accessToken = fs.readFileSync(accessTokenPath, "utf8").trim();
const env = {
  ...process.env,
  SUPABASE_HOME: cliHome,
  SUPABASE_ACCESS_TOKEN: accessToken,
  SUPABASE_DB_PASSWORD: project.databasePassword,
  PGPASSWORD: project.databasePassword,
};
const run = (args) => {
  const result = spawnSync("supabase", args, { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`Supabase command failed: ${args.slice(0, 3).join(" ")}`);
};

const managementQuery = async (query) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`Unable to run sanitized ${environment} configuration query (${response.status}).`);
  return response.json();
};

const ensureManagedRealtimeSchema = async () => {
  const rows = await managementQuery("select to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null as ready");
  if (rows?.[0]?.ready === true) return;
  if (!project.publishableKey) {
    throw new Error(`The ${environment} publishable key is required to initialize managed Realtime.`);
  }

  // A fresh hosted project installs the managed realtime schema when its first
  // WebSocket client connects. Initialize it before migrations reference
  // realtime.send(), then verify the platform-owned function exists.
  const client = createClient(project.url, project.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 1 } },
  });
  const channel = client.channel(`environment-initialize-${environment}`, { config: { private: false } });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out initializing Realtime for ${environment}.`)), 20_000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(new Error(`Realtime initialization failed for ${environment}.`));
        }
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  } finally {
    await client.removeChannel(channel);
  }

  const verified = await managementQuery("select to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null as ready");
  if (verified?.[0]?.ready !== true) {
    throw new Error(`Managed Realtime schema was not installed for ${environment}.`);
  }
};

let deploymentCompleted = false;
try {
  await managementQuery(`do $mode$ begin if to_regclass('private.runtime_settings') is not null then update private.runtime_settings set mode='testing', changed_at=now(), changed_by='environment_deploy' where singleton; end if; end $mode$;`);
  await ensureManagedRealtimeSchema();
  // Linking is intentionally repeated for every deployment so a stale local link
  // can never send migrations to a different environment.
  run(["link", "--project-ref", project.ref, "--password", project.databasePassword]);
  run(["db", "push", "--linked", "--include-all", "--password", project.databasePassword]);
  run(["config", "push", "--project-ref", project.ref, "--yes"]);

  const realtimePolicy = fs.readFileSync(path.join(root, "supabase", "realtime", "order_private_broadcast_policy.sql"), "utf8");
  await managementQuery(realtimePolicy);
  const realtimeResponse = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/config/realtime`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ private_only: true }),
  });
  if (!realtimeResponse.ok) throw new Error(`Unable to enforce private-only Realtime for ${environment} (${realtimeResponse.status}).`);

  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-m10-secrets-"));
  const edgeSecretsPath = path.join(temporaryDir, "edge.env");
  try {
    fs.writeFileSync(edgeSecretsPath, `EXPO_ACCESS_TOKEN=${expoAccessToken}\nNOTIFICATION_WORKER_SECRET=${workerSecret}\n`, { mode: 0o600 });
    run(["secrets", "set", "--env-file", edgeSecretsPath, "--project-ref", project.ref]);
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
  run(["functions", "deploy", "notification-worker", "--project-ref", project.ref, "--no-verify-jwt"]);

  const escapedUrl = `${project.url}/functions/v1/notification-worker`.replaceAll("'", "''");
  const escapedSecret = workerSecret.replaceAll("'", "''");
  const query = `do $vault$ declare v_id uuid; begin
    select id into v_id from vault.secrets where name='notification_worker_url' limit 1;
    if v_id is null then perform vault.create_secret('${escapedUrl}','notification_worker_url','Milestone 10 Edge worker URL');
    else perform vault.update_secret(v_id,'${escapedUrl}','notification_worker_url','Milestone 10 Edge worker URL'); end if;
    select id into v_id from vault.secrets where name='notification_worker_secret' limit 1;
    if v_id is null then perform vault.create_secret('${escapedSecret}','notification_worker_secret','Milestone 10 shared worker secret');
    else perform vault.update_secret(v_id,'${escapedSecret}','notification_worker_secret','Milestone 10 shared worker secret'); end if;
  end $vault$;`;
  await managementQuery(query);
  const finalMode = environment === "production" ? "maintenance" : "testing";
  await managementQuery(`update private.runtime_settings set environment='${environment}', mode='${finalMode}', firebase_project_id='${firebaseProjectId}', changed_at=now(), changed_by='environment_deploy' where singleton;`);
  deploymentCompleted = true;
  console.log(`Schema and notification worker deployed to ${environment}; runtime mode is ${finalMode} and secret values were not logged.`);
} finally {
  // A failed production deployment must fail closed. Staging/development stay in
  // testing so the failure can be diagnosed without pretending they are active.
  if (environment === "production" && !deploymentCompleted) {
    await managementQuery(`do $mode$ begin if to_regclass('private.runtime_settings') is not null then update private.runtime_settings set environment='production', mode='maintenance', changed_at=now(), changed_by='failed_environment_deploy' where singleton; end if; end $mode$;`);
  }
}
