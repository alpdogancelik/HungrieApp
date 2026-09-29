import test from "node:test";
import assert from "node:assert/strict";
import { runForegroundNotificationHandler, settleBestEffortPresentation } from "../apps/restaurant/src/foregroundNotificationHandler.ts";

const payload = { data: { eventId: "fg_1790662055439", eventType: "restaurant_new_order", orderId: "", route: "/orders", title: "Hungrie Restaurant", body: "Foreground delivery verification.", qualificationCorrelationId: "fg_1790662055439" } };
const capture = () => { const events = []; return { events, record: (stage, value, detail) => events.push({ stage, correlationId: value?.data?.qualificationCorrelationId || null, detail }) }; };

test("the exact Qualification AC message reaches and completes the application handler once", async () => {
  const observed = capture();
  const result = await runForegroundNotificationHandler({ payload, alert: async () => ({ disposition: "presented", audio: "completed", notification: "completed" }), record: observed.record });
  assert.equal(result.status, "completed");
  assert.deepEqual(observed.events.map(event => event.stage), ["app_foreground_handler_entered", "app_foreground_audio_settled", "app_foreground_notification_settled", "app_foreground_handler_completed"]);
  assert.equal(observed.events.every(event => event.correlationId === payload.data.qualificationCorrelationId), true);
});

test("deduplication remains production behavior and is explicitly classified", async () => {
  const observed = capture();
  await runForegroundNotificationHandler({ payload, alert: async () => ({ disposition: "deduplicated", audio: "skipped", notification: "skipped" }), record: observed.record });
  assert.equal(observed.events.some(event => event.stage === "app_foreground_handler_deduplicated" && event.detail.classification === "APP_HANDLER_DEDUPLICATED_AS_EXPECTED"), true);
  assert.equal(observed.events.at(-1).stage, "app_foreground_handler_completed");
});

test("synchronous throws and asynchronous rejections produce sanitized correlated failure stages", async () => {
  for (const [alert, asynchronous] of [[() => { throw new TypeError("secret-bearing detail"); }, false], [async () => { throw new Error("secret-bearing detail"); }, true]]) {
    const observed = capture(), result = await runForegroundNotificationHandler({ payload, alert, record: observed.record });
    assert.equal(result.status, "failed");
    const failure = observed.events.at(-1);
    assert.equal(failure.stage, "app_foreground_handler_failed");
    assert.equal(failure.detail.asynchronous, asynchronous);
    assert.equal(JSON.stringify(failure).includes("secret-bearing"), false);
    assert.equal(observed.events.some(event => event.stage === "app_foreground_handler_completed"), false);
  }
});

test("best-effort alert failures and stalled audio settle without hanging the handler", async () => {
  assert.equal(await settleBestEffortPresentation(async () => { throw new Error("audio denied"); }, 20), "failed");
  assert.equal(await settleBestEffortPresentation(() => new Promise(() => {}), 5), "timed_out");
  const observed = capture();
  await runForegroundNotificationHandler({ payload, alert: async () => ({ disposition: "presented", audio: "timed_out", notification: "failed" }), record: observed.record });
  assert.equal(observed.events.at(-1).stage, "app_foreground_handler_completed");
  assert.deepEqual(observed.events.filter(event => event.stage.endsWith("_settled")).map(event => event.detail), [{ status: "timed_out", critical: false }, { status: "failed", critical: false }]);
});
