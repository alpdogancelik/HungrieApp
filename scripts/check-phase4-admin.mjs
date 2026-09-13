#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=path.join(root,"apps/admin-web");
const routes=["login","invite/[token]","onboarding/mfa","suspended","(admin)/dashboard",
  "(admin)/restaurants","(admin)/restaurants/[restaurantId]","(admin)/accounts",
  "(admin)/orders","(admin)/incidents","(admin)/audit","(admin)/security"];
for(const route of routes)assert.ok(fs.existsSync(path.join(app,"app",route,"page.tsx")),"missing "+route);
for(const route of ["onboarding","suspended"])assert.ok(fs.readFileSync(path.join(app,"app",route,"layout.tsx"),"utf8").includes("AuthGate"),route+" lacks an authorization gate");
const config=fs.readFileSync(path.join(app,"next.config.ts"),"utf8");
for(const value of ["Content-Security-Policy","Cache-Control","private, no-store","X-Frame-Options","Permissions-Policy"])assert.ok(config.includes(value),"missing header "+value);
const output=fs.readFileSync(path.join(app,".next/server/app-paths-manifest.json"),"utf8");
for(const route of ["/dashboard","/restaurants","/accounts","/orders","/incidents","/audit","/security"])assert.ok(output.includes(route),"build missing "+route);
assert.ok(!output.includes("/private/page"),"obsolete private proof route remains");
const translations=fs.readFileSync(path.join(app,"lib/i18n.ts"),"utf8");
for(const value of ["Admin sign in","Yönetici girişi","Restaurants","Restoranlar","Security","Güvenlik"])assert.ok(translations.includes(value),"missing bilingual copy: "+value);
const controls=fs.readFileSync(path.join(app,"components/AdminControls.tsx"),"utf8");
for(const value of ["Create restaurant","Restoran oluştur","Operation failed","İşlem tamamlanamadı"])assert.ok(controls.includes(value),"missing bilingual operation copy: "+value);
assert.ok(controls.includes("crypto.randomUUID()"),"privileged operations lack operation IDs");
assert.ok(controls.includes("crypto.subtle.digest"),"invitation token is not browser-digested");
const firebase=fs.readFileSync(path.join(app,"lib/firebase.ts"),"utf8");
for(const value of ["recordAdminMfaEnrollment","setAdminAccountStatus","recoverAdminMfa",'environment==="staging"?"Staging":"Development"'])assert.ok(firebase.includes(value),"missing environment-bound callable selection: "+value);
for(const file of ["app/login/page.tsx","app/onboarding/mfa/page.tsx","components/AuthGate.tsx"]){
  const source=fs.readFileSync(path.join(app,file),"utf8");
  assert.ok(source.includes("firebase")||source.includes("@/lib/firebase"),file+" lacks Firebase integration");
}
console.log("Phase 4 Admin route, auth, and cache checks passed.");
