#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root } from "./phase6-batch.mjs";

const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const target = arg("--target");
if (!["development", "staging"].includes(target) || arg("--confirm") !== `${target}:phase6-backup`) {
  throw new Error("Matching Phase 6 non-production backup target and confirmation are required.");
}
const secure = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.[target];
if (!project?.ref || !project.databasePassword || project.ref === state.projects?.production?.ref ||
    project.ref === state.projects?.[target === "development" ? "staging" : "development"]?.ref) {
  throw new Error("Safe, isolated non-production project configuration is required.");
}
const token = fs.readFileSync(path.join(secure, "supabase-cli-hungrie/access-token"), "utf8").trim();
const directory = path.join(secure, `phase6-${target}-backup`, new Date().toISOString().replaceAll(/[:.]/g, "-"));
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const entries = [{ name: "schema.sql", args: [] }, { name: "data.sql", args: ["--data-only", "--use-copy"] }];
for (const entry of entries) {
  const file = path.join(directory, entry.name);
  const result = spawnSync("supabase", ["db", "dump", "--project-ref", project.ref, "--password", project.databasePassword, "--file", file, ...entry.args], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, SUPABASE_HOME: path.join(secure, "supabase-cli-hungrie"), SUPABASE_ACCESS_TOKEN: token },
  });
  if (result.status !== 0 || !fs.existsSync(file) || fs.statSync(file).size < 1024) throw new Error(`${target} backup failed; output withheld.`);
  fs.chmodSync(file, 0o600);
}
const files = entries.map(({ name }) => ({ name, bytes: fs.statSync(path.join(directory, name)).size,
  sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(directory, name))).digest("hex") }));
const manifestPath = path.join(directory, "manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify({ environment: target, projectRef: project.ref, recordedAt: new Date().toISOString(), files }, null, 2), { mode: 0o600, flag: "wx" });
console.log(JSON.stringify({ environment: target, manifestPath, files }));
