import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeOrderFlow } from "./phase7-order-flow.mjs";

test("an uncertain create reuses its operation and transitions recover from authoritative state", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "phase7-order-flow-")), stateFile = path.join(directory, "unit.json"), calls = [];
  const operationIds = { create: "create-stable", preparing: "prepare-stable", out_for_delivery: "out-stable", delivered: "deliver-stable" };
  let status = "preparing", version = "2026-09-18T00:00:00Z";
  const rpc = async (_context, _token, name, args) => {
    calls.push({ name, args });
    if (name === "quote_order_v2") return { ok: true, status: 200, body: {}, latencyMs: 4 };
    if (name === "create_order_v2") return { ok: true, status: 200, body: { orderId: "server-order", replayed: true }, latencyMs: 5 };
    if (name === "get_my_customer_order_v1") return { ok: true, status: 200, body: { id: "server-order", status, updated_at: version }, latencyMs: 3 };
    if (name === "restaurant_transition_order_v1") { status = args.p_new_status; version = `${version}-next`; return { ok: true, status: 200, body: { status, version }, latencyMs: 6 }; }
    throw new Error("unexpected RPC");
  };
  const outcome = await executeOrderFlow({ context: {}, fixtures: { firebaseUids: {}, restaurant: "r", item: "i", address: "a" }, operationIds, stateFile, label: "test", dependencies: { rpc, session: async () => ({ customer: "c", restaurant: "r", close: async () => {} }) } });
  assert.equal(outcome.authoritativeTerminalState, "delivered");
  assert.equal(calls.find(value => value.name === "create_order_v2").args.p_operation_id, "create-stable");
  assert.equal(calls.some(value => value.name === "restaurant_transition_order_v1" && value.args.p_new_status === "preparing"), false);
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).steps.preparing.recoveredFromAuthoritativeState, true);
});
