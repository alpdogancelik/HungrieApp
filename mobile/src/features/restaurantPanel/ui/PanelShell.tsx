import { ReactNode } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { panelDesign, panelTypography } from "./panelDesign";

type Props = {
    kicker?: string;
    title: string;
    subtitle?: string;
    right?: ReactNode;
    children: ReactNode;
    noScroll?: boolean;
    onBackPress?: () => void;
    backLabel?: string;
    backAccessibilityLabel?: string;
};

export const PanelShell = ({
    kicker,
    title,
    subtitle,
    right,
    children,
    noScroll = false,
    onBackPress,
    backLabel,
    backAccessibilityLabel,
}: Props) => {
    const { width } = useWindowDimensions();
    const isDesktop = width >= 980;
    const isPhone = width < 760;
    const headerTitleSize = isDesktop ? panelTypography.title : panelTypography.titleMobile;
    const subtitleSize = isDesktop ? panelTypography.subtitle : panelTypography.subtitleMobile;

    const body = (
        <View style={[styles.contentWrap, noScroll ? styles.contentWrapNoScroll : null, { maxWidth: isDesktop ? 1080 : 860 }]}>
            <View pointerEvents="none" style={styles.decoA} />
            <View pointerEvents="none" style={styles.decoB} />

            <View style={[styles.header, isPhone ? styles.headerPhone : null]}>
                <View style={[styles.headerMain, isPhone ? styles.headerMainPhone : null]}>
                    {onBackPress ? (
                        <Pressable
                            onPress={onBackPress}
                            accessibilityRole="button"
                            accessibilityLabel={backAccessibilityLabel || backLabel || "Back"}
                            style={({ pressed }) => [styles.backButton, pressed ? { opacity: 0.8 } : null]}
                        >
                            <Feather name="chevron-left" size={16} color={panelDesign.colors.text} />
                            <Text style={styles.backLabel}>{backLabel || "Back"}</Text>
                        </Pressable>
                    ) : null}
                    {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
                    <Text style={[styles.title, { fontSize: headerTitleSize, lineHeight: headerTitleSize + 6 }]}>{title}</Text>
                    {subtitle ? <Text style={[styles.subtitle, { fontSize: subtitleSize }]}>{subtitle}</Text> : null}
                </View>
                {right ? <View style={[styles.headerRight, isPhone ? styles.headerRightPhone : null]}>{right}</View> : null}
            </View>
            {children}
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            {noScroll ? <View style={styles.staticBody}>{body}</View> : <ScrollView contentContainerStyle={styles.scrollContent}>{body}</ScrollView>}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: panelDesign.colors.background,
    },
    scrollContent: {
        paddingHorizontal: panelDesign.spacing.md,
        paddingTop: panelDesign.spacing.md,
        paddingBottom: panelDesign.spacing.xl,
        alignItems: "center",
    },
    staticBody: {
        flex: 1,
        paddingHorizontal: panelDesign.spacing.md,
        paddingTop: panelDesign.spacing.md,
        paddingBottom: panelDesign.spacing.xl,
        alignItems: "center",
    },
    contentWrap: {
        width: "100%",
        gap: panelDesign.spacing.md,
    },
    contentWrapNoScroll: {
        flex: 1,
    },
    header: {
        padding: panelDesign.spacing.md,
        borderRadius: panelDesign.radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: panelDesign.colors.border,
        backgroundColor: "rgba(255, 251, 244, 0.95)",
        flexDirection: "row",
        alignItems: "center",
        gap: panelDesign.spacing.md,
        overflow: Platform.OS === "web" ? "hidden" : "visible",
    },
    headerPhone: {
        flexDirection: "column",
        alignItems: "stretch",
    },
    headerMain: {
        flex: 1,
        minWidth: 0,
    },
    headerMainPhone: {
        flexGrow: 0,
        flexShrink: 0,
        width: "100%",
    },
    headerRight: {
        alignSelf: "flex-start",
    },
    headerRightPhone: {
        width: "100%",
        alignSelf: "stretch",
    },
    kicker: {
        fontFamily: "ChairoSans",
        color: panelDesign.colors.primary,
        fontSize: panelTypography.kicker,
        letterSpacing: 0.4,
        marginBottom: 4,
    },
    backButton: {
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        backgroundColor: panelDesign.colors.backgroundSoft,
        marginBottom: 8,
    },
    backLabel: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: panelDesign.colors.text,
        lineHeight: 15,
    },
    title: {
        fontFamily: "ChairoSans",
        color: panelDesign.colors.text,
    },
    subtitle: {
        fontFamily: "ChairoSans",
        color: panelDesign.colors.muted,
        lineHeight: 24,
        marginTop: 4,
    },
    decoA: {
        position: "absolute",
        top: -80,
        right: -36,
        width: 220,
        height: 220,
        borderRadius: 999,
        backgroundColor: "rgba(238, 122, 20, 0.08)",
    },
    decoB: {
        position: "absolute",
        top: 190,
        left: -40,
        width: 160,
        height: 160,
        borderRadius: 999,
        backgroundColor: "rgba(125, 147, 178, 0.08)",
    },
});
