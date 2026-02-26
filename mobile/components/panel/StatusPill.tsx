import { StyleSheet, Text, View } from "react-native";

type Props = {
    status: string;
    label?: string;
};

const toneByStatus: Record<string, { bg: string; fg: string }> = {
    pending: { bg: "#FFF7DD", fg: "#D18A00" },
    accepted: { bg: "#E7FAF2", fg: "#0E9F6E" },
    out_for_delivery: { bg: "#E6F4FF", fg: "#0A66C2" },
    canceled: { bg: "#FFEAF0", fg: "#C03855" },
    rejected: { bg: "#FFEAF0", fg: "#C03855" },
    delivered: { bg: "#E9EDFF", fg: "#4D5CD9" },
};

const toLabel = (status: string) => {
    if (!status) return "-";
    return status.charAt(0).toUpperCase() + status.slice(1);
};

const StatusPill = ({ status, label }: Props) => {
    const tone = toneByStatus[status] || { bg: "#EEF2FF", fg: "#334155" };
    return (
        <View style={[styles.pill, { backgroundColor: tone.bg }]}>
            <Text style={[styles.label, { color: tone.fg }]}>{label || toLabel(status)}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    pill: {
        minHeight: 28,
        minWidth: 74,
        paddingHorizontal: 12,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
    },
    label: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 18,
    },
});

export default StatusPill;
