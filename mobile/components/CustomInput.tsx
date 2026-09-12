import { forwardRef, useState, type ReactNode } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import {
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    type TextInputProps,
    type KeyboardTypeOptions,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/themeContext";

type Props = {
    placeholder?: string;
    value?: string;
    onChangeText?: (text: string) => void;
    label: string;
    secureTextEntry?: boolean;
    keyboardType?: KeyboardTypeOptions;
    inputKey?: string;
    autoComplete?: TextInputProps["autoComplete"];
    returnKeyType?: TextInputProps["returnKeyType"];
    onFocus?: TextInputProps["onFocus"];
    onBlur?: TextInputProps["onBlur"];
    onSubmitEditing?: TextInputProps["onSubmitEditing"];
    blurOnSubmit?: TextInputProps["blurOnSubmit"];
    autoFocus?: boolean;
    leftIcon?: ReactNode;
    placeholderTextColor?: string;
    secureToggleColor?: string;
    containerStyle?: StyleProp<ViewStyle>;
    labelStyle?: StyleProp<TextStyle>;
    inputStyle?: StyleProp<TextStyle>;
    inputWrapStyle?: StyleProp<ViewStyle>;
};

const toFieldKey = (label: string) =>
    label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "input";

const styles = createAdaptiveStyleSheet({
    container: { width: "100%" },
    label: {
        paddingLeft: 8,
        marginBottom: 8,
        fontSize: 14,
        color: "#64748B",
        fontFamily: "ChairoSans",
    },
    input: {
        borderWidth: 1,
        borderColor: "#CBD5E1",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 11,
        fontSize: 16,
        color: "#0F172A",
        backgroundColor: "#FFFFFF",
        fontFamily: "ChairoSans",
    },
    inputWithToggle: {
        paddingRight: 44,
    },
    inputWithLeftIcon: {
        paddingLeft: 48,
    },
    focused: { borderColor: "#FE8C00" },
    inputWrap: {
        position: "relative",
    },
    leftIconWrap: {
        position: "absolute",
        left: 14,
        top: 0,
        bottom: 0,
        justifyContent: "center",
        alignItems: "center",
        width: 24,
    },
    toggleBtn: {
        position: "absolute",
        right: 10,
        top: 0,
        bottom: 0,
        justifyContent: "center",
        alignItems: "center",
        width: 28,
    },
});

const CustomInput = forwardRef<TextInput, Props>(({
    placeholder = "Enter text",
    value,
    onChangeText,
    label,
    secureTextEntry = false,
    keyboardType = "default",
    inputKey,
    autoComplete,
    returnKeyType,
    onFocus,
    onBlur,
    onSubmitEditing,
    blurOnSubmit,
    autoFocus,
    leftIcon,
    placeholderTextColor,
    secureToggleColor,
    containerStyle,
    labelStyle,
    inputStyle,
    inputWrapStyle,
}, ref) => {
    const { theme } = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const isPasswordField = Boolean(secureTextEntry);
    const fieldKey = inputKey || toFieldKey(label);

    return (
        <View style={[styles.container, containerStyle]}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }, labelStyle]}>{label}</Text>
            <View style={[styles.inputWrap, inputWrapStyle]}>
                <TextInput
                    ref={ref}
                    {...({ id: fieldKey, name: fieldKey } as any)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={autoComplete}
                    autoFocus={autoFocus}
                    value={value}
                    onChangeText={onChangeText}
                    secureTextEntry={isPasswordField && !isPasswordVisible}
                    keyboardType={keyboardType}
                    returnKeyType={returnKeyType}
                    onSubmitEditing={onSubmitEditing}
                    blurOnSubmit={blurOnSubmit}
                    onFocus={(event) => {
                        setIsFocused(true);
                        onFocus?.(event);
                    }}
                    onBlur={(event) => {
                        setIsFocused(false);
                        onBlur?.(event);
                    }}
                    placeholder={placeholder}
                    placeholderTextColor={placeholderTextColor ?? theme.colors.muted}
                    style={[
                        styles.input,
                        leftIcon && styles.inputWithLeftIcon,
                        isPasswordField && styles.inputWithToggle,
                        isFocused && styles.focused,
                        {
                            color: theme.colors.ink,
                            backgroundColor: theme.colors.input,
                            borderColor: isFocused ? theme.colors.primary : theme.colors.border,
                        },
                        inputStyle,
                    ]}
                />
                {leftIcon ? <View style={styles.leftIconWrap}>{leftIcon}</View> : null}
                {isPasswordField ? (
                    <Pressable
                        style={styles.toggleBtn}
                        onPress={() => setIsPasswordVisible((prev) => !prev)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={isPasswordVisible ? "Hide password" : "Show password"}
                    >
                        <Ionicons
                            name={isPasswordVisible ? "eye-off-outline" : "eye-outline"}
                            size={20}
                            color={secureToggleColor ?? theme.colors.textSecondary}
                        />
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
});

CustomInput.displayName = "CustomInput";

export default CustomInput;
