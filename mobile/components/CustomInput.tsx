import { useState } from "react";
import {
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    type KeyboardTypeOptions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
    placeholder?: string;
    value?: string;
    onChangeText?: (text: string) => void;
    label: string;
    secureTextEntry?: boolean;
    keyboardType?: KeyboardTypeOptions;
};

const styles = StyleSheet.create({
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
    focused: { borderColor: "#FE8C00" },
    inputWrap: {
        position: "relative",
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

const CustomInput = ({
    placeholder = "Enter text",
    value,
    onChangeText,
    label,
    secureTextEntry = false,
    keyboardType = "default",
}: Props) => {
    const [isFocused, setIsFocused] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const isPasswordField = Boolean(secureTextEntry);

    return (
        <View style={styles.container}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.inputWrap}>
                <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={value}
                    onChangeText={onChangeText}
                    secureTextEntry={isPasswordField && !isPasswordVisible}
                    keyboardType={keyboardType}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder={placeholder}
                    placeholderTextColor="#94A3B8"
                    style={[styles.input, isPasswordField && styles.inputWithToggle, isFocused && styles.focused]}
                />
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
                            color="#64748B"
                        />
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
};

export default CustomInput;
