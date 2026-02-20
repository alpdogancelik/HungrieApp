import React from "react";
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    type ReactNode,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from "react-native";

type Props = {
    onPress?: () => void;
    title?: string;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
    leftIcon?: ReactNode;
    isLoading?: boolean;
    disabled?: boolean;
};

const styles = StyleSheet.create({
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
    const isBusy = isLoading || disabled;

    return (
        <TouchableOpacity style={[styles.button, isBusy && styles.busy, style]} disabled={isBusy} onPress={onPress}>
            {leftIcon ? <View style={styles.iconWrap}>{leftIcon}</View> : null}
            {isLoading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={[styles.text, textStyle]}>{title}</Text>}
        </TouchableOpacity>
    );
};

export default CustomButton;
