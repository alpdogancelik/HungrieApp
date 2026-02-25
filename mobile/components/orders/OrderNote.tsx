import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
    note?: string;
    label: string;
    expandLabel: string;
    collapseLabel: string;
    accessibilityLabel?: string;
};

const OrderNote = ({ note, label, expandLabel, collapseLabel, accessibilityLabel }: Props) => {
    const [expanded, setExpanded] = useState(false);
    const normalized = useMemo(() => (typeof note === "string" ? note.trim() : ""), [note]);

    if (!normalized) return null;

    return (
        <Pressable
            onPress={() => setExpanded((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={({ pressed }) => [styles.wrap, pressed ? { opacity: 0.92 } : null]}
        >
            <View style={styles.header}>
                <View style={styles.iconWrap}>
                    <Text style={styles.iconText}>i</Text>
                </View>
                <Text style={styles.label}>{label}</Text>
            </View>
            <Text style={styles.noteText} numberOfLines={expanded ? undefined : 2}>
                {normalized}
            </Text>
            <Text style={styles.helper}>{expanded ? collapseLabel : expandLabel}</Text>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    wrap: {
        marginTop: 2,
        borderWidth: 1,
        borderColor: "#F0DDBE",
        backgroundColor: "#FFF9EF",
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        gap: 3,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    iconWrap: {
        width: 16,
        height: 16,
        borderRadius: 99,
        backgroundColor: "#FFE2B8",
        alignItems: "center",
        justifyContent: "center",
    },
    iconText: {
        fontFamily: "ChairoSans",
        fontSize: 11,
        color: "#A34700",
        lineHeight: 13,
    },
    label: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#A34700",
    },
    noteText: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        lineHeight: 17,
        color: "#334155",
    },
    helper: {
        fontFamily: "ChairoSans",
        fontSize: 11,
        color: "#8A99B1",
    },
});

export default OrderNote;
