import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secureRoot = path.join(root, "secure");
const environment = process.argv[2];
const args = process.argv.slice(3);
const value = (name) => args.find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const purpose = value("--purpose");
const expectedChecksum = value("--expect-sha256");
const confirmation = value("--confirm");
const files = args.filter((entry) => entry.startsWith("--file=")).map((entry) => path.resolve(root, entry.slice("--file=".length)));
if (!new Set(["staging", "production"]).has(environment) || confirmation !== `${environment}:${purpose}`) throw new Error("Use an explicit staging/production target and matching --confirm=<environment>:<purpose>.");
if (environment === "staging" && purpose !== "test-dataset") throw new Error("Staging accepts only the reviewed test-dataset purpose.");
if (environment === "production" && purpose !== "catalog-release") throw new Error("Production accepts only the clean catalog-release purpose.");
if (!files.length || !expectedChecksum) throw new Error("Provide one or more --file entries and their combined --expect-sha256 checksum.");
for (const file of files) {
  const relative = path.relative(secureRoot, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file)) throw new Error("Every SQL file must exist under ignored secure/.");
}
const combined = files.map((file) => fs.readFileSync(file)).reduce((output, input) => Buffer.concat([output, input]), Buffer.alloc(0));
const checksum = crypto.createHash("sha256").update(combined).digest("hex");
if (checksum !== expectedChecksum) throw new Error("Reviewed SQL checksum does not match the selected release files.");
if (environment === "production") {
  if (files.length !== 1 || !files[0].includes(`${path.sep}production-catalog-release${path.sep}`)) throw new Error("Production requires exactly one generated production catalog SQL artifact.");
  const sql = combined.toString("utf8").toLowerCase();
  for (const forbidden of ["public.profiles", "public.orders", "public.addresses", "public.favorites", "public.product_reviews", "public.order_reviews", "private.push_tokens", "private.notification_"]) {
    if (sql.includes(forbidden)) throw new Error(`Production catalog artifact contains forbidden non-catalog scope: ${forbidden}.`);
  }
}
const state = JSON.parse(fs.readFileSync(path.join(secureRoot, "supabase-projects.local.json"), "utf8"));
const project = state.projects?.[environment];
if (!project?.ref || !project?.databasePassword) throw new Error(`No ${environment} database credentials are recorded.`);
const managementTokenPath = path.join(secureRoot, "supabase-cli-hungrie", "access-token");
if (!fs.existsSync(managementTokenPath)) throw new Error("Missing ignored Supabase management token.");
const managementToken = fs.readFileSync(managementTokenPath, "utf8").trim();
for (const file of files) {
  const sql = `set hungrie.runtime_write_bypass='on';\n${fs.readFileSync(file, "utf8")}`;
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${managementToken}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Release application failed in ${environment} (${response.status}); database output was suppressed.`);
}
console.log(JSON.stringify({ environment, purpose, filesApplied: files.length, combinedChecksum: checksum, completed: true }, null, 2));
