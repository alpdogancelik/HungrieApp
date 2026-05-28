import { Alert, Platform } from "react-native";

export const showUserMessage = (title: string, message?: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(message ? `${title}\n\n${message}` : title);
        return;
    }

    Alert.alert(title, message);
};
