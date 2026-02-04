import { iconset } from "@/constants/mediaCatalog";
import { memo } from "react";
import { Image, StyleProp, ImageStyle } from "react-native";
import { SvgProps } from "react-native-svg";

export type IconName = keyof typeof iconset;

type Props = SvgProps & {
    name: IconName;
    size?: number;
    color?: string;
};

const Icon = ({ name, size = 20, color = "#5D5F6D", style, ...rest }: Props) => {
    const rawComponent = iconset[name];
    if (!rawComponent) return null;

    const Component =
        typeof rawComponent === "object" && rawComponent !== null && "default" in rawComponent
            ? (rawComponent as any).default
            : rawComponent;

    if (typeof Component === "number") {
        const imageStyle: StyleProp<ImageStyle> = [
            { width: size, height: size, tintColor: color } as ImageStyle,
            style as ImageStyle,
        ];
        return (
            <Image
                source={Component}
                style={imageStyle}
                resizeMode="contain"
            />
        );
    }

    return <Component width={size} height={size} color={color} stroke={color} style={style} {...rest} />;
};

export default memo(Icon);
