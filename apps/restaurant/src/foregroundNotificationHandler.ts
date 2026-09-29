import type { MessagePayload } from "firebase/messaging";

export type AlertPresentationStatus = "completed" | "failed" | "timed_out" | "skipped";
export type RestaurantAlertOutcome = {
  disposition: "presented" | "deduplicated";
  audio: AlertPresentationStatus;
  notification: AlertPresentationStatus;
};

type ForegroundQualificationStage = "app_foreground_handler_entered" | "app_foreground_handler_deduplicated" | "app_foreground_audio_settled" | "app_foreground_notification_settled" | "app_foreground_handler_completed" | "app_foreground_handler_failed";
type QualificationRecorder = (stage: ForegroundQualificationStage, payload?: Pick<MessagePayload, "data">, detail?: Record<string, string | number | boolean | null>) => void;

const errorCategory = (error: unknown) => {
  if (error instanceof TypeError) return "TYPE_ERROR";
  if (typeof DOMException !== "undefined" && error instanceof DOMException) return "DOM_EXCEPTION";
  return "APPLICATION_ERROR";
};

export async function runForegroundNotificationHandler({ payload, alert, record }: {
  payload: MessagePayload;
  alert: (payload: MessagePayload) => Promise<RestaurantAlertOutcome>;
  record: QualificationRecorder;
}) {
  record("app_foreground_handler_entered", payload);
  let pending: Promise<RestaurantAlertOutcome>;
  try {
    pending = alert(payload);
  } catch (error) {
    record("app_foreground_handler_failed", payload, { category: errorCategory(error), asynchronous: false, applicationContinued: true });
    return { status: "failed" as const, asynchronous: false };
  }
  try {
    const outcome = await pending;
    if (outcome.disposition === "deduplicated") record("app_foreground_handler_deduplicated", payload, { classification: "APP_HANDLER_DEDUPLICATED_AS_EXPECTED" });
    record("app_foreground_audio_settled", payload, { status: outcome.audio, critical: false });
    record("app_foreground_notification_settled", payload, { status: outcome.notification, critical: false });
    record("app_foreground_handler_completed", payload, { disposition: outcome.disposition });
    return { status: "completed" as const, outcome };
  } catch (error) {
    record("app_foreground_handler_failed", payload, { category: errorCategory(error), asynchronous: true, applicationContinued: true });
    return { status: "failed" as const, asynchronous: true };
  }
}

export async function settleBestEffortPresentation(task: () => Promise<void>, timeoutMs = 1_500): Promise<AlertPresentationStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = Promise.resolve().then(task).then<AlertPresentationStatus>(() => "completed").catch<AlertPresentationStatus>(() => "failed");
  const timeout = new Promise<AlertPresentationStatus>(resolve => { timer = setTimeout(() => resolve("timed_out"), timeoutMs); });
  const result = await Promise.race([work, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}
