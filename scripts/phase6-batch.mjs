import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const migrations = ["20260914120000_phase6_customer_first_release.sql", "20260914121000_phase6_customer_bootstrap_grant.sql", "20260914122000_phase6_deleted_firebase_subject_guard.sql", "20260915100000_phase6_customer_deletion_release.sql", "20260916090000_phase6_distinct_configured_cart_lines.sql", "20260916100000_phase6_notification_audit_action_compatibility.sql", "20260916110000_phase6_order_scoped_product_review_lookup.sql", "20260916120000_phase6_customer_cancellation_reason.sql", "20260916130000_phase6_customer_notification_preferences_volatility.sql"];
export const developmentMigrations = ["20260913143000_phase5_restaurant_media_policy_fix.sql", ...migrations];
export const digestFiles = (files) => {
  const hash = crypto.createHash("sha256");
  for (const name of files) hash.update(name).update("\0").update(fs.readFileSync(path.join(root, name))).update("\0");
  return hash.digest("hex");
};
export const migrationSha = (files = migrations) => digestFiles(files.map((name) => `supabase/migrations/${name}`));
export const functionFiles = [
  "functions/index.js", "functions/phase6CustomerDeletionLogic.js",
  "functions/package.json", "functions/package-lock.json",
];
export const functionSha = () => digestFiles(functionFiles);
const walk = (relative) => fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
  const name = `${relative}/${entry.name}`;
  return entry.isDirectory() ? walk(name) : [name];
});
export const customerFiles = [
  ...walk("mobile/app"), ...walk("mobile/assets"), ...walk("mobile/components"), ...walk("mobile/constants"),
  ...walk("mobile/lib"), ...walk("mobile/locales"), ...walk("mobile/public"), ...walk("mobile/src"), ...walk("mobile/store"),
  "mobile/.easignore", "mobile/.env.example", "mobile/app.json", "mobile/assets.d.ts", "mobile/babel.config.js",
  "mobile/eas.json", "mobile/eslint.config.js", "mobile/expo-env.d.ts", "mobile/global.d.ts", "mobile/google-services.json",
  "mobile/images.d.ts", "mobile/metro.config.js", "mobile/nativewind-env.d.ts", "mobile/package.json",
  "mobile/react-native-resolveAssetSource.d.ts", "mobile/tailwind.config.js", "mobile/tsconfig.json", "mobile/type.d.ts",
  "packages/database-types/src/database.generated.ts", "package.json", "package-lock.json",
].sort();
