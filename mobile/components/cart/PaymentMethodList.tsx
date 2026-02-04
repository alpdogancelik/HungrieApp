import { Text, TouchableOpacity, View } from "react-native";
import type { PaymentMethod } from "@/src/domain/types";

type Option = { id: PaymentMethod; label: string; description: string; badge?: string; hint?: string };

type Props = {
    options: Option[];
    selected: PaymentMethod | null;
    onSelect: (method: PaymentMethod) => void;
    title: string;
};

const PaymentMethodList = ({ options, selected, onSelect, title }: Props) => (
    <View className="gap-3">
        <Text className="section-title">{title}</Text>
        {options.map((option) => {
            const isActive = selected === option.id;
            return (
                <TouchableOpacity
                    key={option.id}
                    className="flex-row items-center gap-3 rounded-3xl px-4 py-4 border-2"
                    style={{
                        borderColor: isActive ? "#FE8C00" : "#E2E8F0",
                        backgroundColor: isActive ? "#FFF6EF" : "#FFFFFF",
                    }}
                    hitSlop={8}
                    onPress={() => onSelect(option.id)}
                >
                    <View
                        className="size-4 rounded-full border-2 items-center justify-center"
                        style={{ borderColor: isActive ? "#FE8C00" : "#CBD5F5" }}
                    >
                        {isActive && <View className="size-2 rounded-full bg-primary" />}
                    </View>
                    <View className="flex-1 gap-1">
                        <View className="flex-row items-center gap-2">
                            <Text className="paragraph-semibold text-dark-100">{option.label}</Text>
                            {option.badge ? (
                                <View className="px-2 py-0.5 rounded-full bg-primary/10">
                                    <Text className="caption text-primary-dark">{option.badge}</Text>
                                </View>
                            ) : null}
                        </View>
                        <Text className="body-medium text-dark-60">{option.description}</Text>
                        {option.hint ? <Text className="caption text-dark-40">{option.hint}</Text> : null}
                    </View>
                </TouchableOpacity>
            );
        })}
    </View>
);

export default PaymentMethodList;
