import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
    visible: boolean;
    message: string;
    title: string;
    dismissHint: string;
    dismissAccessibilityLabel?: string;
    onClose: () => void;
};

const OrderNotificationToast = ({ visible, message, title, dismissHint, dismissAccessibilityLabel, onClose }: Props) => {
    const insets = useSafeAreaInsets();
    if (!visible) return null;

    return (
        <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
            <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={dismissAccessibilityLabel}
                style={styles.toast}
            >
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.message}>{message}</Text>
                <Text style={styles.dismiss}>{dismissHint}</Text>
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        position: "absolute",
        top: 12,
        left: 12,
        right: 12,
        zIndex: 1000,
        alignItems: "center",
    },
    toast: {
        width: "100%",
        maxWidth: 540,
        backgroundColor: "#1E2433",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#2E3A54",
        paddingHorizontal: 14,
        paddingVertical: 11,
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        color: "#FFFFFF",
    },
    message: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#E2E8F0",
        marginTop: 2,
    },
    dismiss: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#A5B4D4",
        marginTop: 4,
    },
});

export default OrderNotificationToast;
