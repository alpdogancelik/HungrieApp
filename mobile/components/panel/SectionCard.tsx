import { ReactNode } from "react";
import { Platform, StyleProp, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from "react-native";
import { makeShadow } from "@/src/lib/shadowStyle";

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
    const { width } = useWindowDimensions();
    const isPhone = width < 760;

    return (
        <View style={[styles.card, compact ? styles.compact : null, style]}>
            {(title || subtitle || right) ? (
                <View style={[styles.header, isPhone ? styles.headerPhone : null]}>
                    <View style={styles.headerMain}>
                        {title ? (
                            <View style={[styles.titleRow, isPhone ? styles.titleRowPhone : null]}>
                                {titleIcon ? <View style={styles.titleIconWrap}>{titleIcon}</View> : null}
                                <Text style={[styles.title, isPhone ? styles.titlePhone : null]}>{title}</Text>
                            </View>
                        ) : null}
                        {subtitle ? <Text style={[styles.subtitle, isPhone ? styles.subtitlePhone : null]}>{subtitle}</Text> : null}
                    </View>
                    {right ? <View style={[styles.headerRight, isPhone ? styles.headerRightPhone : null]}>{right}</View> : null}
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
        borderWidth: Platform.OS === "android" ? 1 : StyleSheet.hairlineWidth,
        borderColor: "#E7DCCF",
        padding: 14,
        gap: 10,
        ...makeShadow({ color: "rgba(45, 35, 20, 0.08)", offsetY: 7, blurRadius: 14, opacity: 0.09, elevation: 2 }),
        elevation: Platform.OS === "android" ? 0 : 2,
    },
    compact: {
        paddingVertical: 10,
    },
    header: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
    },
    headerPhone: {
        flexDirection: "column",
    },
    headerMain: {
        flex: 1,
        minWidth: 0,
    },
    headerRight: {
        alignSelf: "center",
        flexShrink: 1,
    },
    headerRightPhone: {
        alignSelf: "stretch",
        width: "100%",
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 19,
        color: "#1E2433",
        flexShrink: 1,
    },
    titlePhone: {
        fontSize: 17,
        lineHeight: 22,
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
    },
    titleRowPhone: {
        alignItems: "flex-start",
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
    subtitlePhone: {
        fontSize: 13,
        lineHeight: 18,
    },
});

export default SectionCard;
