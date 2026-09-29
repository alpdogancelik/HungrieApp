import test from "node:test";
import assert from "node:assert/strict";
import { buildProductionRepresentativeMessage, classifyDeliveryStages, ForegroundSendGuard, validateForegroundSendGate } from "./restaurant-vercel-fcm-qualification.mjs";

const identity = { projectId: "hungrieapp-a2288", appId: "1:405094874808:web:34b9ea3e4b1d3b70a6fe4d", scope: "https://preview.example/" };
const readyEvents = [
  { stage: "foreground_listener_ready", observedAt: "2026-09-29T00:00:00Z", correlationId: null, detail: identity },
  { stage: "push_binding_ready", observedAt: "2026-09-29T00:00:01Z", correlationId: null, detail: identity },
];
const gate = { events: readyEvents, visibilityState: "visible", pageClosed: false, navigationInProgress: false, permission: "granted", serviceWorker: { scope: identity.scope, scopePath: "/", activePath: "/sw.js", controllerPath: "/sw.js" }, pushSubscription: { present: true, endpointSha256: "a".repeat(64) } };

test("foreground send requires a live listener and exact token/service-worker binding", () => {
  assert.equal(validateForegroundSendGate(gate).status, "PASS");
  assert.throws(() => validateForegroundSendGate({ ...gate, events: [] }), /listener is not ready/);
  assert.throws(() => validateForegroundSendGate({ ...gate, events: [...readyEvents, { stage: "foreground_listener_removed" }] }), /listener is not ready/);
  assert.throws(() => validateForegroundSendGate({ ...gate, visibilityState: "hidden" }), /not visible/);
  assert.throws(() => validateForegroundSendGate({ ...gate, serviceWorker: { ...gate.serviceWorker, controllerPath: "/other.js" } }), /binding is invalid/);
  assert.throws(() => validateForegroundSendGate({ ...gate, events: [readyEvents[0], { ...readyEvents[1], detail: { ...identity, projectId: "wrong" } }] }), /do not match/);
});

test("qualification message matches the production data-only Web Push contract", () => {
  const message = buildProductionRepresentativeMessage({ token: "not-persisted", correlationId: "qualification_1" });
  assert.equal(message.notification, undefined);
  assert.deepEqual(message.webpush, { headers: { Urgency: "high" } });
  assert.equal(message.data.eventType, "restaurant_new_order");
  assert.equal(message.data.route, "/orders");
  assert.equal(message.data.qualificationCorrelationId, "qualification_1");
  assert.throws(() => buildProductionRepresentativeMessage({ token: "x", correlationId: "bad value" }), /safe qualification/);
});

test("delivery evidence identifies the first missing stage without retrying", () => {
  const correlationId = "q1";
  const pageOnly = [{ stage: "browser_push_event", correlationId }, { stage: "page_on_message", correlationId }];
  assert.equal(classifyDeliveryStages(pageOnly, correlationId, true).firstMissingStage, "APP_FOREGROUND_HANDLER");
  assert.equal(classifyDeliveryStages([], correlationId, true).firstMissingStage, "BROWSER_PUSH_SERVICE");
  const complete = [...pageOnly, { stage: "app_foreground_handler_completed", correlationId }];
  assert.equal(classifyDeliveryStages(complete, correlationId, true).status, "PASS");
});

test("a delivery timeout cannot authorize a duplicate foreground send", () => {
  const guard = new ForegroundSendGuard();
  assert.equal(guard.authorize(gate).status, "PASS");
  assert.equal(guard.consumed, true);
  assert.throws(() => guard.authorize(gate), /already consumed/);
});

test("application source records bounded sanitized stages before timeout classification", async () => {
  const fs = await import("node:fs");
  const runtime = fs.readFileSync(new URL("../apps/restaurant/src/RestaurantRuntimeContext.tsx", import.meta.url), "utf8");
  const card = fs.readFileSync(new URL("../apps/restaurant/src/NotificationCard.tsx", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("../apps/restaurant/public/sw.js", import.meta.url), "utf8");
  assert.match(runtime, /foreground_listener_ready/);
  assert.match(runtime, /page_on_message/);
  assert.match(runtime, /app_foreground_handler_completed/);
  assert.match(card, /validateMessagingServiceWorker\(registration\)/);
  assert.match(card, /pushManager\.getSubscription\(\)/);
  assert.match(worker, /browser_push_event/);
  assert.match(worker, /firebase_background_message/);
  assert.doesNotMatch(worker, /console\.log/);
});
