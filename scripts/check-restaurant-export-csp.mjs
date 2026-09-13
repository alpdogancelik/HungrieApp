import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("apps/restaurant");
const config = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
const csp = config.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === "expo-router")?.[1]?.headers?.["Content-Security-Policy"];
assert.ok(csp, "Restaurant hosting CSP is missing");
const scriptSrc = csp.split(";").map(part => part.trim()).find(part => part.startsWith("script-src "));
assert.ok(scriptSrc, "Restaurant script-src is missing");
const dist = path.join(root, "dist");
assert.ok(fs.existsSync(path.join(dist, "orders", "detail.html")), "Static order-detail URL is missing from the export");
let htmlCount = 0;
function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (file.endsWith(".html")) {
      htmlCount += 1;
      const html = fs.readFileSync(file, "utf8");
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (/\bsrc=/.test(match[1])) continue;
        const hash = crypto.createHash("sha256").update(match[2]).digest("base64");
        assert.ok(scriptSrc.includes(`'sha256-${hash}'`), `Restaurant CSP blocks an inline script in ${path.relative(dist, file)}`);
      }
    }
  }
}
check(dist);
assert.ok(htmlCount > 0, "Restaurant export contains no HTML");
console.log(`Restaurant CSP permits generated inline scripts across ${htmlCount} HTML pages.`);
