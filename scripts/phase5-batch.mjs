import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export const migrations=["20260913140000_phase5_restaurant_desktop.sql","20260913141000_phase5_restaurant_contracts.sql","20260913142000_phase5_customer_menu_v2.sql"];
export const developmentMigrations=["20260913110000_phase4_public_rpc_type_boundary.sql",...migrations];
export const digestFiles=(files)=>{const hash=crypto.createHash("sha256");for(const name of files)hash.update(name).update("\0").update(fs.readFileSync(path.join(root,name))).update("\0");return hash.digest("hex")};
export const migrationSha=(files=migrations)=>digestFiles(files.map(name=>`supabase/migrations/${name}`));
export const functionFiles=["functions/index.js","functions/phase5RestaurantPushLogic.js","functions/package.json","functions/package-lock.json"];
const walk=(relative)=>fs.readdirSync(path.join(root,relative),{withFileTypes:true}).flatMap(entry=>{
  const name=`${relative}/${entry.name}`;if(entry.isDirectory())return walk(name);return[name];
});
export const restaurantFiles=[...walk("apps/restaurant/app"),...walk("apps/restaurant/src"),
  ...walk("apps/restaurant/scripts"),"apps/restaurant/app.json","apps/restaurant/eas.json",
  "apps/restaurant/public/sw.js","apps/restaurant/package.json","package-lock.json",
  "apps/admin-web/components/AdminControls.tsx"].sort();
