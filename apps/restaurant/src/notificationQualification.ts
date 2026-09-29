import type { FirebaseApp } from "firebase/app";
import type { MessagePayload } from "firebase/messaging";

export type NotificationQualificationStage =
  | "foreground_listener_initializing" | "foreground_listener_ready" | "foreground_listener_failed" | "foreground_listener_removed"
  | "browser_push_event" | "firebase_background_message" | "page_on_message"
  | "app_foreground_handler_completed" | "app_foreground_handler_failed" | "app_background_handler_completed"
  | "push_binding_ready" | "push_binding_failed";

export type NotificationQualificationEvent = {
  stage: NotificationQualificationStage;
  observedAt: string;
  correlationId: string | null;
  detail?: Record<string, string | number | boolean | null>;
};

type QualificationHook = { enabled: true; events: NotificationQualificationEvent[] };

declare global { interface Window { __HUNGRIE_NOTIFICATION_QUALIFICATION__?: QualificationHook } }

const correlation = (payload?: Pick<MessagePayload, "data">) => {
  const value = String(payload?.data?.qualificationCorrelationId || "");
  return /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : null;
};

export function recordNotificationQualification(stage: NotificationQualificationStage, payload?: Pick<MessagePayload, "data">, detail?: Record<string, string | number | boolean | null>) {
  if (typeof window === "undefined") return;
  const hook = window.__HUNGRIE_NOTIFICATION_QUALIFICATION__;
  if (!hook || hook.enabled !== true || !Array.isArray(hook.events)) return;
  hook.events.push({ stage, observedAt: new Date().toISOString(), correlationId: correlation(payload), ...(detail ? { detail } : {}) });
  if (hook.events.length > 100) hook.events.splice(0, hook.events.length - 100);
}

export function firebaseMessagingIdentity(app: FirebaseApp) {
  return { appName: app.name, projectId: String(app.options.projectId || ""), appId: String(app.options.appId || "") };
}

export function validateMessagingServiceWorker(registration: ServiceWorkerRegistration) {
  const expectedScope = `${window.location.origin}/`;
  const activeUrl = registration.active?.scriptURL ? new URL(registration.active.scriptURL) : null;
  const controllerUrl = navigator.serviceWorker.controller?.scriptURL ? new URL(navigator.serviceWorker.controller.scriptURL) : null;
  if (registration.scope !== expectedScope || !activeUrl || activeUrl.origin !== window.location.origin || activeUrl.pathname !== "/sw.js" || !controllerUrl || controllerUrl.origin !== window.location.origin || controllerUrl.pathname !== "/sw.js") throw new Error("The Firebase Messaging service-worker binding is invalid.");
  return { scope: registration.scope, activePath: activeUrl.pathname, controllerPath: controllerUrl.pathname };
}

export function acceptServiceWorkerQualificationMessage(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const message = value as { source?: unknown; stage?: unknown; correlationId?: unknown };
  if (message.source !== "hungrie-restaurant-notification-qualification-v1") return false;
  if (!["browser_push_event", "firebase_background_message", "app_background_handler_completed"].includes(String(message.stage))) return false;
  const correlationId = String(message.correlationId || "");
  if (correlationId && !/^[a-zA-Z0-9_-]{1,80}$/.test(correlationId)) return false;
  recordNotificationQualification(message.stage as NotificationQualificationStage, { data: correlationId ? { qualificationCorrelationId: correlationId } : {} });
  return true;
}
