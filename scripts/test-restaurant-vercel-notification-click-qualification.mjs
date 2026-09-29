import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { CLICK_QUALIFICATION, buildAuthorizationText, validateClickNavigation, verifyPrerequisiteEvidence } from "./restaurant-vercel-notification-click-qualification.mjs";

test("click qualification authorizes only one background send and one physical click", () => {
  const text = buildAuthorizationText({ sourceCommit: "a".repeat(40), sourceManifestSha256: "b".repeat(64), operatorSha256: "c".repeat(64) });
  assert.match(text, /zero foreground sends, exactly one direct token-targeted background FCM message/);
  assert.match(text, /one physical owner click/);
  assert.match(text, /No simulated click, synthetic notification event, manual qualifying navigation/);
  assert.deepEqual(CLICK_QUALIFICATION.limits, { bypassCreates: 1, bypassRevokes: 1, projectVerificationGets: 1, ownerContexts: 1, registrations: 1, foregroundSends: 0, backgroundSends: 1, clickObservations: 1, unregistrations: 1, retries: 0, authorityValidityMs: 7200000 });
});

test("real click navigation requires exact origin, path, query, and no automation navigation", () => {
  const valid = { eventType: "FRAME_NAVIGATED", commandIssuedAfterSend: false, origin: CLICK_QUALIFICATION.origin, path: CLICK_QUALIFICATION.expectedPath, orderId: CLICK_QUALIFICATION.expectedOrderId, unexpectedOrigins: [] };
  assert.equal(validateClickNavigation(valid).passed, true);
  for (const changed of [{ commandIssuedAfterSend: true }, { origin: "https://wrong.invalid" }, { path: "/orders" }, { orderId: "wrong" }, { unexpectedOrigins: ["https://wrong.invalid"] }, { eventType: "SYNTHETIC" }]) assert.throws(() => validateClickNavigation({ ...valid, ...changed }));
});

test("immutable AE notification evidence remains bound", () => assert.equal(verifyPrerequisiteEvidence(path.resolve(import.meta.dirname, "..")), true));
