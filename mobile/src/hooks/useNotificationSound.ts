import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import { storage } from "@/src/lib/storage";

const STORAGE_KEY = "panel_sound_enabled";
const DEFAULT_SOUND_PATH = "/sounds/order.mp3";
const FALLBACK_SOUND_PATH = "/assets/hungrie.mp3";

const isWeb = Platform.OS === "web";

type PlayResult = {
    ok: boolean;
    blocked: boolean;
};

export const SOUND_BLOCKED_ERROR = "sound_blocked";

type Params = {
    throttleMs?: number;
};

export const useNotificationSound = ({ throttleMs = 5000 }: Params = {}) => {
    const [isEnabled, setIsEnabled] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const lastPlayedAtRef = useRef(0);

    const ensureAudio = useCallback(() => {
        if (!isWeb || typeof window === "undefined") return null;
        if (!audioRef.current) {
            audioRef.current = new Audio(DEFAULT_SOUND_PATH);
            audioRef.current.preload = "auto";
            audioRef.current.onerror = () => {
                audioRef.current = new Audio(FALLBACK_SOUND_PATH);
                if (audioRef.current) {
                    audioRef.current.preload = "auto";
                }
            };
        }
        return audioRef.current;
    }, []);

    useEffect(() => {
        let mounted = true;
        storage
            .getItem(STORAGE_KEY)
            .then((raw) => {
                if (!mounted) return;
                setIsEnabled(raw === "1");
            })
            .catch(() => null);
        return () => {
            mounted = false;
        };
    }, []);

    const setEnabledPersisted = useCallback(async (next: boolean) => {
        setIsEnabled(next);
        await storage.setItem(STORAGE_KEY, next ? "1" : "0");
    }, []);

    const enableSound = useCallback(async () => {
        if (!isWeb) {
            await setEnabledPersisted(true);
            return { ok: true, blocked: false } as PlayResult;
        }

        const audio = ensureAudio();
        if (!audio) {
            await setEnabledPersisted(true);
            return { ok: true, blocked: false } as PlayResult;
        }

        try {
            const prevVolume = audio.volume;
            audio.volume = 0.01;
            audio.currentTime = 0;
            await audio.play();
            audio.pause();
            audio.currentTime = 0;
            audio.volume = prevVolume;
            await setEnabledPersisted(true);
            setLastError(null);
            return { ok: true, blocked: false } as PlayResult;
        } catch {
            setLastError(SOUND_BLOCKED_ERROR);
            return { ok: false, blocked: true } as PlayResult;
        }
    }, [ensureAudio, setEnabledPersisted]);

    const toggleSound = useCallback(async () => {
        const next = !isEnabled;
        if (next) {
            return enableSound();
        }
        await setEnabledPersisted(false);
        setLastError(null);
        return { ok: true, blocked: false } as PlayResult;
    }, [enableSound, isEnabled, setEnabledPersisted]);

    const play = useCallback(async (): Promise<PlayResult> => {
        if (!isEnabled) return { ok: false, blocked: false };
        if (!isWeb) return { ok: true, blocked: false };

        const now = Date.now();
        if (now - lastPlayedAtRef.current < throttleMs) {
            return { ok: false, blocked: false };
        }

        const audio = ensureAudio();
        if (!audio) return { ok: false, blocked: false };

        try {
            audio.currentTime = 0;
            await audio.play();
            lastPlayedAtRef.current = now;
            setLastError(null);
            return { ok: true, blocked: false };
        } catch {
            setLastError(SOUND_BLOCKED_ERROR);
            return { ok: false, blocked: true };
        }
    }, [ensureAudio, isEnabled, throttleMs]);

    const clearError = useCallback(() => {
        setLastError(null);
    }, []);

    return useMemo(
        () => ({
            isEnabled,
            lastError,
            enableSound,
            toggleSound,
            play,
            clearError,
        }),
        [isEnabled, lastError, enableSound, toggleSound, play, clearError],
    );
};

export default useNotificationSound;
