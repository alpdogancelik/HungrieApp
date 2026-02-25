import { StyleSheet, Text, View } from "react-native";
import { panelDesign } from "./panelDesign";

type StatusTone = {
    backgroundColor: string;
    color: string;
};

const toneByStatus: Record<string, StatusTone> = {
    pending: { backgroundColor: panelDesign.colors.warningSoft, color: panelDesign.colors.warning },
    accepted: { backgroundColor: panelDesign.colors.successSoft, color: panelDesign.colors.success },
    delivered: { backgroundColor: panelDesign.colors.infoSoft, color: panelDesign.colors.info },
    canceled: { backgroundColor: panelDesign.colors.dangerSoft, color: panelDesign.colors.danger },
    rejected: { backgroundColor: panelDesign.colors.dangerSoft, color: panelDesign.colors.danger },
};

const toLabel = (status: string) => {
    if (!status) return "Unknown";
    return status.charAt(0).toUpperCase() + status.slice(1);
};

export const StatusBadge = ({ status }: { status: string }) => {
    const tone = toneByStatus[status] || { backgroundColor: "#EEF2FF", color: "#334155" };
    return (
        <View style={[styles.badge, { backgroundColor: tone.backgroundColor }]}>
            <Text style={[styles.label, { color: tone.color }]}>{toLabel(status)}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    badge: {
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
