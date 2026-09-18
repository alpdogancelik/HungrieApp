import crypto from "node:crypto";
import fs from "node:fs";
import { atomicWriteJson } from "./phase7-runner-lib.mjs";
import { exchange, firebaseApp, rpc } from "./phase7-staging-client.mjs";

export async function executeOrderFlow({ context, fixtures, operationIds, stateFile, label, dependencies = {} }) {
  const saved = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : { steps: {}, orderId: null };
  const rpcFn = dependencies.rpc || rpc;
  const session = dependencies.session ? await dependencies.session() : await (async () => {
    const app = firebaseApp(context, label), auth = app.auth();
    return { customer: await exchange(context, await auth.createCustomToken(fixtures.firebaseUids.customer, { role: "authenticated" })), restaurant: await exchange(context, await auth.createCustomToken(fixtures.firebaseUids.restaurant, { role: "authenticated" })), close: () => app.delete() };
  })();
  const metric = (step, result, extra = {}) => { saved.steps[step] = { completedAt: new Date().toISOString(), latencyMs: Math.round(result.latencyMs), status: result.status, ...extra }; atomicWriteJson(stateFile, saved); };
  const must = (step, result) => { metric(step, result); if (!result.ok) throw new Error(`${step} failed (${result.status}, ${String(result.code || "unknown").replace(/[^A-Za-z0-9]/g, "")}).`); return result.body; };
  try {
    const { customer, restaurant } = session;
    const items = [{ menuItemId: fixtures.item, quantity: 1, optionValueIds: [], removedIngredientIds: [] }];
    if (!saved.steps.quote) must("quote", await rpcFn(context, customer, "quote_order_v2", { p_restaurant_id: fixtures.restaurant, p_items: items }));
    if (!saved.steps.create || !saved.orderId) {
      const result = await rpcFn(context, customer, "create_order_v2", { p_restaurant_id: fixtures.restaurant, p_address_id: fixtures.address, p_payment_method: "cash", p_items: items, p_notes: "", p_operation_id: operationIds.create });
      const created = must("create", result); saved.orderId = created.orderId; atomicWriteJson(stateFile, saved);
    }
    const advance = async (step, target) => {
      if (saved.steps[step]) return;
      const observedResult = await rpcFn(context, customer, "get_my_customer_order_v1", { p_order_id: saved.orderId });
      const observed = must(`${step}.observe`, observedResult), ranks = { pending: 0, preparing: 1, ready: 2, out_for_delivery: 3, delivered: 4 };
      if ((ranks[observed.status] ?? -1) >= ranks[target]) { saved.steps[step] = { completedAt: new Date().toISOString(), recoveredFromAuthoritativeState: true }; atomicWriteJson(stateFile, saved); return; }
      const result = await rpcFn(context, restaurant, "restaurant_transition_order_v1", { p_order_id: saved.orderId, p_expected_version: observed.updated_at, p_new_status: target, p_reason_code: null, p_note: null, p_operation_id: operationIds[step] });
      const transitioned = must(step, result); saved.steps[step].version = transitioned.version; atomicWriteJson(stateFile, saved);
    };
    await advance("preparing", "preparing"); await advance("out_for_delivery", "out_for_delivery"); await advance("delivered", "delivered");
    const final = must("verify", await rpcFn(context, customer, "get_my_customer_order_v1", { p_order_id: saved.orderId }));
    if (final.status !== "delivered") throw new Error("Order flow lacks authoritative delivered state.");
    return { authoritativeTerminalState: "delivered", orderIdDigest: crypto.createHash("sha256").update(saved.orderId).digest("hex"), measurements: Object.fromEntries(Object.entries(saved.steps).map(([key, value]) => [key, value.latencyMs ?? null])) };
  } finally { await session.close(); }
}
