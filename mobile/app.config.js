const fs = require("node:fs");
const path = require("node:path");
const base = require("./app.json").expo;

const resolveProductionGoogleServicesFile = (env = process.env) => {
  if (env.EXPO_PUBLIC_APP_ENV !== "production") return base.android.googleServicesFile;
  const file = String(env.GOOGLE_SERVICES_JSON || "").trim();
  const expected = String(env.EXPO_PUBLIC_EXPECTED_FIREBASE_PROJECT_ID || "").trim();
  if (!file || !expected) throw new Error("Production Android build requires GOOGLE_SERVICES_JSON and expected Firebase project binding.");
  const absolute = path.resolve(__dirname, file);
  if (!fs.existsSync(absolute)) throw new Error("Production GOOGLE_SERVICES_JSON does not exist.");
  const projectId = JSON.parse(fs.readFileSync(absolute, "utf8"))?.project_info?.project_id;
  if (!projectId || projectId !== expected || projectId === "hungrieapp-a2288") throw new Error("Production google-services.json project identity mismatch.");
  return file;
};

module.exports = ({ config = {} } = {}) => ({
  ...base,
  ...config,
  android: { ...base.android, ...(config.android || {}), googleServicesFile: resolveProductionGoogleServicesFile() },
});
module.exports.resolveProductionGoogleServicesFile = resolveProductionGoogleServicesFile;
