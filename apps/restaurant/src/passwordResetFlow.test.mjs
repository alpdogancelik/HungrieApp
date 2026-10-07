import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { requestRestaurantPasswordReset } from "./passwordResetFlow.ts";

test("Restaurant public recovery normalizes existing, missing, and disabled accounts", async () => {
  const success = await requestRestaurantPasswordReset({ email: "existing@example.test", send: async () => undefined });
  const missing = await requestRestaurantPasswordReset({
    email: "missing@example.test",
    send: async () => { throw Object.assign(new Error("synthetic missing"), { code: "auth/user-not-found" }); },
  });
  const disabled = await requestRestaurantPasswordReset({
    email: "disabled@example.test",
    send: async () => { throw Object.assign(new Error("synthetic disabled"), { code: "auth/user-disabled" }); },
  });
  assert.equal(success, "accepted");
  assert.equal(missing, success);
  assert.equal(disabled, success);
});

test("Restaurant public recovery reports rate and technical failures without provider detail", async () => {
  for (const [code, expected] of [
    ["auth/too-many-requests", "rate_limited"],
    ["auth/network-request-failed", "technical_failure"],
    ["auth/internal-error", "technical_failure"],
  ]) {
    const result = await requestRestaurantPasswordReset({
      email: "synthetic@example.test",
      send: async () => { throw Object.assign(new Error("synthetic provider response"), { code }); },
    });
    assert.equal(result, expected);
    assert.equal(JSON.stringify(result).includes("synthetic"), false);
  }
});

test("Restaurant reset surfaces do not log email, provider errors, or action links", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const source = ["app/forgot-password.tsx", "src/SecurityPage.tsx", "src/passwordResetFlow.ts"]
    .map((relative) => fs.readFileSync(path.join(root, relative), "utf8")).join("\n");
  assert.doesNotMatch(source, /console\.(?:log|warn|error)|oobCode|continueUrl/);
  assert.doesNotMatch(source, /error\.message|userExists|accountFound/);
});
