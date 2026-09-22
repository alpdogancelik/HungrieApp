#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const app = process.argv[2];
const confirmation = process.argv.find(value => value.startsWith("--confirm="))?.slice(10);
if (!new Set(["admin", "restaurant"]).has(app)) throw new Error("Use admin|restaurant.");
if (confirmation !== `development:phase4-local-${app}`) throw new Error("Explicit Development application confirmation required.");

const registry = JSON.parse(fs.readFileSync(path.join(root, "secure", "supabase-projects.local.json"), "utf8"));
const project = registry.projects?.development;
const firebase = JSON.parse(fs.readFileSync(path.join(root, "secure", "admin-firebase-web-development.local.json"), "utf8"));
if (project?.name !== "HungrieApp Development" || !project.ref || project.ref === registry.projects?.staging?.ref || project.ref === registry.projects?.production?.ref) throw new Error("Exact Development Supabase target required.");
if (new URL(project.url).hostname.split(".")[0] !== project.ref) throw new Error("Development Supabase URL/ref mismatch.");
if (firebase.projectId !== "hungrieapp-a2288") throw new Error("Approved shared non-production Firebase target required.");

const shared = {
  ...process.env,
  NEXT_PUBLIC_HUNGRIE_ENV: "development",
  NEXT_PUBLIC_FIREBASE_API_KEY: firebase.apiKey,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: firebase.authDomain,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: firebase.projectId,
  NEXT_PUBLIC_FIREBASE_APP_ID: firebase.appId,
  NEXT_PUBLIC_SUPABASE_URL: project.url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: project.publishableKey,
  EXPO_PUBLIC_HUNGRIE_ENV: "development",
  EXPO_PUBLIC_FIREBASE_API_KEY: firebase.apiKey,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: firebase.authDomain,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: firebase.projectId,
  EXPO_PUBLIC_FIREBASE_APP_ID: firebase.appId,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: firebase.messagingSenderId,
  EXPO_PUBLIC_SUPABASE_URL: project.url,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: project.publishableKey,
};
const args = app === "admin" ? ["--prefix", "apps/admin-web", "run", "dev", "--", "--port", "3100"] : ["--prefix", "apps/restaurant", "run", "web", "--", "--port", "3101"];
console.log(JSON.stringify({ phase4LocalEnvironment: "development", app, supabaseProjectRef: project.ref, firebaseProjectId: firebase.projectId, rejectedProjectRefs: [registry.projects?.staging?.ref, registry.projects?.production?.ref].filter(Boolean) }));
const child = spawn("npm", args, { cwd: root, env: shared, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exitCode = code ?? 1);
