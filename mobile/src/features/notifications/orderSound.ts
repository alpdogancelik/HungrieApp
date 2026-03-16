import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

let soundInstance: AudioPlayer | null = null;
let loadingPromise: Promise<AudioPlayer | null> | null = null;

const ensureSound = async () => {
    if (Platform.OS === "web") return null;
    if (soundInstance) return soundInstance;
    if (loadingPromise) return loadingPromise;

    loadingPromise = Promise.resolve()
        .then(() => {
            const player = createAudioPlayer(require("../../../assets/sounds/hungrie.wav"));
            player.volume = 1;
            soundInstance = player;
            return soundInstance;
        })
        .catch(() => null)
        .finally(() => {
            loadingPromise = null;
        });

    return loadingPromise;
};

export const playOrderNotificationSound = async () => {
    if (Platform.OS === "web") return;
    const sound = await ensureSound();
    if (!sound) return;
    try {
        await sound.seekTo(0);
        sound.play();
    } catch {
        // noop
    }
};

export const unloadOrderNotificationSound = async () => {
    if (!soundInstance) return;
    try {
        soundInstance.remove();
    } catch {
        // noop
    } finally {
        soundInstance = null;
    }
};
