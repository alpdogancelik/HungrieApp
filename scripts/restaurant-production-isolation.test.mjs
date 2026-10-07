import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { assertExactProductionIdentities, assertNonProductionOnly, loadProductionOperatorContract, supabaseProjectRefFromUrl } from "./restaurant-production-environment-contract.mjs";
import { resolveFirebaseRuntimeConfig } from "../mobile/lib/firebaseConfig.ts";
import { resolveCustomerAppCheckConfig } from "../mobile/lib/appCheckConfig.ts";
import { resolveSupabaseState } from "../mobile/lib/supabaseConfig.ts";
import { resolveRestaurantEnvironment } from "../apps/restaurant/src/environmentConfig.ts";
import { resolveAdminEnvironment } from "../apps/admin-web/lib/environmentConfig.ts";
import { buildAdminContentSecurityPolicy } from "../apps/admin-web/lib/contentSecurityPolicy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { assertProductionFunctionIdentity } = require("../functions/productionEnvironmentContract.js");
const prodFirebase = "hungrie-production-123";
const prodRef = "abcdefghijklmnopqrst";
const prodUrl = `https://${prodRef}.supabase.co`;
const firebaseEnv = { EXPO_PUBLIC_APP_ENV: "production", EXPO_PUBLIC_FIREBASE_API_KEY: "public", EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: `${prodFirebase}.firebaseapp.com`, EXPO_PUBLIC_FIREBASE_PROJECT_ID: prodFirebase, EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123", EXPO_PUBLIC_FIREBASE_APP_ID: "1:123:web:abc", EXPO_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID: prodFirebase };

test("ISO-01 Customer Production Firebase is explicit and exact", () => {
  assert.throws(() => resolveFirebaseRuntimeConfig({ EXPO_PUBLIC_APP_ENV: "production" }, {}), /explicit/);
  assert.throws(() => resolveFirebaseRuntimeConfig({ ...firebaseEnv, EXPO_PUBLIC_FIREBASE_PROJECT_ID: "hungrieapp-a2288", EXPO_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID: "hungrieapp-a2288" }, {}), /cannot use/);
  assert.equal(resolveFirebaseRuntimeConfig(firebaseEnv, {}).projectId, prodFirebase);
});

test("ISO-01 Production Android Firebase file cannot inherit tracked non-production file", () => {
  const config = require("../mobile/app.config.js");
  assert.throws(() => config.resolveProductionGoogleServicesFile({ EXPO_PUBLIC_APP_ENV: "production" }), /requires/);
});

test("Customer Production web App Check rejects missing providers and debug bypass", () => {
  assert.throws(() => resolveCustomerAppCheckConfig({ environment: "production", platform: "web" }), /site key/);
  assert.throws(() => resolveCustomerAppCheckConfig({ environment: "production", platform: "web", siteKey: "public-site-key", debugToken: "debug" }), /debug mode/);
  assert.deepEqual(resolveCustomerAppCheckConfig({ environment: "production", platform: "web", siteKey: "public-site-key" }), { enabled: true, siteKey: "public-site-key", debugToken: "" });
  assert.equal(resolveCustomerAppCheckConfig({ environment: "production", platform: "ios" }).enabled, false);
});

test("ISO-02 Customer Production Supabase requires exact ref", () => {
  assert.equal(resolveSupabaseState({ url: prodUrl, publishableKey: "public", appEnvironment: "production", enabled: "true" }).enabled, false);
  assert.equal(resolveSupabaseState({ url: prodUrl, publishableKey: "public", appEnvironment: "production", expectedProjectRef: prodRef, enabled: "true" }).enabled, true);
});

test("ISO-03 Restaurant binds exact Firebase, Supabase, and App Check identities", () => {
  const env = { EXPO_PUBLIC_HUNGRIE_ENV: "production", EXPO_PUBLIC_FIREBASE_API_KEY: "public", EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: `${prodFirebase}.firebaseapp.com`, EXPO_PUBLIC_FIREBASE_PROJECT_ID: prodFirebase, EXPO_PUBLIC_FIREBASE_APP_ID: "app", EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123", EXPO_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID: prodFirebase, EXPO_PUBLIC_SUPABASE_URL: prodUrl, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public", EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: prodRef, EXPO_PUBLIC_FIREBASE_VAPID_KEY: "public-vapid", EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY: "public-site-key", EXPO_PUBLIC_APP_ORIGIN: "https://restaurant.example.com", EXPO_PUBLIC_EXPECTED_APP_ORIGIN: "https://restaurant.example.com" };
  assert.equal(resolveRestaurantEnvironment(env).supabaseProjectRef, prodRef);
  assert.throws(() => resolveRestaurantEnvironment({ ...env, EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: "tsrqponmlkjihgfedcba" }), /Supabase binding/);
  assert.throws(() => resolveRestaurantEnvironment({ ...env, EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN: "debug" }), /debug mode/);
});

test("ISO-04 Admin Production resolves App Check-protected Production functions only after exact binding", () => {
  const env = { NEXT_PUBLIC_HUNGRIE_ENV: "production", NEXT_PUBLIC_FIREBASE_API_KEY: "public", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${prodFirebase}.firebaseapp.com`, NEXT_PUBLIC_FIREBASE_PROJECT_ID: prodFirebase, NEXT_PUBLIC_FIREBASE_APP_ID: "app", NEXT_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID: prodFirebase, NEXT_PUBLIC_SUPABASE_URL: prodUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public", NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: prodRef, NEXT_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY: "public-site-key" };
  assert.equal(resolveAdminEnvironment(env).suffix, "Production");
  assert.throws(() => resolveAdminEnvironment({ ...env, NEXT_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID: "wrong-project" }), /Firebase binding/);
  assert.throws(() => resolveAdminEnvironment({ ...env, NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN: "debug" }), /debug mode/);
});

test("ISO-04 Admin Production CSP uses exact service origins and no development authority", () => {
  const nonce = "a".repeat(32);
  const policy = buildAdminContentSecurityPolicy(nonce, { NODE_ENV: "production", NEXT_PUBLIC_HUNGRIE_ENV: "production", NEXT_PUBLIC_FIREBASE_PROJECT_ID: prodFirebase, NEXT_PUBLIC_SUPABASE_URL: prodUrl });
  assert.match(policy, new RegExp(`script-src 'self' 'nonce-${nonce}' https://www\\.google\\.com https://www\\.gstatic\\.com`));
  assert.match(policy, new RegExp(`https://us-central1-${prodFirebase}\\.cloudfunctions\\.net`));
  assert.match(policy, new RegExp(prodUrl.replaceAll(".", "\\.")));
  assert.match(policy, /https:\/\/content-firebaseappcheck\.googleapis\.com/);
  assert.doesNotMatch(policy, /'unsafe-eval'|localhost|127\.0\.0\.1|script-src[^;]*\s\*|connect-src[^;]*\s\*/);
  assert.throws(() => buildAdminContentSecurityPolicy(nonce, { NODE_ENV: "production", NEXT_PUBLIC_HUNGRIE_ENV: "production", NEXT_PUBLIC_FIREBASE_PROJECT_ID: prodFirebase }), /Supabase URL/);
});

test("ISO-05 Functions Production identity binds Firebase service context and Supabase URL", () => {
  assert.deepEqual(assertProductionFunctionIdentity({ actualFirebaseProjectId: prodFirebase, expectedFirebaseProjectId: prodFirebase, supabaseUrl: prodUrl, expectedSupabaseProjectRef: prodRef }), { firebaseProjectId: prodFirebase, supabaseProjectRef: prodRef });
  assert.throws(() => assertProductionFunctionIdentity({ actualFirebaseProjectId: "hungrieapp-a2288", expectedFirebaseProjectId: "hungrieapp-a2288", supabaseUrl: prodUrl, expectedSupabaseProjectRef: prodRef }), /Firebase identity/);
  const source = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
  for (const name of ["recordAdminMfaEnrollmentProduction", "dispatchRestaurantWebPushProduction", "deleteHungrieAccountProduction", "reconcilePendingAccountAnonymizationsProduction"]) assert.match(source, new RegExp(name));
});

test("ISO-06/07/08 exact identity validator rejects defaults and accepts explicit placeholders", () => {
  assert.throws(() => assertExactProductionIdentities({ environment: "production", firebaseProjectId: "hungrieapp-a2288", expectedFirebaseProjectId: "hungrieapp-a2288", supabaseProjectRef: prodRef, expectedSupabaseProjectRef: prodRef }), /non-production Firebase/);
  assert.throws(() => assertExactProductionIdentities({ environment: "production", firebaseProjectId: prodFirebase, expectedFirebaseProjectId: prodFirebase, supabaseProjectRef: prodRef, expectedSupabaseProjectRef: "tsrqponmlkjihgfedcba" }), /Supabase/);
  assert.equal(assertExactProductionIdentities({ environment: "production", firebaseProjectId: prodFirebase, expectedFirebaseProjectId: prodFirebase, supabaseProjectRef: prodRef, expectedSupabaseProjectRef: prodRef }).firebaseProjectId, prodFirebase);
});

test("strict Supabase URL parser rejects ambiguous URLs", () => {
  assert.equal(supabaseProjectRefFromUrl(prodUrl), prodRef);
  for (const value of [`http://${prodRef}.supabase.co`, `${prodUrl}/rest`, `https://${prodRef}.supabase.co.evil.example`]) assert.equal(supabaseProjectRefFromUrl(value), "");
});

test("ISO-09 Production operator contract requires source, approval, action, provider, and service-account bindings", () => {
  const secure = path.join(root, "secure"); fs.mkdirSync(secure, { recursive: true });
  const directory = fs.mkdtempSync(path.join(secure, "production-contract-test-"));
  const contractPath = path.join(directory, "contract.json");
  fs.writeFileSync(contractPath, JSON.stringify({ schemaVersion: 1, environment: "production", firebaseProjectId: prodFirebase, supabaseProjectRef: prodRef, checkpoint: "a".repeat(40), sourceManifestSha256: "b".repeat(64), ownerApprovalSha256: "c".repeat(64), expiresAt: new Date(Date.now() + 60_000).toISOString(), allowedActions: ["firebase-deploy-functions"] }));
  try {
    const contract = loadProductionOperatorContract({ contractPath, action: "firebase-deploy-functions", rootDir: root, bindings: { firebaseProjectId: prodFirebase, expectedFirebaseProjectId: prodFirebase, serviceAccountProjectId: prodFirebase, supabaseProjectRef: prodRef, expectedSupabaseProjectRef: prodRef } });
    assert.equal(contract.firebaseProjectId, prodFirebase);
    assert.throws(() => loadProductionOperatorContract({ contractPath, action: "firebase-deploy-hosting", rootDir: root, bindings: { firebaseProjectId: prodFirebase, expectedFirebaseProjectId: prodFirebase, supabaseProjectRef: prodRef, expectedSupabaseProjectRef: prodRef } }), /outside/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("ISO-10 legacy tools are machine-classified non-production-only", () => {
  assert.throws(() => assertNonProductionOnly("production", "legacy-migration"), /non-production-only/);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs/restaurant-nonproduction-tool-classification.json"), "utf8"));
  assert.ok(manifest.tools.length >= 10);
  for (const file of manifest.tools) assert.ok(fs.existsSync(path.join(root, file)), file);
  assert.ok(!manifest.allowedEnvironments.includes("production"));
});

test("Production-capable operators are completely classified", () => {
  const policy = JSON.parse(fs.readFileSync(path.join(root, "docs/restaurant-production-operator-classification.json"), "utf8"));
  for (const category of ["exactContractRequired", "exactReadOnlyIdentityRequired", "localArtifactIdentityRequired", "productionForbidden", "isolatedRestoreOnly"]) {
    assert.ok(policy[category].length > 0);
    for (const file of policy[category]) assert.ok(fs.existsSync(path.join(root, file)), file);
  }
  for (const file of policy.exactContractRequired) assert.match(fs.readFileSync(path.join(root, file), "utf8"), /loadProductionOperatorContract/);
});

test("Development and Staging resolution remains supported", () => {
  assert.equal(resolveSupabaseState({ url: "https://rlrfvqskzvpysewdxqcr.supabase.co", publishableKey: "public", appEnvironment: "staging", enabled: "true" }).enabled, true);
  assert.equal(resolveRestaurantEnvironment({ EXPO_PUBLIC_HUNGRIE_ENV: "build-proof" }).environment, "build-proof");
  assert.equal(resolveAdminEnvironment({ NEXT_PUBLIC_HUNGRIE_ENV: "build-proof" }).suffix, "Development");
});
