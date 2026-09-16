#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { root, migrations, migrationSha, customerFiles, digestFiles } from "./phase6-batch.mjs";

const app = JSON.parse(fs.readFileSync(path.join(root, "mobile/app.json"), "utf8"));
const extra = app.expo?.extra || {};
const dataDomains = ["CATALOG", "PROFILE", "MEMBERSHIP", "RESTAURANT", "MENU", "ORDER", "REVIEW", "ADDRESS", "FAVORITES", "NOTIFICATION"];
if (extra.EXPO_PUBLIC_SUPABASE_ENABLED !== "true" || extra.EXPO_PUBLIC_AUTH_REPOSITORY !== "firebase" ||
    dataDomains.some((domain) => extra[`EXPO_PUBLIC_${domain}_REPOSITORY`] !== "supabase")) {
  throw new Error("Checked-in Customer configuration does not fix Auth to Firebase and every data domain to Supabase.");
}
const layout = fs.readFileSync(path.join(root, "mobile/app/_layout.tsx"), "utf8");
const releaseGate = fs.readFileSync(path.join(root, "mobile/src/features/runtime/CustomerReleaseGate.tsx"), "utf8");
const environmentWriter = fs.readFileSync(path.join(root, "scripts/configure-supabase-mobile-env.mjs"), "utf8");
if (!layout.includes("releaseReady && customerAccessReady") || !layout.includes("isLegacyPrivilegedRoute") ||
    !releaseGate.includes("const API_CONTRACT=2") || !releaseGate.includes("id6759683384") || !releaseGate.includes("com.hungrie.app")) {
  throw new Error("Customer startup, privileged-route, or store-release gate is incomplete.");
}
if (!environmentWriter.includes('"EXPO_PUBLIC_SUPABASE_ENABLED=true"') ||
    !environmentWriter.includes('"EXPO_PUBLIC_AUTH_REPOSITORY=firebase"') ||
    !environmentWriter.includes('EXPO_PUBLIC_${domain}_REPOSITORY=supabase') ||
    dataDomains.some((domain) => !environmentWriter.includes(`"${domain}"`))) {
  throw new Error("The EAS environment writer does not pin Firebase Auth and every Customer data domain to Supabase.");
}
const scanRoots = ["mobile/app", "mobile/src/features", "mobile/store"];
const legacyPrefixes = ["mobile/app/admin/", "mobile/app/restaurantpanel/", "mobile/app/courier/"];
const walk = (relative) => fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
  const name = `${relative}/${entry.name}`;
  return entry.isDirectory() ? walk(name) : [name];
});
const customerSurface = scanRoots.flatMap(walk).filter((file) => /\.[cm]?[jt]sx?$/.test(file) && !legacyPrefixes.some((prefix) => file.startsWith(prefix)));
const firestoreImports = customerSurface.filter((file) => /firebase\/firestore|from ["']firebase\/database/.test(fs.readFileSync(path.join(root, file), "utf8")));
if (firestoreImports.length) throw new Error(`Normal Customer surfaces still import Firebase application data: ${firestoreImports.join(", ")}`);
const seedFallbackImports = customerSurface.filter((file) => /restaurantSeeds/.test(fs.readFileSync(path.join(root, file), "utf8")));
if (seedFallbackImports.length) throw new Error(`Normal Customer surfaces still import seed application data: ${seedFallbackImports.join(", ")}`);
console.log(JSON.stringify({ migrations, migrationSha256: migrationSha(), customerBuildSha256: digestFiles(customerFiles),
  fixedSupabaseDomains: dataDomains.length, easEnvironmentDomains: dataDomains.length,
  privilegedRoutesBlocked: 3, firestoreApplicationImports: 0, seedFallbackImports: 0 }));
