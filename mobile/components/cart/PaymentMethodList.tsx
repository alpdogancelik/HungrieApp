import { Text, TouchableOpacity, View } from "react-native";
import type { PaymentMethod } from "@/src/domain/types";

type Option = { id: PaymentMethod; label: string; description: string };

type Props = {
    options: Option[];
    selected: PaymentMethod | null;
    onSelect: (method: PaymentMethod) => void;
};

const PaymentMethodList = ({ options, selected, onSelect }: Props) => (
    <View className="gap-3">
        <Text className="section-title">Payment methods</Text>
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
                    onPress={() => onSelect(option.id)}
                >
                    <View
                        className="size-4 rounded-full border-2 items-center justify-center"
                        style={{ borderColor: isActive ? "#FE8C00" : "#CBD5F5" }}
                    >
                        {isActive && <View className="size-2 rounded-full bg-primary" />}
                    </View>
                    <View className="flex-1">
                        <Text className="paragraph-semibold text-dark-100">{option.label}</Text>
                        <Text className="body-medium text-dark-60">{option.description}</Text>
                    </View>
                </TouchableOpacity>
            );
        })}
    </View>
);

export default PaymentMethodList;
