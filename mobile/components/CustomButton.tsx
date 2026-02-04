import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import React from 'react'
import cn from "clsx";

const CustomButton = ({
    onPress,
    title = "Click Me",
    style,
    textStyle,
    leftIcon,
    isLoading = false,
    disabled = false,
}: {
    onPress?: () => void;
    title?: string;
    style?: string;
    textStyle?: string;
    leftIcon?: React.ReactNode;
    isLoading?: boolean;
    disabled?: boolean;
}) => {
    const isBusy = isLoading || disabled;

    return (
        <TouchableOpacity
            className={cn("bg-primary rounded-full p-4 w-full flex-row items-center justify-center", style, isBusy && "opacity-60")}
            disabled={isBusy}
            onPress={onPress}
        >
            {leftIcon ? <View className="mr-2">{leftIcon}</View> : null}

            {isLoading ? (
                <ActivityIndicator size="small" color="white" />
            ) : (
                <Text className={cn("text-white text-base font-ezra-semibold", textStyle)}>{title}</Text>
            )}
        </TouchableOpacity>
    )
}
export default CustomButton
