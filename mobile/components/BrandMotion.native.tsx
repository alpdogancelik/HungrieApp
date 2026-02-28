import type { ImageSourcePropType, StyleProp } from "react-native";
import type { ImageStyle, ViewStyle } from "react-native";
import LottieView from "lottie-react-native";
import { Image } from "expo-image";

export type BrandMotionProps = {
    sourceJson?: object;
    fallbackImage: ImageSourcePropType;
    autoplay?: boolean;
    loop?: boolean;
    style?: StyleProp<ViewStyle | ImageStyle>;
};

export default function BrandMotion({ sourceJson, fallbackImage, autoplay = true, loop = false, style }: BrandMotionProps) {
    if (sourceJson) {
        return <LottieView source={sourceJson as any} autoPlay={autoplay} loop={loop} style={style as any} />;
    }

    return <Image source={fallbackImage} style={style as any} contentFit="contain" cachePolicy="memory-disk" />;
}

