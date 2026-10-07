import * as Sentry from "@sentry/react-native";

import { classifyOperationalFailure, safeTelemetryErrorCode } from "./operationalTelemetryCore";

type OperationalContext = {
    component: string;
    operationId?: string | null;
    orderId?: string | null;
};

const safeIdentifier = (value: string | null | undefined) => {
    const normalized = String(value || "").trim();
    return /^[a-zA-Z0-9_-]{1,128}$/.test(normalized) ? normalized : undefined;
};

export const captureOperationalError = (event: string, error: unknown, context: OperationalContext) => {
    const failureClass = classifyOperationalFailure(error);
    if (failureClass === "expected" || failureClass === "connectivity") return false;
    const errorCode = safeTelemetryErrorCode(error);
    Sentry.withScope((scope) => {
        scope.setTag("operational.event", event);
        scope.setTag("operational.component", context.component);
        scope.setTag("operational.failure_class", failureClass);
        scope.setTag("operational.error_code", errorCode);
        const operationId = safeIdentifier(context.operationId);
        const orderId = safeIdentifier(context.orderId);
        if (operationId) scope.setContext("operation", { operationId });
        if (orderId) scope.setContext("order", { orderId });
        Sentry.captureException(new Error(`${event}:${errorCode}`));
    });
    return true;
};
