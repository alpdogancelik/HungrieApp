import { View, Text, TextInput } from 'react-native'
import { useState } from "react";
import cn from "clsx";

const CustomInput = ({
    placeholder = 'Enter text',
    value,
    onChangeText,
    label,
    secureTextEntry = false,
    keyboardType = "default"
}: { placeholder?: string; value?: string; onChangeText?: (text: string) => void; label: string; secureTextEntry?: boolean; keyboardType?: "default" | "email-address" | "numeric" | "phone-pad" }) => {
    const [isFocused, setIsFocused] = useState(false);


    return (
        <View className="w-full">
            <Text className="text-base text-start w-full font-ezra-medium text-gray-500 pl-2 mb-2">{label}</Text>

            <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                value={value}
                onChangeText={onChangeText}
                secureTextEntry={secureTextEntry}
                keyboardType={keyboardType}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={placeholder}
                placeholderTextColor="#888"
                className={cn(
                    "rounded-lg p-3 w-full text-base font-ezra text-dark-100 border-b leading-5",
                    isFocused ? "border-primary" : "border-gray-300",
                )}
            />
        </View>
    )
}
export default CustomInput
