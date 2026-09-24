#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { renderPhase5Scenario } from "../apps/restaurant/test/qualification/phase5Adapter.mjs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "docs/restaurant-responsive-ui-phase5-evidence/safari-site");
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, "phase5-assets"), { recursive: true, mode: 0o700 });
for (const file of ["tokens.css", "typography.css", "components.css", "responsive.css"]) {
  fs.copyFileSync(path.join(root, "apps/restaurant/src/design", file), path.join(output, "phase5-assets", file));
}
for (const locale of ["en", "tr"]) {
  for (const scenario of ["dashboard", "orders-many", "menu-long", "review-report", "alerts-install"]) {
    fs.writeFileSync(path.join(output, `${scenario}-${locale}.html`), renderPhase5Scenario(scenario, locale), { mode: 0o600 });
  }
}
console.log(output);
