import { ReactNode } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { panelDesign, panelTypography } from "./panelDesign";

type Props = {
    title?: string;
    subtitle?: string;
    children?: ReactNode;
    style?: StyleProp<ViewStyle>;
    compact?: boolean;
    right?: ReactNode;
};

export const PanelCard = ({ title, subtitle, children, style, compact = false, right }: Props) => {
    return (
        <View style={[styles.card, compact ? styles.compactCard : null, style]}>
            {(title || subtitle || right) ? (
                <View style={styles.header}>
                    <View style={{ flex: 1 }}>
                        {title ? <Text style={styles.title}>{title}</Text> : null}
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
        backgroundColor: panelDesign.colors.card,
        borderRadius: panelDesign.radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: panelDesign.colors.border,
        padding: panelDesign.spacing.md,
        gap: panelDesign.spacing.sm,
        shadowColor: panelDesign.colors.shadow,
        shadowOpacity: 0.09,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 7 },
        elevation: 2,
    },
    compactCard: {
        paddingVertical: panelDesign.spacing.sm,
        paddingHorizontal: panelDesign.spacing.md,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: panelDesign.spacing.sm,
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: panelTypography.sectionTitleMobile,
        color: panelDesign.colors.text,
    },
    subtitle: {
        fontFamily: "ChairoSans",
        fontSize: panelTypography.body,
        color: panelDesign.colors.muted,
        lineHeight: 21,
    },
});
