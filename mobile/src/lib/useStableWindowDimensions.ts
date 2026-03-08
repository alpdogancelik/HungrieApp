import { useEffect, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";

const DEFAULT_WEB_WIDTH = 1280;
const DEFAULT_WEB_HEIGHT = 720;

export function useStableWindowDimensions() {
    const dimensions = useWindowDimensions();
    const isWeb = Platform.OS === "web";
    const [isHydrated, setIsHydrated] = useState(!isWeb);

    useEffect(() => {
        if (!isWeb) return;
        setIsHydrated(true);
    }, [isWeb]);

    if (!isWeb || isHydrated) {
        return dimensions;
    }

    return {
        ...dimensions,
        width: DEFAULT_WEB_WIDTH,
        height: DEFAULT_WEB_HEIGHT,
    };
}
