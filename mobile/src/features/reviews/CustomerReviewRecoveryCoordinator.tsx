import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { getCustomerOrderReviewStateV2 } from "@/src/data/reviewV2Repository";
import { recoverCustomerReviewsIfAuthorized } from "./customerReviewOperation";
import { markCustomerReviewStatesChecking, markCustomerReviewStatesUnavailable, publishCustomerReviewState, setCustomerReviewAvailabilityProfile } from "./customerReviewAvailability";

const RECOVERY_TIMEOUT_MS = 12_000;
const withRecoveryTimeout = <T,>(operation: Promise<T>) => new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Review recovery timed out")), RECOVERY_TIMEOUT_MS);
    operation.then(
        (value) => { clearTimeout(timeout); resolve(value); },
        (error) => { clearTimeout(timeout); reject(error); },
    );
});

export default function CustomerReviewRecoveryCoordinator({ profileId }: { profileId: string }) {
    const running = useRef(false);
    const reconcile = useCallback(async () => {
        if (!profileId || running.current) return;
        setCustomerReviewAvailabilityProfile(profileId);
        markCustomerReviewStatesChecking(profileId);
        running.current = true;
        try {
            const result = await withRecoveryTimeout(recoverCustomerReviewsIfAuthorized(true, profileId, getCustomerOrderReviewStateV2));
            result.states.forEach((state) => publishCustomerReviewState(profileId, state));
        }
        catch (error) { markCustomerReviewStatesUnavailable(profileId, error); }
        finally { running.current = false; }
    }, [profileId]);

    useEffect(() => {
        setCustomerReviewAvailabilityProfile(profileId);
        void reconcile();
        const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void reconcile(); });
        return () => subscription.remove();
    }, [reconcile]);
    return null;
}
