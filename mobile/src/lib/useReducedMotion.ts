import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

export const useReducedMotion = () => {
    const [reducedMotionEnabled, setReducedMotionEnabled] = useState(false);

    useEffect(() => {
        let active = true;
        let cleanup: (() => void) | undefined;

        const setIfActive = (value: boolean) => {
            if (!active) return;
            setReducedMotionEnabled(value);
        };

        const setup = async () => {
            if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.matchMedia === "function") {
                const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
                const handleChange = () => setIfActive(Boolean(mediaQuery.matches));
                handleChange();

                if (typeof mediaQuery.addEventListener === "function") {
                    mediaQuery.addEventListener("change", handleChange);
                    cleanup = () => mediaQuery.removeEventListener("change", handleChange);
                    return;
                }

                if (typeof (mediaQuery as any).addListener === "function") {
                    (mediaQuery as any).addListener(handleChange);
                    cleanup = () => (mediaQuery as any).removeListener(handleChange);
                    return;
                }
            }

            const enabled = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
            setIfActive(Boolean(enabled));

            const subscription = (AccessibilityInfo as any).addEventListener?.(
                "reduceMotionChanged",
                (value: boolean) => setIfActive(Boolean(value)),
            );

            cleanup = () => subscription?.remove?.();
        };

        setup();

        return () => {
            active = false;
            cleanup?.();
        };
    }, []);

    return reducedMotionEnabled;
};
