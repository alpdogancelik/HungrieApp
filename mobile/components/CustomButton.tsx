import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import React, { type ReactNode } from "react";
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from "react-native";
import { useTheme } from "@/src/theme/themeContext";

type Props = {
    onPress?: () => void;
    title?: string;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
    leftIcon?: ReactNode;
    isLoading?: boolean;
    disabled?: boolean;
};

const styles = createAdaptiveStyleSheet({
    button: {
        width: "100%",
        minHeight: 52,
        borderRadius: 999,
        backgroundColor: "#FE8C00",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
    },
    busy: { opacity: 0.6 },
    iconWrap: { marginRight: 8 },
    text: {
        color: "#FFFFFF",
        fontSize: 16,
        fontFamily: "ChairoSans",
    },
});

const CustomButton = ({
    onPress,
    title = "Click Me",
    style,
    textStyle,
    leftIcon,
    isLoading = false,
    disabled = false,
}: Props) => {
    const { theme } = useTheme();
    const isBusy = isLoading || disabled;

    return (
        <TouchableOpacity style={[styles.button, { backgroundColor: theme.colors.primary }, isBusy && styles.busy, style]} disabled={isBusy} onPress={onPress}>
            {leftIcon ? <View style={styles.iconWrap}>{leftIcon}</View> : null}
            {isLoading ? <ActivityIndicator size="small" color={theme.colors.onPrimary} /> : <Text style={[styles.text, { color: theme.colors.onPrimary }, textStyle]}>{title}</Text>}
        </TouchableOpacity>
    );
};

export default CustomButton;
