import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";

type MetricTone = "warning" | "success" | "info";

type DashboardMetric = {
    id: string;
    label: string;
    value: number;
    tone?: MetricTone;
};

type DashboardLink = {
    id: string;
    label: string;
    iconName: keyof typeof Feather.glyphMap;
    onPress: () => void;
    accessibilityLabel?: string;
};

type Props = {
    title: string;
    metrics: DashboardMetric[];
    links: DashboardLink[];
};

const toneStyle = (tone: MetricTone = "info") => {
    // Keeps status cards visually distinct without adding heavy UI dependencies.
    if (tone === "warning") {
        return { bg: "#FFF7DD", border: "#F3DC9C", fg: "#B57800" };
    }
    if (tone === "success") {
        return { bg: "#E7FAF2", border: "#C5EEDB", fg: "#0E9F6E" };
    }
    return { bg: "#E9EDFF", border: "#D7DEF9", fg: "#4D5CD9" };
};

const DashboardSummary = ({ title, metrics, links }: Props) => {
    const { width } = useWindowDimensions();
    const isPhone = width < 760;

    return (
        <View style={styles.wrap}>
            <View style={styles.headerRow}>
                <View style={styles.titleBadge}>
                    <Feather name="bar-chart-2" size={13} color="#B94900" />
                </View>
                <Text style={styles.title}>{title}</Text>
            </View>

            <View style={[styles.metricsRow, isPhone ? styles.metricsRowPhone : null]}>
                {metrics.map((metric) => {
                    const tone = toneStyle(metric.tone);
                    return (
                        <View
                            key={metric.id}
                            style={[
                                styles.metricCard,
                                isPhone ? styles.metricCardPhone : null,
                                {
                                    backgroundColor: tone.bg,
                                    borderColor: tone.border,
                                },
                            ]}
                        >
                            <Text style={styles.metricLabel}>{metric.label}</Text>
                            <Text style={[styles.metricValue, { color: tone.fg }]}>{metric.value}</Text>
                        </View>
                    );
                })}
            </View>

            <View style={[styles.linksRow, isPhone ? styles.linksRowPhone : null]}>
                {links.map((link) => (
                    <TouchableOpacity
                        key={link.id}
                        onPress={link.onPress}
                        accessibilityRole="button"
                        accessibilityLabel={link.accessibilityLabel || link.label}
                        activeOpacity={0.82}
                        style={[styles.linkButton, isPhone ? styles.linkButtonPhoneStacked : null]}
                    >
                        <View style={styles.linkButtonContent}>
                            <View style={styles.linkIconWrap}>
                                <Feather name={link.iconName} size={15} color="#B94900" />
                            </View>
                            <Text style={styles.linkButtonLabel}>{link.label}</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        borderWidth: 1,
        borderColor: "#E7DCCF",
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 12,
        gap: 10,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    titleBadge: {
        width: 24,
        height: 24,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#E7DCCF",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFF9F2",
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        color: "#1E2433",
    },
    metricsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    metricsRowPhone: {
        gap: 6,
    },
    metricCard: {
        minWidth: 110,
        flexGrow: 1,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    metricCardPhone: {
        minWidth: 96,
        paddingHorizontal: 9,
        paddingVertical: 7,
    },
    metricLabel: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 14,
        color: "#627189",
    },
    metricValue: {
        fontFamily: "ChairoSans",
        fontSize: 22,
        lineHeight: 24,
        marginTop: 2,
    },
    linksRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    linksRowPhone: {
        flexDirection: "column",
        flexWrap: "nowrap",
    },
    linkButton: {
        minWidth: 150,
        flexGrow: 1,
        minHeight: 44,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#EE7A14",
        backgroundColor: "#FFF5EA",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
        paddingVertical: 9,
    },
    linkButtonPhoneStacked: {
        width: "100%",
        minWidth: 0,
        flexGrow: 0,
        alignSelf: "stretch",
    },
    linkButtonContent: {
        width: "100%",
        minHeight: 18,
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        paddingHorizontal: 18,
    },
    linkIconWrap: {
        position: "absolute",
        left: 0,
        top: "50%",
        marginTop: -7.5,
    },
    linkButtonLabel: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 17,
        textAlign: "center",
        color: "#B94900",
        fontWeight: "600",
    },
});

export default DashboardSummary;
