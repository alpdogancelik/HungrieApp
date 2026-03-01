import { useEffect, useMemo, useRef } from "react";
import { Animated, Platform, StyleSheet, useWindowDimensions } from "react-native";
import { Image } from "expo-image";

import { useReducedMotion } from "@/src/lib/useReducedMotion";

type SplashPulseProps = {
    visible: boolean;
    onFinished: () => void;
    imageSource: any;
    backgroundColor?: string;
};

const IMAGE_ASPECT_RATIO = 1024 / 1536;

export default function SplashPulse({ visible, onFinished, imageSource, backgroundColor = "#FFF7EF" }: SplashPulseProps) {
    const reduceMotion = useReducedMotion();
    const { width, height } = useWindowDimensions();
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(1)).current;
    const finishedRef = useRef(false);
    const isWeb = Platform.OS === "web";
    const maxImageWidth = isWeb ? Math.min(width * 0.34, 420) : Math.min(width * 0.74, 320);
    const maxImageHeight = isWeb ? Math.min(height * 0.72, 620) : Math.min(height * 0.6, 480);
    const imageWidth = Math.min(maxImageWidth, maxImageHeight * IMAGE_ASPECT_RATIO);
    const imageHeight = imageWidth / IMAGE_ASPECT_RATIO;

    const pulseAnimation = useMemo(() => {
        // A "heartbeat" feel: quick up-down-up, then a short rest.
        // We keep the curve simple and native-driver friendly.
        return Animated.sequence([
            Animated.timing(scale, { toValue: 1.04, duration: 140, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.99, duration: 120, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1.02, duration: 120, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1.0, duration: 260, useNativeDriver: true }),
            Animated.delay(260),
        ]);
    }, [scale]);

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

            Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(({ finished }) => {
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
    }, [imageSource, onFinished, opacity, pulseAnimation, reduceMotion, scale, visible]);

    if (!visible) return null;

    return (
        <Animated.View pointerEvents="auto" style={[styles.overlay, { backgroundColor, opacity }]}>
            <Animated.View
                style={[
                    styles.posterFrame,
                    {
                        width: imageWidth,
                        height: imageHeight,
                        transform: [{ scale }],
                    },
                ]}
            >
                <Image source={imageSource} style={styles.fill} contentFit="contain" cachePolicy="memory-disk" />
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
});
