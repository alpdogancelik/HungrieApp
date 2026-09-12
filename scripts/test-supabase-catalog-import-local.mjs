import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildImportSql, transformCatalog } = require("../functions/scripts/catalogMigration.js");
const documents = { restaurants: [], categories: [], menus: [] };
const dataDir = path.join(ROOT_DIR, "mobile", "data");
for (const file of fs.readdirSync(dataDir).filter((name) => name.endsWith("-firestore.json")).sort()) {
  const payload = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
  const restaurant = payload.restaurants[0];
  documents.restaurants.push({ id: restaurant.id, data: restaurant });
  documents.categories.push(...payload.categories.map((category) => ({
    id: `${restaurant.id}_${category.id}`,
    data: { ...category, restaurantId: restaurant.id },
  })));
  documents.menus.push(...payload.menus.map((item) => ({ id: `${restaurant.id}_${item.id}`, data: item })));
}

const result = transformCatalog({ documents, rootDir: ROOT_DIR });
if (result.rejections.length) throw new Error("Synthetic local catalog contains unexpected rejections.");
const generated = buildImportSql(result, "hungrieapp-a2288");
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hungrie-m5-local-"));
const sqlPath = path.join(temporaryDirectory, "catalog.sql");
try {
  fs.writeFileSync(sqlPath, generated.sql, { mode: 0o600 });
  const imported = spawnSync("supabase", ["db", "query", "--local", "--file", sqlPath], { cwd: ROOT_DIR, encoding: "utf8" });
  if (imported.status !== 0) throw new Error(`Local full-catalog promotion failed: ${String(imported.stderr).trim()} ${String(imported.stdout).trim()}`);
  const verified = spawnSync("supabase", ["db", "query", "--local", `
    select json_build_object(
      'restaurants', (select count(*) from public.restaurants where id not like 'fixture_%'),
      'categories', (select count(*) from public.categories where id not like 'fixture_%'),
      'menu_items', (select count(*) from public.menu_items where id not like 'fixture_%'),
      'active_fixtures', (
        (select count(*) from public.restaurants where id like 'fixture_%' and is_active) +
        (select count(*) from public.categories where id like 'fixture_%' and is_active) +
        (select count(*) from public.menu_items where id like 'fixture_%' and is_active)
      )
    ) as result
  `, "--output-format", "json"], { cwd: ROOT_DIR, encoding: "utf8" });
  if (verified.status !== 0) throw new Error("Local full-catalog verification query failed.");
  const output = JSON.parse(verified.stdout.slice(verified.stdout.indexOf("{"))).rows[0].result;
  const expected = { restaurants: 9, categories: 94, menu_items: 822, active_fixtures: 0 };
  if (Object.entries(expected).some(([key, value]) => output[key] !== value)) throw new Error("Local full-catalog counts did not reconcile.");
  console.log(JSON.stringify({ passed: true, counts: output, sourceChecksum: result.sourceChecksum, stagedChecksum: result.stagedChecksum }, null, 2));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  const reset = spawnSync("supabase", ["db", "reset", "--local"], { cwd: ROOT_DIR, encoding: "utf8" });
  if (reset.status !== 0) throw new Error("Local database cleanup reset failed.");
}
