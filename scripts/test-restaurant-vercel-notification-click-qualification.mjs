import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { CLICK_QUALIFICATION, buildAuthorizationText, validateClickNavigation, validateRealNotificationClickEvidence, verifyPrerequisiteEvidence } from "./restaurant-vercel-notification-click-qualification.mjs";

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

test("real click passes with direct WindowClient evidence even when document.hasFocus is false", () => {
  const expectedUrl = `${CLICK_QUALIFICATION.origin}${CLICK_QUALIFICATION.expectedPath}?orderId=${CLICK_QUALIFICATION.expectedOrderId}`;
  const evidence = {
    realPhysicalClick: true, syntheticEventDispatched: false, manualQualifyingNavigation: false, commandIssuedAfterSend: false, correlationId: "click-correlation",
    event: { type: "notificationclick", tag: "click-correlation", closed: true, observerCompleted: true },
    operations: { navigate: { called: true, settled: "fulfilled", targetUrl: expectedUrl }, focus: { called: true, settled: "fulfilled", result: { focused: false } } },
    afterClients: [{ url: expectedUrl, focused: false, visibilityState: "visible" }],
    navigation: { eventType: "FRAME_NAVIGATED", commandIssuedAfterSend: false, origin: CLICK_QUALIFICATION.origin, path: CLICK_QUALIFICATION.expectedPath, orderId: CLICK_QUALIFICATION.expectedOrderId, unexpectedOrigins: [] },
    page: { visibilityState: "visible", documentHasFocus: false },
  };
  assert.deepEqual(validateRealNotificationClickEvidence(evidence), { passed: true, mode: "EXISTING_CLIENT_NAVIGATE_AND_FOCUS", documentHasFocus: false, windowClientFocused: false, url: expectedUrl });
});

test("real click rejects missing event, wrong correlation, operation failures, wrong navigation, synthetic or invisible results", () => {
  const expectedUrl = `${CLICK_QUALIFICATION.origin}${CLICK_QUALIFICATION.expectedPath}?orderId=${CLICK_QUALIFICATION.expectedOrderId}`;
  const base = { realPhysicalClick: true, syntheticEventDispatched: false, manualQualifyingNavigation: false, commandIssuedAfterSend: false, correlationId: "c", event: { type: "notificationclick", tag: "c", closed: true, observerCompleted: true }, operations: { navigate: { called: true, settled: "fulfilled", targetUrl: expectedUrl }, focus: { called: true, settled: "fulfilled", result: { focused: true } } }, afterClients: [{ url: expectedUrl, focused: true, visibilityState: "visible" }], navigation: { eventType: "FRAME_NAVIGATED", commandIssuedAfterSend: false, origin: CLICK_QUALIFICATION.origin, path: CLICK_QUALIFICATION.expectedPath, orderId: CLICK_QUALIFICATION.expectedOrderId, unexpectedOrigins: [] }, page: { visibilityState: "visible", documentHasFocus: false } };
  for (const mutate of [v=>{v.event=null},v=>{v.event.tag="wrong"},v=>{v.operations.focus.settled="rejected"},v=>{v.operations.navigate.targetUrl=CLICK_QUALIFICATION.origin+"/wrong"},v=>{v.navigation.path="/wrong"},v=>{v.syntheticEventDispatched=true},v=>{v.manualQualifyingNavigation=true},v=>{v.afterClients[0].visibilityState="hidden"},v=>{v.event.observerCompleted=false}]) { const value=structuredClone(base); mutate(value); assert.throws(()=>validateRealNotificationClickEvidence(value)); }
});
