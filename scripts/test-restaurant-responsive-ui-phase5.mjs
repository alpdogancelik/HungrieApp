import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { phase5Scenarios } from "../apps/restaurant/test/qualification/phase5Adapter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const restaurant = path.join(root, "apps/restaurant");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const walk = directory => fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]) : [];
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

test("responsive.css is the single media-query owner at approved boundaries", () => {
  const cssFiles = walk(path.join(restaurant, "src")).filter(file => file.endsWith(".css"));
  for (const file of cssFiles) {
    const source = fs.readFileSync(file, "utf8");
    if (path.basename(file) === "responsive.css") continue;
    assert.doesNotMatch(source, /@media\b/, `${path.relative(root, file)} contains a layout media query`);
  }
  const responsive = read("apps/restaurant/src/design/responsive.css");
  for (const query of ["max-width: 767px", "max-width: 1023px", "min-width: 1024px", "min-width: 1440px", "prefers-reduced-motion: reduce"]) assert.ok(responsive.includes(query), `Missing ${query}`);
  assert.doesNotMatch(responsive, /(?:min|max)-width:\s*(?:600|700|850|900)px/);
  for (const edge of ["safe-area-inset-top", "safe-area-inset-right", "safe-area-inset-bottom", "safe-area-inset-left"]) assert.ok(responsive.includes(edge), `Missing ${edge}`);
});

test("locked accessible colors and 44px targets remain present", () => {
  const tokens = read("apps/restaurant/src/design/tokens.css"), components = read("apps/restaurant/src/design/components.css"), responsive = read("apps/restaurant/src/design/responsive.css");
  assert.match(tokens, /--color-muted-soft:\s*#697386/i);
  assert.match(tokens, /--color-red:\s*#d13f38/i);
  assert.match(responsive, /#8490a5/i);
  assert.match(components, /min-height:\s*44px/);
});

test("dialogs, route focus, and tabs retain complete keyboard behavior", () => {
  const dialog = read("apps/restaurant/src/components/Dialog.tsx");
  for (const token of ["createPortal", ".inert", "aria-hidden", "document.body.style.overflow", 'event.key === "Escape"', "restoreRef.current?.focus"]) assert.ok(dialog.includes(token), `Missing dialog behavior: ${token}`);
  const route = read("apps/restaurant/src/components/useRouteAccessibility.ts");
  for (const token of ["document.documentElement.lang", "document.title", ".focus(", "requestAnimationFrame"]) assert.ok(route.includes(token), `Missing route behavior: ${token}`);
  const tabs = read("apps/restaurant/src/components/tabKeyboard.ts");
  for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) assert.ok(tabs.includes(key), `Missing tab key ${key}`);
});

test("the development preview and legacy styles are absent from production", () => {
  for (const relative of ["apps/restaurant/app/reviews-preview.tsx", "apps/restaurant/src/reviewStyles.css", "apps/restaurant/src/styles.css"]) assert.equal(fs.existsSync(path.join(root, relative)), false, `${relative} still exists`);
  const layout = read("apps/restaurant/app/_layout.tsx");
  assert.doesNotMatch(layout, /reviews-preview|reviewStyles|src\/styles/);
  assert.match(layout, /<AuthGate>/);
  const dist = walk(path.join(restaurant, "dist"));
  assert.equal(dist.filter(file => file.endsWith(".html")).length <= 21, true);
  assert.equal(dist.some(file => file.includes("reviews-preview")), false);
  const bundle = dist.filter(file => /\.(?:js|css|html)$/.test(file)).map(file => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(bundle, /phase5Adapter|synthetic qualification state|UI STATE/);
});

test("the test-only adapter covers every approved route and state outside Expo Router", () => {
  assert.equal(phase5Scenarios.length, 34);
  for (const scenario of ["login", "forgot-password", "invitation", "pending", "suspended", "dashboard", "orders-many", "order-detail", "history", "menu-long", "menu-editor", "menu-max-groups", "restaurant-long", "reviews", "review-report", "alerts-install", "security", "more", "earnings-owner", "loading", "empty", "offline-retained", "reconnecting", "stale", "permission-denied", "session-expired", "validation", "conflict", "unknown-outcome", "dirty-confirmation"]) assert.ok(phase5Scenarios.includes(scenario), `Missing scenario ${scenario}`);
  assert.equal(fs.existsSync(path.join(restaurant, "app", "qualification.tsx")), false);
});

test("one shared private Restaurant realtime subscription remains", () => {
  const sources = walk(path.join(restaurant, "src")).filter(file => /\.(?:ts|tsx)$/.test(file)).map(file => fs.readFileSync(file, "utf8"));
  assert.equal(sources.reduce((total, source) => total + (source.match(/\.channel\(/g)?.length || 0), 0), 1);
});

test("protected contracts retain the Phase 4 baseline plus the separately approved additive conflict migration", () => {
  const baseline = "71e5d7e08189bbe0da3849c48db16ef10cd6a27f";
  const approvedMigration = "supabase/migrations/20260924140000_restaurant_order_conflict_transport.sql";
  const changedMigrations = execFileSync("git", ["diff", "--name-only", baseline, "--", "supabase/migrations"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  assert.deepEqual(changedMigrations, [approvedMigration]);
  assert.equal(sha256(path.join(root, approvedMigration)), "750b09ff393cd6b0f574e2a08896b7c61e1aa39d61cd929fb7b8ed8f2036b641");
  const protectedPaths = ["packages/database-types/src/database.generated.ts", "apps/restaurant/public/sw.js"];
  const changedProtected = execFileSync("git", ["diff", "--name-only", baseline, "--", ...protectedPaths], { cwd: root, encoding: "utf8" }).trim();
  assert.equal(changedProtected, "");
  const expectedLock = execFileSync("git", ["show", `${baseline}:package-lock.json`], { cwd: root });
  assert.equal(sha256(path.join(root, "package-lock.json")), crypto.createHash("sha256").update(expectedLock).digest("hex"));
});

test("production bundle remains inside approved route, JavaScript, and CSS budgets", () => {
  const dist = walk(path.join(restaurant, "dist"));
  const gzipTotal = extension => dist.filter(file => file.endsWith(extension)).reduce((total, file) => total + zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length, 0);
  assert.ok(dist.filter(file => file.endsWith(".html")).length <= 21);
  assert.ok(gzipTotal(".js") <= 682355, `JavaScript gzip is ${gzipTotal(".js")}`);
  assert.ok(gzipTotal(".css") <= 11068, `CSS gzip is ${gzipTotal(".css")}`);
});
