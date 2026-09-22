#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const component = read("apps/admin-web/components/AdminRestaurantCommissionPage.tsx");
const model = read("apps/admin-web/lib/commissionManagementModel.ts");
const repository = read("apps/admin-web/lib/commissionRepository.ts");
const route = read("apps/admin-web/app/(admin)/restaurants/[restaurantId]/page.tsx");
const list = read("apps/admin-web/components/OperationalPage.tsx");
const css = read("apps/admin-web/app/styles.css");

assert.match(route, /AdminRestaurantCommissionPage/);
assert.match(list, /\/restaurants\/\$\{encodeURIComponent/);
for (const rpc of ["admin_get_restaurant_v1", "get_my_access_context_v1", "admin_get_restaurant_commission_v1", "admin_schedule_restaurant_commission_v1"]) assert.ok(repository.includes(rpc), `missing approved RPC ${rpc}`);
for (const phrase of ["New rules affect only qualifying new orders", "Yeni kurallar yalnızca uygun yeni siparişleri etkiler", "not a payout, settlement", "Ödeme, mutabakat"]) assert.ok(component.includes(phrase), `missing bilingual contract copy: ${phrase}`);
for (const state of ["pending", "active", "suspended", "closed"]) assert.ok(component.includes(state), `missing lifecycle state ${state}`);
for (const width of ["900px", "520px", "1440px"]) assert.ok(css.includes(width), `missing responsive breakpoint ${width}`);
assert.match(component, /role="dialog"/); assert.match(component, /aria-modal="true"/); assert.match(css, /:focus-visible/);
assert.match(model, /crypto\.randomUUID/); assert.match(model, /canonicalCommissionDraft/);
assert.doesNotMatch(component + model, /window\.confirm|parseFloat|parseFloat\s*\(|Number\([^)]*\)\s*\*\s*100/);
assert.ok(!component.includes("optimistic"), "authoritative history must be reloaded");
const protectedHashes = {
  "package-lock.json": "784150a7b56cfe45c137673fa3fe52d131c1af6aa4b15426d1b14a71aca96155",
  "packages/database-types/src/database.generated.ts": "337a0f937c232354dd264e77ac05ade18f8f52244317abf918b74d3016360b37",
  "packages/domain/src/index.ts": "8364c546cbd3d08bbdca40d89993d888107070375eed57243241f99fe6a418fe",
  "supabase/migrations/20260922100000_restaurant_earnings_admin_commission.sql": "bfc36defff4539366cabc61bb9ee7d86505e982e4ed06209747a666f410aea94",
};
for (const [protectedFile, expected] of Object.entries(protectedHashes)) {
  const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, protectedFile))).digest("hex");
  assert.equal(digest, expected, `protected Phase 1 or unrelated file changed: ${protectedFile}`);
}
console.log("Phase 2 Admin commission route, contract, authorization, and static security checks passed.");
