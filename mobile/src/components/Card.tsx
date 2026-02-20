import { View, ViewProps } from "react-native";
import { ReactNode } from "react";
import { useTheme, getShadow } from "@/src/theme/themeContext";

type CardProps = ViewProps & {
    children: ReactNode;
    elevation?: 1 | 2;
};

export const Card = ({ children, elevation = 1, style, ...rest }: CardProps) => {
    const { theme } = useTheme();
    return (
        <View
            style={[
                {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.xl,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    padding: theme.spacing.lg,
                    gap: theme.spacing.sm,
                    ...getShadow(elevation),
                },
                style,
            ]}
            {...rest}
        >
            {children}
        </View>
    );
};

export default Card;
