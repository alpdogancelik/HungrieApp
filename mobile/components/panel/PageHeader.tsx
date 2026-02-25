import { ReactNode } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

type Props = {
    title: string;
    subtitle?: string;
    right?: ReactNode;
};

const PageHeader = ({ title, subtitle, right }: Props) => {
    const { width } = useWindowDimensions();
    const isMobile = width < 720;

    return (
        <View style={[styles.container, isMobile ? styles.containerMobile : null]}>
            <View style={styles.left}>
                <Text style={[styles.title, isMobile ? styles.titleMobile : null]}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {right ? <View style={[styles.right, isMobile ? styles.rightMobile : null]}>{right}</View> : null}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        borderWidth: 1,
        borderColor: "#E7DCCF",
        backgroundColor: "rgba(255, 251, 244, 0.95)",
        borderRadius: 18,
        padding: 16,
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
    },
    containerMobile: {
        flexDirection: "column",
        alignItems: "stretch",
    },
    left: {
        flex: 1,
        gap: 4,
    },
    right: {
        minWidth: 180,
    },
    rightMobile: {
        minWidth: 0,
        width: "100%",
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 28,
        color: "#1E2433",
        lineHeight: 34,
        flexShrink: 1,
    },
    titleMobile: {
        fontSize: 22,
        lineHeight: 28,
    },
    subtitle: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        color: "#627189",
        lineHeight: 20,
    },
});

export default PageHeader;
