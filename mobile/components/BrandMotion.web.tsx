import type { ImageSourcePropType, StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import Lottie from "lottie-react";
import { Image } from "expo-image";

export type BrandMotionProps = {
    sourceJson?: object;
    fallbackImage: ImageSourcePropType;
    autoplay?: boolean;
    loop?: boolean;
    style?: StyleProp<ViewStyle>;
};

export default function BrandMotion({ sourceJson, fallbackImage, autoplay = true, loop = false, style }: BrandMotionProps) {
    if (sourceJson) {
        return (
            <View style={style}>
                <Lottie animationData={sourceJson as any} autoplay={autoplay} loop={loop} style={{ width: "100%", height: "100%" }} />
            </View>
        );
    }

    return <Image source={fallbackImage} style={style as any} contentFit="contain" cachePolicy="memory-disk" />;
}

