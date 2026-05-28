import { useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

const WEB_DOCUMENT_TITLE = "HungrieApp";

export const useWebDocumentTitle = () => {
    const setTitle = useCallback(() => {
        if (Platform.OS !== "web") return;
        if (typeof document === "undefined") return;
        document.title = WEB_DOCUMENT_TITLE;
    }, []);

    useFocusEffect(
        useCallback(() => {
            setTitle();
        }, [setTitle]),
    );

    useEffect(() => {
        setTitle();
    }, [setTitle]);
};
