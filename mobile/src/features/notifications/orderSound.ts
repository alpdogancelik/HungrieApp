import { Audio } from "expo-av";
import { Platform } from "react-native";

let soundInstance: Audio.Sound | null = null;
let loadingPromise: Promise<Audio.Sound | null> | null = null;

const ensureSound = async () => {
    if (Platform.OS === "web") return null;
    if (soundInstance) return soundInstance;
    if (loadingPromise) return loadingPromise;

    loadingPromise = Audio.Sound.createAsync(
        require("../../../assets/sounds/hungrie.wav"),
        {
            shouldPlay: false,
            isLooping: false,
            volume: 1,
        },
        undefined,
        false,
    )
        .then((result) => {
            soundInstance = result.sound;
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
        await sound.setPositionAsync(0);
        await sound.playAsync();
    } catch {
        // noop
    }
};

export const unloadOrderNotificationSound = async () => {
    if (!soundInstance) return;
    try {
        await soundInstance.unloadAsync();
    } catch {
        // noop
    } finally {
        soundInstance = null;
    }
};
