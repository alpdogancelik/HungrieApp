import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProductionOperatorContract } from "./restaurant-production-environment-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const value = (name) => args.find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const action = value("--action");
if (!new Set(["deploy-functions", "deploy-hosting", "deploy-rules"]).has(action)) throw new Error("Choose one explicit Production Firebase action.");
const firebaseProjectId = value("--firebase-project-id");
loadProductionOperatorContract({ contractPath: value("--production-contract"), action: `firebase-${action}`, rootDir: root, bindings: { firebaseProjectId, expectedFirebaseProjectId: value("--expect-firebase-project-id"), supabaseProjectRef: value("--supabase-project-ref"), expectedSupabaseProjectRef: value("--expect-supabase-project-ref"), serviceAccountProjectId: value("--service-account-project-id") } });
const only = action === "deploy-functions" ? "functions" : action === "deploy-hosting" ? "hosting" : "firestore:rules,storage";
const command = ["deploy", "--project", firebaseProjectId, "--only", only, "--non-interactive"];
if (!args.includes("--execute")) console.log(JSON.stringify({ executable: "firebase", command, production: true }));
else { const result = spawnSync("firebase", command, { cwd: root, stdio: "inherit" }); if (result.status !== 0) process.exit(result.status || 1); }
