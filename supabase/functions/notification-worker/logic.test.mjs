import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExpoMessage,
  classifyExpoError,
  classifyHttpFailure,
  sanitizeError,
} from "./logic.ts";
import { checkNotificationReceipts, dispatchNotifications } from "./worker.ts";

const delivery = {
  delivery_id: "delivery",
  event_id: "event",
  event_type: "order_status",
  order_id: "order",
  expected_status: "ready",
  token: "ExpoPushToken[test]",
  platform: "ios",
  preferred_language: "en",
  restaurant_name: "Fixture Restaurant",
};

test("builds a minimal localized order payload", () => {
  const message = buildExpoMessage(delivery);
  assert.equal(message.title, "Order ready");
  assert.deepEqual(message.data, { eventId: "event", type: "order_status", orderId: "order" });
  assert.equal(JSON.stringify(message).includes("delivery_id"), false);
});

test("uses Turkish for Customer order status and review notifications", () => {
  const orderMessage = buildExpoMessage({ ...delivery, preferred_language: "tr", expected_status: "delivered" });
  assert.equal(orderMessage.title, "Sipariş teslim edildi");
  assert.equal(orderMessage.body, "Fixture Restaurant: Afiyet olsun.");
  const reviewMessage = buildExpoMessage({ ...delivery, preferred_language: "tr", event_type: "review_reply" });
  assert.equal(reviewMessage.title, "Restoran yanıtladı");
});

test("uses the restaurant sound and Turkish copy", () => {
  const message = buildExpoMessage({ ...delivery, event_type: "restaurant_reminder", preferred_language: "tr" });
  assert.equal(message.title, "Sipariş hatırlatması");
  assert.equal(message.channelId, "orders");
  assert.equal(message.sound, "hungrie.wav");
});

test("classifies retryable and permanent transport errors", () => {
  assert.equal(classifyHttpFailure(429), "retry");
  assert.equal(classifyHttpFailure(503), "retry");
  assert.equal(classifyHttpFailure(400), "permanent");
  assert.equal(classifyExpoError("MessageRateExceeded"), "retry");
  assert.equal(classifyExpoError("DeviceNotRegistered"), "permanent");
});

test("redacts Expo push tokens from errors", () => {
  assert.equal(sanitizeError("bad ExpoPushToken[secret_value]"), "bad [push-token]");
});

const createAdmin = (claims) => {
  const calls = [];
  let claimIndex = 0;
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_notification_deliveries") {
        const data = Array.isArray(claims[0]) ? claims[Math.min(claimIndex++, claims.length - 1)] : claims;
        return { data, error: null };
      }
      if (name === "claim_notification_receipts") return { data: claims, error: null };
      return { data: null, error: null };
    },
  };
};

test("dispatch records accepted Expo tickets and uses enhanced push authentication", async () => {
  const admin = createAdmin([delivery]);
  let request;
  const result = await dispatchNotifications(admin, "access-token", async (_url, init) => {
    request = init;
    return new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket-1" }] }), { status: 200 });
  });
  assert.deepEqual(result, { claimed: 1, ticketed: 1, retried: 0, dead: 0 });
  assert.equal(request.headers.authorization, "Bearer access-token");
  assert.equal(admin.calls.at(-1).args.p_outcome, "ticketed");
});

test("dispatch retries rate limits and network timeouts", async () => {
  const limited = createAdmin([delivery]);
  assert.equal((await dispatchNotifications(limited, "token", async () => new Response("busy", { status: 429 }))).retried, 1);
  assert.equal(limited.calls.at(-1).args.p_outcome, "retry");

  const timedOut = createAdmin([delivery]);
  assert.equal((await dispatchNotifications(timedOut, "token", async () => { throw new Error("timeout ExpoPushToken[secret]"); })).retried, 1);
  assert.equal(timedOut.calls.at(-1).args.p_error_message.includes("secret"), false);
});

test("dispatch dead-letters invalid credentials and malformed responses", async () => {
  const invalid = createAdmin([delivery]);
  assert.equal((await dispatchNotifications(invalid, "token", async () => new Response("invalid", { status: 401 }))).dead, 1);
  assert.equal(invalid.calls.at(-1).args.p_outcome, "permanent");

  const malformed = createAdmin([delivery]);
  assert.equal((await dispatchNotifications(malformed, "token", async () => new Response("{}", { status: 200 }))).dead, 1);
  assert.equal(malformed.calls.at(-1).args.p_error_code, "INVALID_RESPONSE");
});

test("dispatch preserves DeviceNotRegistered for database token deactivation", async () => {
  const admin = createAdmin([delivery]);
  await dispatchNotifications(admin, "token", async () => new Response(JSON.stringify({
    data: [{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }],
  }), { status: 200 }));
  assert.equal(admin.calls.at(-1).args.p_outcome, "permanent");
  assert.equal(admin.calls.at(-1).args.p_error_code, "DeviceNotRegistered");
});

test("duplicate worker execution does not resend an already claimed delivery", async () => {
  const admin = createAdmin([[delivery], []]);
  let sends = 0;
  const fetchImpl = async () => {
    sends += 1;
    return new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket" }] }), { status: 200 });
  };
  await dispatchNotifications(admin, "token", fetchImpl);
  assert.deepEqual(await dispatchNotifications(admin, "token", fetchImpl), { claimed: 0, ticketed: 0, retried: 0, dead: 0 });
  assert.equal(sends, 1);
});

test("receipt polling records delivered, failed, and missing receipts without resending", async () => {
  const candidates = [
    { delivery_id: "d1", ticket_id: "t1", token_id: "p1" },
    { delivery_id: "d2", ticket_id: "t2", token_id: "p2" },
    { delivery_id: "d3", ticket_id: "t3", token_id: "p3" },
  ];
  const admin = createAdmin(candidates);
  const result = await checkNotificationReceipts(admin, "token", async () => new Response(JSON.stringify({ data: {
    t1: { status: "ok" },
    t2: { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
  } }), { status: 200 }));
  assert.deepEqual(result, { checked: 3, delivered: 1, failed: 1, missing: 1 });
  assert.deepEqual(admin.calls.filter((call) => call.name === "record_notification_receipt").map((call) => call.args.p_outcome), ["delivered", "failed", "missing"]);
});
