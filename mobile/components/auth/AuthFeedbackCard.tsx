import { type ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { SvgProps } from "react-native-svg";

type AuthFeedbackCardProps = {
    title: string;
    message: string;
    Illustration: ComponentType<SvgProps>;
    tone?: "error" | "success" | "info";
};

const TONE_STYLES = {
    error: {
        backgroundColor: "#FFF1F2",
        borderColor: "#FDA4AF",
        titleColor: "#BE123C",
        messageColor: "#9F1239",
    },
    success: {
        backgroundColor: "#ECFDF5",
        borderColor: "#86EFAC",
        titleColor: "#166534",
        messageColor: "#15803D",
    },
    info: {
        backgroundColor: "#EFF6FF",
        borderColor: "#93C5FD",
        titleColor: "#1D4ED8",
        messageColor: "#1E40AF",
    },
} as const;

const styles = StyleSheet.create({
    card: {
        borderRadius: 18,
        borderWidth: 1,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
    },
    illustrationWrap: {
        width: 84,
        height: 84,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    copyWrap: {
        flex: 1,
        gap: 6,
    },
    title: {
        fontSize: 18,
        lineHeight: 24,
        fontFamily: "ChairoSans",
    },
    message: {
        fontSize: 14,
        lineHeight: 20,
        fontFamily: "ChairoSans",
    },
});

const AuthFeedbackCard = ({ title, message, Illustration, tone = "info" }: AuthFeedbackCardProps) => {
    const palette = TONE_STYLES[tone];

    return (
        <View style={[styles.card, { backgroundColor: palette.backgroundColor, borderColor: palette.borderColor }]}>
            <View style={styles.illustrationWrap}>
                <Illustration width={72} height={72} />
            </View>
            <View style={styles.copyWrap}>
                <Text style={[styles.title, { color: palette.titleColor }]}>{title}</Text>
                <Text style={[styles.message, { color: palette.messageColor }]}>{message}</Text>
            </View>
        </View>
    );
};

export default AuthFeedbackCard;

