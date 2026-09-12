import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secureRoot = path.join(root, "secure");
const require = createRequire(import.meta.url);
const { buildImportSql, canonicalJson, transformCatalog } = require("../functions/scripts/catalogMigration.js");
const args = process.argv.slice(2);
const value = (name) => args.find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const input = value("--input");
const expectedChecksum = value("--expect-source-checksum");
const confirmation = value("--confirm");
const outputDirectory = path.resolve(root, value("--output-dir") || "secure/production-catalog-release");

if (confirmation !== "production-catalog") throw new Error("Use --confirm=production-catalog.");
if (!input || !fs.existsSync(path.resolve(root, input))) throw new Error("Provide an existing --input catalog export.");
if (!expectedChecksum) throw new Error("Pin the reviewed export with --expect-source-checksum=<sha256>.");
const relativeOutput = path.relative(secureRoot, outputDirectory);
if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
  throw new Error("Production release output must remain under ignored secure/.");
}

const source = JSON.parse(fs.readFileSync(path.resolve(root, input), "utf8"));
if (!source.documents) throw new Error("Input is not a complete catalog export.");
const transformed = transformCatalog({ documents: source.documents, rootDir: root });
if (transformed.sourceChecksum !== expectedChecksum) throw new Error("Pinned source checksum does not match the transformed export.");
const expectedCounts = { restaurants: 9, categories: 94, menu_items: 822 };
for (const [key, expected] of Object.entries(expectedCounts)) {
  if (transformed.counts.staged?.[key] !== expected) throw new Error(`Catalog release blocked: expected ${expected} ${key}.`);
}
if (transformed.rejections.length) throw new Error("Catalog release blocked because transformed records contain rejections.");

const { sql } = buildImportSql(transformed, "hungrieapp-a2288");
const sqlChecksum = crypto.createHash("sha256").update(sql).digest("hex");
const releasedAt = new Date().toISOString();
const artifact = {
  schemaVersion: 1,
  releasedAt,
  sourceChecksum: transformed.sourceChecksum,
  stagedChecksum: transformed.stagedChecksum,
  sqlChecksum,
  counts: transformed.counts,
  catalog: transformed.staged,
};
const artifactText = `${canonicalJson(artifact)}\n`;
const releaseChecksum = crypto.createHash("sha256").update(artifactText).digest("hex");
fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
const jsonPath = path.join(outputDirectory, `catalog-${transformed.sourceChecksum}.json`);
const sqlPath = path.join(outputDirectory, `catalog-${transformed.sourceChecksum}.sql`);
fs.writeFileSync(jsonPath, artifactText, { mode: 0o600 });
fs.writeFileSync(sqlPath, sql, { mode: 0o600 });
fs.chmodSync(jsonPath, 0o600);
fs.chmodSync(sqlPath, 0o600);
console.log(JSON.stringify({ counts: transformed.counts, sourceChecksum: transformed.sourceChecksum, stagedChecksum: transformed.stagedChecksum, releaseChecksum, sqlChecksum, artifact: path.relative(root, jsonPath), sql: path.relative(root, sqlPath) }, null, 2));
