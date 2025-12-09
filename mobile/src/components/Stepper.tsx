import { Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/src/theme/themeContext";

type StepperProps = {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    onChange?: (value: number) => void;
};

export const Stepper = ({
    value,
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    step = 1,
    onChange,
}: StepperProps) => {
    const { theme } = useTheme();
    const decreaseDisabled = value <= min;
    const increaseDisabled = value >= max;

    const handleChange = (delta: number) => {
        const next = Math.min(max, Math.max(min, value + delta));
        if (next !== value) onChange?.(next);
    };

    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.sm,
            }}
        >
            <TouchableOpacity
                onPress={() => handleChange(-step)}
                disabled={decreaseDisabled}
                style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.md,
                    padding: theme.spacing.sm,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    opacity: decreaseDisabled ? 0.5 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel="Azalt"
            >
                <Text style={{ color: theme.colors.ink, fontSize: theme.typography.body }}>-</Text>
            </TouchableOpacity>
            <Text
                style={{
                    fontFamily: "ChairoSans",
                    fontSize: theme.typography.h2,
                    color: theme.colors.ink,
                }}
            >
                {value}
            </Text>
            <TouchableOpacity
                onPress={() => handleChange(step)}
                disabled={increaseDisabled}
                style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: theme.radius.md,
                    padding: theme.spacing.sm,
                    opacity: increaseDisabled ? 0.5 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel="Arttır"
            >
                <Text style={{ color: theme.colors.surface, fontSize: theme.typography.body }}>+</Text>
            </TouchableOpacity>
        </View>
    );
};

export default Stepper;


