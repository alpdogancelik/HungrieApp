import { useEffect, useMemo, useRef } from "react";
import { Asset } from "expo-asset";
import { Animated, Platform, StyleSheet } from "react-native";
import { Image } from "expo-image";

import { useReducedMotion } from "@/src/lib/useReducedMotion";
import { useStableWindowDimensions } from "@/src/lib/useStableWindowDimensions";

type SplashPulseProps = {
    visible: boolean;
    onFinished: () => void;
    imageSource: any;
    backgroundColor?: string;
};

export default function SplashPulse({ visible, onFinished, imageSource, backgroundColor = "#FFF7EF" }: SplashPulseProps) {
    const reduceMotion = useReducedMotion();
    const { width, height } = useStableWindowDimensions();
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(1)).current;
    const finishedRef = useRef(false);
    const isWeb = Platform.OS === "web";
    const useNativeDriver = !isWeb;
    const safeWidth = width > 0 ? width : isWeb ? 1440 : 390;
    const safeHeight = height > 0 ? height : isWeb ? 900 : 844;
    const resolvedSource = Asset.fromModule(imageSource);
    const imageAspectRatio = resolvedSource?.width && resolvedSource?.height ? resolvedSource.width / resolvedSource.height : 1024 / 1536;
    // Size the poster from both viewport axes so it stays prominent on phones
    // and does not look undersized on shorter desktop browsers.
    const maxImageWidth = isWeb ? Math.min(safeWidth * 0.4, 520) : Math.min(safeWidth * 0.94, 420);
    const maxImageHeight = isWeb ? Math.min(safeHeight * 0.82, 760) : Math.min(safeHeight * 0.8, 700);
    const imageWidth = Math.min(maxImageWidth, maxImageHeight * imageAspectRatio);
    const imageHeight = imageWidth / imageAspectRatio;
    const imageFit = isWeb ? "contain" : "cover";

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
                onFinished();
            });
        };

        if (reduceMotion) {
            // Accessibility: Reduce Motion skips the pulse. Keep the image visible briefly,
            // then fade out to avoid a "hard cut".
            finishTimer = setTimeout(finish, 600);
        } else {
            loop = Animated.loop(pulseAnimation);
            loop.start();
            // Robustness: never block the app longer than ~1.6s.
            finishTimer = setTimeout(finish, 1600);
        }

        return () => {
            if (finishTimer) clearTimeout(finishTimer);
            try {
                loop?.stop?.();
            } catch {
                // ignore
            }
        };
    }, [imageSource, onFinished, opacity, pulseAnimation, reduceMotion, scale, useNativeDriver, visible]);

    if (!visible) return null;

    return (
        <Animated.View pointerEvents="auto" style={[styles.overlay, { backgroundColor, opacity }]}>
            <Animated.View
                style={[
                    isWeb ? styles.posterFrame : styles.mobileFrame,
                    {
                        width: isWeb ? imageWidth : safeWidth,
                        height: isWeb ? imageHeight : safeHeight,
                        transform: [{ scale }],
                    },
                ]}
            >
                <Image source={imageSource} style={styles.fill} contentFit={imageFit} cachePolicy="memory-disk" />
            </Animated.View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
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
