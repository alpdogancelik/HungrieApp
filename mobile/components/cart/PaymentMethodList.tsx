import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { PaymentMethod } from "@/src/domain/types";
const styles = StyleSheet.create({
    root: { rowGap: 12 },
    title: { fontFamily: "ChairoSans", fontSize: 18, color: "#0F172A" },
    row: { flexDirection: "row", alignItems: "center", columnGap: 12, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 16, borderWidth: 2 },
    radioOuter: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FE8C00" },
    content: { flex: 1, rowGap: 4 },
    labelRow: { flexDirection: "row", alignItems: "center", columnGap: 8 },
    label: { fontFamily: "ChairoSans", fontSize: 16, color: "#0F172A" },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(254,140,0,0.1)" },
    badgeText: { fontFamily: "ChairoSans", fontSize: 12, color: "#E56E00" },
    description: { fontFamily: "ChairoSans", fontSize: 14, color: "#475569" },
    hint: { fontFamily: "ChairoSans", fontSize: 12, color: "#64748B" },
});

type Option = { id: PaymentMethod; label: string; description: string; badge?: string; hint?: string };

type Props = {
    options: Option[];
    selected: PaymentMethod | null;
    onSelect: (method: PaymentMethod) => void;
    title: string;
};

const PaymentMethodList = ({ options, selected, onSelect, title }: Props) => (
    <View className="gap-3" style={styles.root}>
        <Text className="section-title" style={styles.title}>{title}</Text>
        {options.map((option) => {
            const isActive = selected === option.id;
            return (
                <TouchableOpacity
                    key={option.id}
                    className="flex-row items-center gap-3 rounded-3xl px-4 py-4 border-2"
                    style={[
                        styles.row,
                        {
                            borderColor: isActive ? "#FE8C00" : "#E2E8F0",
                            backgroundColor: isActive ? "#FFF6EF" : "#FFFFFF",
                        },
                    ]}
                    hitSlop={8}
                    onPress={() => onSelect(option.id)}
                >
                    <View
                        className="size-4 rounded-full border-2 items-center justify-center"
                        style={[styles.radioOuter, { borderColor: isActive ? "#FE8C00" : "#CBD5F5" }]}
                    >
                        {isActive && <View className="size-2 rounded-full bg-primary" style={styles.radioInner} />}
                    </View>
                    <View className="flex-1 gap-1" style={styles.content}>
                        <View className="flex-row items-center gap-2" style={styles.labelRow}>
                            <Text className="paragraph-semibold text-dark-100" style={styles.label}>{option.label}</Text>
                            {option.badge ? (
                                <View className="px-2 py-0.5 rounded-full bg-primary/10" style={styles.badge}>
                                    <Text className="caption text-primary-dark" style={styles.badgeText}>{option.badge}</Text>
                                </View>
                            ) : null}
                        </View>
                        <Text className="body-medium text-dark-60" style={styles.description}>{option.description}</Text>
                        {option.hint ? <Text className="caption text-dark-40" style={styles.hint}>{option.hint}</Text> : null}
                    </View>
                </TouchableOpacity>
            );
        })}
    </View>
);

export default PaymentMethodList;
