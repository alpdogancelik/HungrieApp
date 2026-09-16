#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { root, migrations, migrationSha, functionFiles, functionSha, customerFiles, digestFiles } from "./phase6-batch.mjs";

const secure = path.join(root, "secure");
const state = JSON.parse(fs.readFileSync(path.join(secure, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.staging;
if (project?.name !== "HungrieApp Staging" || !project.ref || project.ref === state.projects?.development?.ref || project.ref === state.projects?.production?.ref) throw new Error("Staging identity is incomplete or overlaps another environment.");
const token = fs.readFileSync(path.join(secure, "supabase-cli-hungrie/access-token"), "utf8").trim();
const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ query: "select version from supabase_migrations.schema_migrations order by version" }),
});
if (!response.ok) throw new Error(`Staging review failed (${response.status}).`);
const history = await response.json();
const applied = new Set(history.map((row) => String(row.version)));
const pending = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => /^\d{14}_.+\.sql$/.test(name) && !applied.has(name.slice(0, 14))).sort();
const expectedPending = migrations.filter((name) => !applied.has(name.slice(0, 14)));
if (pending.join("\n") !== expectedPending.join("\n")) throw new Error(`Staging pending migrations changed: ${pending.join(", ")}`);
const report = { environment: "staging", recordedAt: new Date().toISOString(), appliedMigrations: history.length,
  pendingMigrations: expectedPending, migrationSha256: migrationSha(), customerFiles, customerBuildSha256: digestFiles(customerFiles),
  functionFiles, functionSha256: functionSha(),
  firebaseProject: "hungrieapp-a2288", easEnvironment: "preview", productionExcluded: true };
const directory = path.join(secure, "phase6-staging");
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const reportPath = path.join(directory, `review-${Date.now()}.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600, flag: "wx" });
console.log(JSON.stringify({ ...report, reportPath }));
