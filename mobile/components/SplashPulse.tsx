import { useEffect, useMemo, useRef } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { Asset } from "expo-asset";
import { Animated, Platform, StyleSheet } from "react-native";
import { Image } from "expo-image";

import { useReducedMotion } from "@/src/lib/useReducedMotion";
import { useStableWindowDimensions } from "@/src/lib/useStableWindowDimensions";

type SplashPulseProps = {
    visible: boolean;
    ready?: boolean;
    onFinished: () => void;
    imageSource: any;
    backgroundColor?: string;
};

export default function SplashPulse({ visible, ready = false, onFinished, imageSource, backgroundColor = "#FFF7EF" }: SplashPulseProps) {
    const reduceMotion = useReducedMotion();
    const { width, height } = useStableWindowDimensions();
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(1)).current;
    const finishedRef = useRef(false);
    const onFinishedRef = useRef(onFinished);
    const isWeb = Platform.OS === "web";
    const useNativeDriver = !isWeb;
    const safeWidth = width > 0 ? width : isWeb ? 1440 : 390;
    const safeHeight = height > 0 ? height : isWeb ? 900 : 844;
    const isCompactWeb = isWeb && safeWidth <= 768;
    const useFullScreenSplash = !isWeb || isCompactWeb;
    const resolvedSource = Asset.fromModule(imageSource);
    const imageAspectRatio = resolvedSource?.width && resolvedSource?.height ? resolvedSource.width / resolvedSource.height : 1024 / 1536;
    // Size the poster from both viewport axes so it stays prominent on phones
    // and does not look undersized on shorter desktop browsers.
    const maxImageWidth = useFullScreenSplash ? Math.min(safeWidth * 0.94, 420) : Math.min(safeWidth * 0.4, 520);
    const maxImageHeight = useFullScreenSplash ? Math.min(safeHeight * 0.8, 700) : Math.min(safeHeight * 0.82, 760);
    const imageWidth = Math.min(maxImageWidth, maxImageHeight * imageAspectRatio);
    const imageHeight = imageWidth / imageAspectRatio;
    const imageFit = useFullScreenSplash ? "cover" : "contain";

    useEffect(() => {
        onFinishedRef.current = onFinished;
    }, [onFinished]);

    const pulseAnimation = useMemo(() => {
        // A "heartbeat" feel: quick up-down-up, then a short rest.
        // We keep the curve simple and native-driver friendly.
        return Animated.sequence([
            Animated.timing(scale, { toValue: 1.04, duration: 140, useNativeDriver }),
            Animated.timing(scale, { toValue: 0.99, duration: 120, useNativeDriver }),
            Animated.timing(scale, { toValue: 1.02, duration: 120, useNativeDriver }),
            Animated.timing(scale, { toValue: 1.0, duration: 260, useNativeDriver }),
            Animated.delay(260),
        ]);
    }, [scale, useNativeDriver]);

    useEffect(() => {
        if (!visible) return;

        finishedRef.current = false;
        opacity.setValue(1);
        scale.setValue(1);

        let loop: Animated.CompositeAnimation | null = null;
        let finishTimer: ReturnType<typeof setTimeout> | null = null;
        let removalTimer: ReturnType<typeof setTimeout> | null = null;
        let removed = false;

        const removeOverlay = () => {
            if (removed) return;
            removed = true;
            onFinishedRef.current();
        };

        const finish = () => {
            if (finishedRef.current) return;
            finishedRef.current = true;

            try {
                loop?.stop?.();
            } catch {
                // Best effort; do not block exit.
            }

            Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver }).start(({ finished }) => {
                // Even if the animation is interrupted, we should continue into the app.
                removeOverlay();
            });
        };

        if (reduceMotion) {
            // Accessibility: Reduce Motion skips the pulse. Keep the image visible briefly,
            // then fade out to avoid a "hard cut".
            finishTimer = setTimeout(finish, ready ? 40 : 240);
        } else {
            loop = Animated.loop(pulseAnimation);
            loop.start();
            // The native splash already covers initialization. This branded
            // transition is adaptive and never blocks usable UI beyond 600ms.
            finishTimer = setTimeout(finish, ready ? 80 : 340);
        }

        // An interrupted native animation must never leave an invisible
        // full-screen view mounted above the app indefinitely.
        removalTimer = setTimeout(removeOverlay, 1500);

        return () => {
            if (finishTimer) clearTimeout(finishTimer);
            if (removalTimer) clearTimeout(removalTimer);
            try {
                loop?.stop?.();
            } catch {
                // ignore
            }
        };
    }, [opacity, pulseAnimation, ready, reduceMotion, scale, useNativeDriver, visible]);

    if (!visible) return null;

    return (
        <Animated.View pointerEvents="none" style={[styles.overlay, { backgroundColor, opacity }]}>
            <Animated.View
                style={[
                    useFullScreenSplash ? styles.mobileFrame : styles.posterFrame,
                    {
                        width: useFullScreenSplash ? safeWidth : imageWidth,
                        height: useFullScreenSplash ? safeHeight : imageHeight,
                        transform: [{ scale }],
                    },
                ]}
            >
                <Image source={imageSource} style={styles.fill} contentFit={imageFit} cachePolicy="memory-disk" />
            </Animated.View>
        </Animated.View>
    );
}

const styles = createAdaptiveStyleSheet({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    fill: {
        ...StyleSheet.absoluteFillObject,
    },
    posterFrame: {
        position: "relative",
        alignItems: "center",
        justifyContent: "center",
    },
    mobileFrame: {
        ...StyleSheet.absoluteFillObject,
    },
});
