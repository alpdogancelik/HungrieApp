import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, View, type ImageSourcePropType } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { ResizeMode, Video, type AVPlaybackStatus } from "expo-av";

import { useReducedMotion } from "@/src/lib/useReducedMotion";

type SplashVideoProps = {
    visible: boolean;
    onFinished: () => void;
    videoSource: any;
    fallbackImage: ImageSourcePropType;
    backgroundColor?: string;
};

const DEFAULT_BACKGROUND = "#FFF7EF";
const FAILSAFE_MS = 1200;
const REDUCE_MOTION_HOLD_MS = 600;
const FADE_OUT_MS = 260;

export default function SplashVideo({
    visible,
    onFinished,
    videoSource,
    fallbackImage,
    backgroundColor = DEFAULT_BACKGROUND,
}: SplashVideoProps) {
    const reduceMotion = useReducedMotion();
    const videoRef = useRef<Video>(null);
    const didFinishRef = useRef(false);
    const didStartPlaybackRef = useRef(false);
    const [hasFirstFrame, setHasFirstFrame] = useState(false);
    const opacity = useRef(new Animated.Value(1)).current;

    const shouldAttemptVideo = visible && !reduceMotion;

    const finish = useCallback(() => {
        if (didFinishRef.current) return;
        didFinishRef.current = true;
        // Stop playback ASAP (best-effort) so we don't keep decoding behind the fade-out.
        videoRef.current?.stopAsync().catch(() => null);
        Animated.timing(opacity, {
            toValue: 0,
            duration: FADE_OUT_MS,
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (!finished) return;
            onFinished();
        });
    }, [onFinished, opacity]);

    const scheduleFinishAfter = useCallback(
        (ms: number) => {
            const id = setTimeout(() => finish(), ms);
            return () => clearTimeout(id);
        },
        [finish],
    );

    useEffect(() => {
        if (!visible) return;

        // Reduce Motion: skip video entirely.
        if (reduceMotion) {
            return scheduleFinishAfter(REDUCE_MOTION_HOLD_MS);
        }

        // Fail-safe: never block the app if the video can't start quickly.
        const timeoutId = setTimeout(() => {
            if (didStartPlaybackRef.current) return;
            finish();
        }, FAILSAFE_MS);

        return () => clearTimeout(timeoutId);
    }, [finish, reduceMotion, scheduleFinishAfter, visible]);

    const handlePlaybackStatusUpdate = useCallback(
        (status: AVPlaybackStatus) => {
            if (!visible) return;
            if (!status.isLoaded) return;

            // Mark "started" when we see actual progress.
            if (!didStartPlaybackRef.current) {
                const progressed = typeof status.positionMillis === "number" && status.positionMillis > 0;
                if (status.isPlaying || progressed) {
                    didStartPlaybackRef.current = true;
                    setHasFirstFrame(true);
                }
            }

            if (status.didJustFinish) {
                finish();
            }
        },
        [finish, visible],
    );

    useEffect(() => {
        if (!visible) return;
        opacity.setValue(1);
        didFinishRef.current = false;
        didStartPlaybackRef.current = false;
        setHasFirstFrame(false);
    }, [opacity, visible]);

    const containerStyle = useMemo(
        () => [
            styles.overlay,
            {
                backgroundColor,
                opacity,
            },
        ],
        [backgroundColor, opacity],
    );

    if (!visible) return null;

    return (
        <Animated.View pointerEvents="auto" style={containerStyle as any}>
            {/* Static fallback is always visible behind the video to avoid any black frame. */}
            <View style={[styles.staticLayer, { backgroundColor }]}>
                <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]} pointerEvents="none">
                    <View style={styles.markWrap}>
                        <Image source={fallbackImage} style={styles.mark} contentFit="contain" cachePolicy="memory-disk" />
                    </View>
                </SafeAreaView>
            </View>

            {/* Video covers the full screen (no safe-area padding). */}
            {shouldAttemptVideo ? (
                <Video
                    ref={videoRef}
                    source={videoSource}
                    style={styles.video}
                    resizeMode={ResizeMode.COVER}
                    isMuted
                    shouldPlay
                    isLooping={false}
                    useNativeControls={false}
                    volume={0}
                    rate={1.0}
                    posterSource={fallbackImage as any}
                    usePoster={!hasFirstFrame}
                    progressUpdateIntervalMillis={50}
                    onLoad={() => {
                        // Ensure autoplay even if the platform delays `shouldPlay`.
                        videoRef.current?.playAsync().catch(() => null);
                    }}
                    onReadyForDisplay={() => setHasFirstFrame(true)}
                    onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                    onError={() => finish()}
                />
            ) : null}

        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999,
        elevation: 9999,
    },
    staticLayer: {
        ...StyleSheet.absoluteFillObject,
    },
    safeArea: {
        flex: 1,
    },
    markWrap: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    mark: {
        width: Platform.OS === "web" ? 140 : 120,
        height: Platform.OS === "web" ? 140 : 120,
        opacity: 0.92,
    },
    video: {
        ...StyleSheet.absoluteFillObject,
    },
});
