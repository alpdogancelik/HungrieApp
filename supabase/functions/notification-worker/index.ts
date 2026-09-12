import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sanitizeError } from "./logic.ts";
import { checkNotificationReceipts, dispatchNotifications } from "./worker.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const expected = Deno.env.get("NOTIFICATION_WORKER_SECRET") || "";
  if (!expected || request.headers.get("x-worker-secret") !== expected) return json({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey || !Deno.env.get("EXPO_ACCESS_TOKEN")) return json({ error: "Worker is not configured" }, 503);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN")!;
    return json(body?.mode === "receipts"
      ? await checkNotificationReceipts(admin, accessToken)
      : await dispatchNotifications(admin, accessToken));
  } catch (cause) {
    console.error("notification-worker failed", sanitizeError(cause));
    return json({ error: "Worker failed" }, 500);
  }
});
