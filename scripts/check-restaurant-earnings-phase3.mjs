#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const route = read("apps/restaurant/app/earnings.tsx"), component = read("apps/restaurant/src/EarningsPage.tsx"), model = read("apps/restaurant/src/earningsModel.ts"), repository = read("apps/restaurant/src/earningsRepository.ts"), shell = read("apps/restaurant/src/components/AppShell.tsx") + read("apps/restaurant/src/components/navigation.ts"), auth = read("apps/restaurant/src/AuthGate.tsx"), components = read("apps/restaurant/src/design/components.css"), responsive = read("apps/restaurant/src/design/responsive.css"), styles = components + responsive;

assert.match(route, /EarningsPage/); assert.match(shell, /isActiveRestaurantOwner/); assert.match(shell, /\/earnings/); assert.match(auth, /get_my_access_context_v1/); assert.equal((auth.match(/get_my_access_context_v1/g) || []).length, 1, "provider must reuse one access-context request");
for (const rpc of ["restaurant_get_earnings_summary_v1", "restaurant_get_earnings_series_v1", "restaurant_get_earnings_orders_page_v1"]) assert.ok(repository.includes(rpc), `missing approved RPC ${rpc}`);
for (const phrase of ["Calculated estimate", "Hesaplanan tahmini değer", "not payouts", "ödeme", "No Customer details", "Müşteri bilgisi yok"]) assert.ok(component.includes(phrase), `missing bilingual financial/privacy copy: ${phrase}`);
assert.match(repository, /p_limit: 25/); assert.match(repository, /p_cursor: opaqueCursor/); assert.doesNotMatch(component + repository + model, /atob\(|Buffer\.from|console\.(?:log|info|debug).*cursor|localStorage|sessionStorage|caches\./i);
assert.doesNotMatch(component + repository + model, /parseFloat|commissionRateBps\s*\*|eligibleGrossKurus\s*\*/);
for (const width of ["767px", "1023px", "1024px", "1440px"]) assert.ok(responsive.includes(width), `missing responsive breakpoint ${width}`);
assert.match(styles, /:focus-visible/); assert.match(component, /aria-label/); assert.match(component, /<progress/);
const forbidden = ["payout history", "withdraw now", "available balance"];
for (const phrase of forbidden) assert.ok(!component.toLowerCase().includes(phrase), `forbidden payout claim: ${phrase}`);

const protectedHashes = {
  "package-lock.json": "20fcf6107b097abeb0d1dfb7e4c2d56cba0a7428ce2dc357b06b19f7896f6e33",
  "packages/database-types/src/database.generated.ts": "337a0f937c232354dd264e77ac05ade18f8f52244317abf918b74d3016360b37",
  "packages/domain/src/index.ts": "8364c546cbd3d08bbdca40d89993d888107070375eed57243241f99fe6a418fe",
  "supabase/migrations/20260922100000_restaurant_earnings_admin_commission.sql": "bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94",
  "apps/admin-web/app/(admin)/restaurants/[restaurantId]/page.tsx": "677c6d8d4e8a8bc95cc56b437889d9c85a466a30e5cb6cec6bc5aed5b3e92776",
  "apps/admin-web/app/styles.css": "9b88f8ff7cca93916e5acad9b48c70d5a9fbda0ad6a7a758732b79b960e2b747",
  "apps/admin-web/components/OperationalPage.tsx": "3b3a9e9d27fd14f791ce151e356984e6311550910dda9a7c1116d56bb9c178ff",
  "apps/admin-web/components/AdminRestaurantCommissionPage.tsx": "bccfd9c1d8112ee8f1dfd90dbd87a5f9dc0f231584369d60e526802236cc95d4",
  "apps/admin-web/lib/commissionManagementModel.ts": "6e24854bbcc1f8b7fe40619d9def0f89cc6eb8ce162e1a8965ff2aaa3b9dee60",
  "apps/admin-web/lib/commissionRepository.ts": "b385d5a3a74d89ac778fa01ad1cca2e73c57a7d30d704839b7395b9e87a75a68",
};
for (const [file, expected] of Object.entries(protectedHashes)) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex"), expected, `protected accepted file changed: ${file}`);
console.log("Phase 3 Restaurant earnings route, owner authorization, RPC, privacy, and protected-path checks passed.");
