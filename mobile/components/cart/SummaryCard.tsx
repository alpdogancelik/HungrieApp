import { StyleSheet, Text, View } from "react-native";
import { makeShadow } from "@/src/lib/shadowStyle";

const cardShadow = makeShadow({
    color: "#0F172A",
    offsetY: 12,
    blurRadius: 20,
    opacity: 0.08,
    elevation: 5,
});
const styles = StyleSheet.create({
    card: { backgroundColor: "#FFFFFF", borderRadius: 32, padding: 20, rowGap: 8 },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
    label: { fontFamily: "ChairoSans", fontSize: 14, color: "#475569" },
    value: { fontFamily: "ChairoSans", fontSize: 16, color: "#0F172A" },
    labelStrong: { fontFamily: "ChairoSans", fontSize: 16, color: "#1E293B" },
    valueStrong: { fontFamily: "ChairoSans", fontSize: 20, color: "#0F172A" },
    divider: { borderTopWidth: 1, borderColor: "#E2E8F0", marginVertical: 8 },
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

const SummaryRow = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
    <View className="flex-row items-center justify-between py-1" style={styles.row}>
        <Text className={highlight ? "paragraph-semibold text-dark-80" : "body-medium text-dark-60"} style={highlight ? styles.labelStrong : styles.label}>{label}</Text>
        <Text className={highlight ? "h3-bold text-dark-100" : "paragraph-semibold text-dark-100"} style={highlight ? styles.valueStrong : styles.value}>{value}</Text>
    </View>
);

const SummaryCard = ({ subtotal, serviceFee, serviceNote, deliveryFee, discount, total, labels }: Props) => {
    const summaryLabels = labels ?? {
        subtotal: "Sub total",
        delivery: "Delivery",
        serviceFee: "Hungrie Service Fee",
        discount: "Discount",
        total: "Total",
        footnote: "You will pay total amount shown above.",
    };
    const hasFees = Boolean(serviceFee || deliveryFee || discount);

    return (
        <View className="bg-white rounded-[32px] p-5 gap-2" style={[styles.card, cardShadow]}>
            <SummaryRow label={summaryLabels.subtotal} value={subtotal} />
            {deliveryFee ? <SummaryRow label={summaryLabels.delivery} value={deliveryFee} /> : null}
            {serviceFee ? (
                <View className="gap-1" style={styles.serviceBlock}>
                    <SummaryRow label={summaryLabels.serviceFee} value={serviceFee} />
                    {serviceNote ? <Text className="caption text-dark-60" style={styles.caption}>{serviceNote}</Text> : null}
                </View>
            ) : null}
            {discount ? <SummaryRow label={summaryLabels.discount} value={`-${discount}`} /> : null}
            <View className="border-t border-gray-100 my-2" style={styles.divider} />
            <SummaryRow label={summaryLabels.total} value={total} highlight />
            {hasFees ? (
                <Text className="caption text-dark-60" style={styles.caption}>{summaryLabels.footnote}</Text>
            ) : null}
        </View>
    );
};

export default SummaryCard;
