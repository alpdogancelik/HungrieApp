import { Text, View } from "react-native";
import { cardShadow } from "./styles";

type Props = {
    subtotal: string;
    discount: string;
    total: string;
};

const SummaryRow = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
    <View className="flex-row items-center justify-between py-1">
        <Text className={highlight ? "paragraph-semibold text-dark-80" : "body-medium text-dark-60"}>{label}</Text>
        <Text className={highlight ? "h3-bold text-dark-100" : "paragraph-semibold text-dark-100"}>{value}</Text>
    </View>
);

const SummaryCard = ({ subtotal, discount, total }: Props) => (
    <View className="bg-white rounded-[32px] p-5 gap-2" style={cardShadow}>
        <SummaryRow label="Sub total" value={subtotal} />
        <SummaryRow label="Discount" value={discount} />
        <View className="border-t border-gray-100 my-2" />
        <SummaryRow label="Total" value={total} highlight />
    </View>
);

export default SummaryCard;
