import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { getCustomerOrderReviewStateV2 } from "@/src/data/reviewV2Repository";
import { recoverCustomerReviewsIfAuthorized } from "./customerReviewOperation";
import { markCustomerReviewStatesChecking, publishCustomerReviewState, setCustomerReviewAvailabilityProfile } from "./customerReviewAvailability";

export default function CustomerReviewRecoveryCoordinator({ profileId }: { profileId: string }) {
    const running = useRef(false);
    const reconcile = useCallback(async () => {
        if (!profileId || running.current) return;
        setCustomerReviewAvailabilityProfile(profileId);
        markCustomerReviewStatesChecking(profileId);
        running.current = true;
        try {
            const result = await recoverCustomerReviewsIfAuthorized(true, profileId, getCustomerOrderReviewStateV2);
            result.states.forEach((state) => publishCustomerReviewState(profileId, state));
        }
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
