import { buildExpoMessage, classifyExpoError, classifyHttpFailure, sanitizeError, type Delivery } from "./logic.ts";

type RpcResult = { data?: any; error?: any };
type AdminClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult> };

const expoHeaders = (accessToken: string) => ({
  "content-type": "application/json",
  accept: "application/json",
  authorization: `Bearer ${accessToken}`,
});

const recordDelivery = async (admin: AdminClient, deliveryId: string, outcome: string,
  ticketId?: string | null, code?: string | null, message?: string | null) => {
  const { error } = await admin.rpc("record_notification_delivery_result", {
    p_delivery_id: deliveryId,
    p_outcome: outcome,
    p_ticket_id: ticketId || null,
    p_error_code: code || null,
    p_error_message: message ? sanitizeError(message) : null,
  });
  if (error) throw error;
};

export const dispatchNotifications = async (
  admin: AdminClient,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
) => {
  const { data, error } = await admin.rpc("claim_notification_deliveries", { p_limit: 100 });
  if (error) throw error;
  const deliveries = (data || []) as Delivery[];
  if (!deliveries.length) return { claimed: 0, ticketed: 0, retried: 0, dead: 0 };

  let response: Response;
  try {
    response = await fetchImpl("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: expoHeaders(accessToken),
      body: JSON.stringify(deliveries.map(buildExpoMessage)),
    });
  } catch (cause) {
    await Promise.all(deliveries.map((item) => recordDelivery(admin, item.delivery_id, "retry", null, "NETWORK", sanitizeError(cause))));
    return { claimed: deliveries.length, ticketed: 0, retried: deliveries.length, dead: 0 };
  }

  if (!response.ok) {
    const outcome = classifyHttpFailure(response.status);
    const message = sanitizeError(await response.text());
    await Promise.all(deliveries.map((item) => recordDelivery(admin, item.delivery_id, outcome, null, `HTTP_${response.status}`, message)));
    return { claimed: deliveries.length, ticketed: 0, retried: outcome === "retry" ? deliveries.length : 0, dead: outcome === "permanent" ? deliveries.length : 0 };
  }

  const payload = await response.json().catch(() => ({}));
  const tickets = Array.isArray(payload?.data) ? payload.data : [];
  let ticketed = 0;
  let retried = 0;
  let dead = 0;
  for (let index = 0; index < deliveries.length; index += 1) {
    const ticket = tickets[index];
    if (ticket?.status === "ok" && ticket?.id) {
      await recordDelivery(admin, deliveries[index].delivery_id, "ticketed", ticket.id);
      ticketed += 1;
    } else {
      const code = ticket?.details?.error || payload?.errors?.[0]?.code || "INVALID_RESPONSE";
      const outcome = classifyExpoError(code);
      await recordDelivery(admin, deliveries[index].delivery_id, outcome, null, code, ticket?.message || "Expo rejected notification");
      outcome === "retry" ? retried += 1 : dead += 1;
    }
  }
  return { claimed: deliveries.length, ticketed, retried, dead };
};

export const checkNotificationReceipts = async (
  admin: AdminClient,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
) => {
  const { data, error } = await admin.rpc("claim_notification_receipts", { p_limit: 1000 });
  if (error) throw error;
  const candidates = data || [];
  if (!candidates.length) return { checked: 0, delivered: 0, failed: 0, missing: 0 };
  const response = await fetchImpl("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: expoHeaders(accessToken),
    body: JSON.stringify({ ids: candidates.map((item: any) => item.ticket_id) }),
  });
  if (!response.ok) throw new Error(`Expo receipt HTTP ${response.status}`);
  const payload = await response.json().catch(() => ({}));
  let delivered = 0;
  let failed = 0;
  let missing = 0;
  for (const item of candidates) {
    const receipt = payload?.data?.[item.ticket_id];
    const outcome = !receipt ? "missing" : receipt.status === "ok" ? "delivered" : "failed";
    const code = receipt?.details?.error || null;
    const { error: recordError } = await admin.rpc("record_notification_receipt", {
      p_delivery_id: item.delivery_id,
      p_outcome: outcome,
      p_error_code: code,
      p_error_message: receipt?.message ? sanitizeError(receipt.message) : null,
    });
    if (recordError) throw recordError;
    outcome === "delivered" ? delivered += 1 : outcome === "missing" ? missing += 1 : failed += 1;
  }
  return { checked: candidates.length, delivered, failed, missing };
};
