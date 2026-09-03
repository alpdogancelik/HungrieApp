import { StyleSheet, Text, View } from "react-native";
import { makeShadow } from "@/src/lib/shadowStyle";
import { useTheme } from "@/src/theme/themeContext";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";

const cardShadow = makeShadow({
    color: "#0F172A",
    offsetY: 12,
    blurRadius: 20,
    opacity: 0.08,
    elevation: 5,
});
const styles = createAdaptiveStyleSheet({
    card: { backgroundColor: "#FFFFFF", borderRadius: 28, padding: 20, rowGap: 8, borderWidth: 1, borderColor: "#EEE7DE" },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
    label: { fontFamily: "ChairoSans", fontSize: 14, color: "#475569" },
    value: { fontFamily: "ChairoSans", fontSize: 16, color: "#0F172A" },
    labelStrong: { fontFamily: "ChairoSans", fontSize: 16, color: "#1E293B" },
    valueStrong: { fontFamily: "ChairoSans", fontSize: 20, color: "#0F172A" },
    divider: { borderTopWidth: 1, borderColor: "#E9E2D8", marginVertical: 8 },
    caption: { fontFamily: "ChairoSans", fontSize: 12, color: "#475569" },
    serviceBlock: { rowGap: 4 },
});

type Props = {
    subtotal: string;
    serviceFee?: string;
    serviceNote?: string;
    deliveryFee?: string;
    discount?: string;
    total: string;
    labels?: {
        subtotal: string;
        delivery: string;
        serviceFee: string;
        discount: string;
        total: string;
        footnote: string;
    };
};

const SummaryRow = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => {
    const { theme } = useTheme();
    return (
        <View style={styles.row}>
            <Text style={[highlight ? styles.labelStrong : styles.label, { color: highlight ? theme.colors.ink : theme.colors.textSecondary }]}>{label}</Text>
            <Text style={[highlight ? styles.valueStrong : styles.value, { color: theme.colors.ink }]}>{value}</Text>
        </View>
    );
};

const SummaryCard = ({ subtotal, serviceFee, serviceNote, deliveryFee, discount, total, labels }: Props) => {
    const { theme } = useTheme();
    const summaryLabels = labels ?? {
        subtotal: "Sub total",
        delivery: "Delivery",
        serviceFee: "Hungrie Service Fee",
        discount: "Discount",
        total: "Total",
        footnote: "You will pay total amount shown above.",
    };
    return (
        <View style={[styles.card, cardShadow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <SummaryRow label={summaryLabels.subtotal} value={subtotal} />
            {deliveryFee ? <SummaryRow label={summaryLabels.delivery} value={deliveryFee} /> : null}
            {serviceFee ? (
                <View className="gap-1" style={styles.serviceBlock}>
                    <SummaryRow label={summaryLabels.serviceFee} value={serviceFee} />
                    {serviceNote ? <Text style={[styles.caption, { color: theme.colors.textSecondary }]}>{serviceNote}</Text> : null}
                </View>
            ) : null}
            {discount ? <SummaryRow label={summaryLabels.discount} value={`-${discount}`} /> : null}
            <View style={[styles.divider, { borderColor: theme.colors.divider }]} />
            <SummaryRow label={summaryLabels.total} value={total} highlight />
        </View>
    );
};

export default SummaryCard;
