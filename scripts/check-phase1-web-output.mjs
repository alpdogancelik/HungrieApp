import assert from "node:assert/strict";
import fs from "node:fs";

const restaurant = "apps/restaurant/dist";
const html = fs.readFileSync(`${restaurant}/index.html`, "utf8");
const worker = fs.readFileSync(`${restaurant}/sw.js`, "utf8");
const manifest = JSON.parse(fs.readFileSync(`${restaurant}/manifest.webmanifest`, "utf8"));
assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
assert.equal(manifest.scope, "/");
assert.equal(manifest.start_url, "/");
assert.doesNotMatch(worker, /addEventListener\s*\(\s*["']fetch["']|caches\.|cache\.put|fetch\s*\(/i);
assert.match(worker, /addEventListener\("install"/);
assert.match(worker, /addEventListener\("activate"/);
assert.ok(fs.existsSync("mobile/dist/index.html"), "Customer web export is missing");
assert.ok(fs.existsSync("apps/admin-web/.next/BUILD_ID"), "Admin production build is missing");
console.log("Phase 1 web exports and no-cache service-worker contract passed.");
