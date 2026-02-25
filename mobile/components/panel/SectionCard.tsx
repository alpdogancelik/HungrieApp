import { ReactNode } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

type Props = {
    title?: string;
    subtitle?: string;
    children?: ReactNode;
    style?: StyleProp<ViewStyle>;
    compact?: boolean;
    right?: ReactNode;
    titleIcon?: ReactNode;
};

const SectionCard = ({ title, subtitle, children, style, compact = false, right, titleIcon }: Props) => {
    return (
        <View style={[styles.card, compact ? styles.compact : null, style]}>
            {(title || subtitle || right) ? (
                <View style={styles.header}>
                    <View style={{ flex: 1 }}>
                        {title ? (
                            <View style={styles.titleRow}>
                                {titleIcon ? <View style={styles.titleIconWrap}>{titleIcon}</View> : null}
                                <Text style={styles.title}>{title}</Text>
                            </View>
                        ) : null}
                        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                    </View>
                    {right}
                </View>
            ) : null}
            {children}
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "#E7DCCF",
        padding: 14,
        gap: 10,
        shadowColor: "rgba(45, 35, 20, 0.08)",
        shadowOpacity: 0.09,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 7 },
        elevation: 2,
    },
    compact: {
        paddingVertical: 10,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 19,
        color: "#1E2433",
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    titleIconWrap: {
        width: 28,
        height: 28,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#E7DCCF",
        backgroundColor: "#FFF9F2",
    },
    subtitle: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#627189",
        lineHeight: 20,
    },
});

export default SectionCard;
