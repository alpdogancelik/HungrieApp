import crypto from "node:crypto";

export const EXPECTED_FIREBASE = Object.freeze({
  projectId: "hungrieapp-a2288",
  appId: "1:405094874808:web:34b9ea3e4b1d3b70a6fe4d",
  serviceWorkerPath: "/sw.js",
  serviceWorkerScopePath: "/",
});

export function buildProductionRepresentativeMessage({ token, correlationId, background = false }) {
  if (typeof token !== "string" || !token) throw new Error("An FCM token is required.");
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(correlationId)) throw new Error("A safe qualification correlation ID is required.");
  return {
    token,
    data: {
      eventId: correlationId,
      eventType: "restaurant_new_order",
      orderId: "",
      route: "/orders",
      title: "Hungrie Restaurant",
      body: background ? "Background delivery verification." : "Foreground delivery verification.",
      qualificationCorrelationId: correlationId,
    },
    webpush: { headers: { Urgency: "high" } },
  };
}

export function validateForegroundSendGate({ events, visibilityState, pageClosed, navigationInProgress, permission, serviceWorker, pushSubscription }) {
  if (visibilityState !== "visible") throw new Error("Foreground qualification page is not visible.");
  if (pageClosed) throw new Error("Foreground qualification page is closed.");
  if (navigationInProgress) throw new Error("Foreground qualification navigation is not settled.");
  if (permission !== "granted") throw new Error("Notification permission is not granted.");
  let scopePath = serviceWorker?.scopePath;
  if (scopePath === undefined && typeof serviceWorker?.scope === "string") {
    try { scopePath = new URL(serviceWorker.scope).pathname; } catch { scopePath = null; }
  }
  if (!serviceWorker || scopePath !== "/" || serviceWorker.activePath !== "/sw.js" || serviceWorker.controllerPath !== "/sw.js") throw new Error("Messaging service-worker binding is invalid.");
  if (!pushSubscription?.present || !/^[a-f0-9]{64}$/.test(String(pushSubscription.endpointSha256 || ""))) throw new Error("Push subscription evidence is incomplete.");
  const listenerEvents = events.filter(event => ["foreground_listener_ready", "foreground_listener_removed", "foreground_listener_failed"].includes(event.stage));
  if (!listenerEvents.length || listenerEvents.at(-1).stage !== "foreground_listener_ready") throw new Error("Foreground listener is not ready.");
  const binding = [...events].reverse().find(event => event.stage === "push_binding_ready");
  if (!binding || binding.detail?.projectId !== EXPECTED_FIREBASE.projectId || binding.detail?.appId !== EXPECTED_FIREBASE.appId || binding.detail?.scope !== serviceWorker.scope) throw new Error("Token and foreground listener Firebase bindings do not match.");
  return { status: "PASS", listenerReadyAt: listenerEvents.at(-1).observedAt, bindingReadyAt: binding.observedAt };
}

export function classifyDeliveryStages(events, correlationId, providerAccepted) {
  const observed = new Set(events.filter(event => event.correlationId === correlationId).map(event => event.stage));
  const stages = {
    providerAccepted: Boolean(providerAccepted),
    browserPush: observed.has("browser_push_event"),
    firebaseMessaging: observed.has("page_on_message") || observed.has("firebase_background_message"),
    pageOnMessage: observed.has("page_on_message"),
    appForegroundHandler: observed.has("app_foreground_handler_completed"),
    qualifierObserver: observed.has("app_foreground_handler_completed"),
  };
  const order = [["providerAccepted", "FCM_PROVIDER"], ["browserPush", "BROWSER_PUSH_SERVICE"], ["firebaseMessaging", "FIREBASE_MESSAGING_RUNTIME"], ["pageOnMessage", "PAGE_ON_MESSAGE"], ["appForegroundHandler", "APP_FOREGROUND_HANDLER"], ["qualifierObserver", "QUALIFIER_OBSERVER"]];
  const firstMissingStage = order.find(([key]) => !stages[key])?.[1] || null;
  return { stages, firstMissingStage, status: firstMissingStage ? "FAIL" : "PASS" };
}

export class ForegroundSendGuard {
  #consumed = false;
  authorize(gate) {
    if (this.#consumed) throw new Error("The foreground FCM send attempt is already consumed.");
    const result = validateForegroundSendGate(gate);
    this.#consumed = true;
    return result;
  }
  get consumed() { return this.#consumed; }
}

export const fingerprint = value => crypto.createHash("sha256").update(String(value)).digest("hex");
