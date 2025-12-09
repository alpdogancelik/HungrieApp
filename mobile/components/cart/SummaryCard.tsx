import { Text, View } from "react-native";
import { makeShadow } from "@/src/lib/shadowStyle";

const cardShadow = makeShadow({
    color: "#0F172A",
    offsetY: 12,
    blurRadius: 20,
    opacity: 0.08,
    elevation: 5,
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
    <View className="flex-row items-center justify-between py-1">
        <Text className={highlight ? "paragraph-semibold text-dark-80" : "body-medium text-dark-60"}>{label}</Text>
        <Text className={highlight ? "h3-bold text-dark-100" : "paragraph-semibold text-dark-100"}>{value}</Text>
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
        <View className="bg-white rounded-[32px] p-5 gap-2" style={cardShadow}>
            <SummaryRow label={summaryLabels.subtotal} value={subtotal} />
            {deliveryFee ? <SummaryRow label={summaryLabels.delivery} value={deliveryFee} /> : null}
            {serviceFee ? (
                <View className="gap-1">
                    <SummaryRow label={summaryLabels.serviceFee} value={serviceFee} />
                    {serviceNote ? <Text className="caption text-dark-60">{serviceNote}</Text> : null}
                </View>
            ) : null}
            {discount ? <SummaryRow label={summaryLabels.discount} value={`-${discount}`} /> : null}
            <View className="border-t border-gray-100 my-2" />
            <SummaryRow label={summaryLabels.total} value={total} highlight />
            {hasFees ? (
                <Text className="caption text-dark-60">{summaryLabels.footnote}</Text>
            ) : null}
        </View>
    );
};

export default SummaryCard;
