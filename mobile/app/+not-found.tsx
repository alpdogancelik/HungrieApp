import { useEffect, useMemo, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import RobotDelivery from "@/assets/illustrations/Robot Delivery.svg";
import { useStableWindowDimensions } from "@/src/lib/useStableWindowDimensions";

const NotFoundScreen = () => {
    const router = useRouter();
    const pathname = usePathname();
    const { width } = useStableWindowDimensions();
    const isWide = width >= 980;
    const useNativeDriver = Platform.OS !== "web";

    const floatAnim = useRef(new Animated.Value(0)).current;
    const glowAnim = useRef(new Animated.Value(0.4)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, {
                    toValue: 1,
                    duration: 2200,
                    useNativeDriver,
                }),
                Animated.timing(floatAnim, {
                    toValue: 0,
                    duration: 2200,
                    useNativeDriver,
                }),
            ]),
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(glowAnim, {
                    toValue: 0.95,
                    duration: 1600,
                    useNativeDriver,
                }),
                Animated.timing(glowAnim, {
                    toValue: 0.45,
                    duration: 1600,
                    useNativeDriver,
                }),
            ]),
        ).start();
    }, [floatAnim, glowAnim, useNativeDriver]);

    const floatingTransform = useMemo(
        () => [
            {
                translateY: floatAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, -10],
                }),
            },
        ],
        [floatAnim],
    );

    return (
        <SafeAreaView style={styles.root}>
            <LinearGradient
                colors={["#FFF7EC", "#FFF1DC", "#FDF5E6"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
            >
                <View style={[styles.container, isWide ? styles.containerWide : styles.containerCompact]}>
                    <View style={[styles.copyCol, isWide ? styles.copyColWide : styles.copyColCompact]}>
                        <Text style={styles.eyebrow}>Hungrie</Text>
                        <Text style={styles.title}>404</Text>
                        <Text style={styles.subtitle}>Page not found.</Text>
                        <Text style={styles.description}>
                            The link may have changed, or there may be a temporary issue. Go back to the home page and keep exploring restaurants.
                        </Text>

                        <View style={styles.actions}>
                            <Pressable style={styles.primaryBtn} onPress={() => router.replace("/home")}>
                                <Feather name="home" size={16} color="#FFFFFF" />
                                <Text style={styles.primaryBtnText}>Go Home</Text>
                            </Pressable>

                            <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
                                <Feather name="corner-up-left" size={16} color="#1F2937" />
                                <Text style={styles.secondaryBtnText}>Go Back</Text>
                            </Pressable>
                        </View>

                        <View style={styles.routePill}>
                            <Text style={styles.routePillText} numberOfLines={1}>
                                Path: {pathname || "/unknown"}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.visualCol}>
                        <Animated.View style={[styles.glow, { opacity: glowAnim }]} />
                        <Animated.View style={[styles.heroCard, { transform: floatingTransform }]}>
                            <RobotDelivery width={isWide ? 420 : 260} height={isWide ? 420 : 260} />
                        </Animated.View>
                    </View>
                </View>
            </LinearGradient>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: "#FFF7EC",
    },
    gradient: {
        flex: 1,
    },
    container: {
        flex: 1,
        width: "100%",
        alignSelf: "center",
        maxWidth: 1200,
        paddingHorizontal: 20,
        paddingVertical: 20,
    },
    containerWide: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: 28,
    },
    containerCompact: {
        justifyContent: "center",
        alignItems: "center",
        rowGap: 14,
    },
    copyCol: {
        zIndex: 2,
    },
    copyColWide: {
        width: "48%",
    },
    copyColCompact: {
        width: "100%",
        maxWidth: 540,
        alignItems: "center",
    },
    eyebrow: {
        fontFamily: "ChairoSans",
        color: "#FE8C00",
        fontSize: 13,
        letterSpacing: 1.8,
        textTransform: "uppercase",
    },
    title: {
        marginTop: 6,
        fontFamily: "ChairoSans",
        fontSize: 84,
        lineHeight: 88,
        color: "#0F172A",
    },
    subtitle: {
        marginTop: 6,
        fontFamily: "ChairoSans",
        fontSize: 30,
        lineHeight: 36,
        color: "#111827",
    },
    description: {
        marginTop: 12,
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 22,
        color: "#475569",
        maxWidth: 560,
    },
    actions: {
        marginTop: 24,
        flexDirection: "row",
        columnGap: 12,
        flexWrap: "wrap",
        rowGap: 10,
    },
    primaryBtn: {
        borderRadius: 999,
        backgroundColor: "#FE8C00",
        paddingHorizontal: 16,
        paddingVertical: 11,
        flexDirection: "row",
        alignItems: "center",
        columnGap: 8,
    },
    primaryBtnText: {
        color: "#FFFFFF",
        fontFamily: "ChairoSans",
        fontSize: 14,
    },
    secondaryBtn: {
        borderRadius: 999,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        paddingHorizontal: 16,
        paddingVertical: 11,
        flexDirection: "row",
        alignItems: "center",
        columnGap: 8,
    },
    secondaryBtnText: {
        color: "#1F2937",
        fontFamily: "ChairoSans",
        fontSize: 14,
    },
    routePill: {
        marginTop: 16,
        alignSelf: "flex-start",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#F1D4A5",
        backgroundColor: "#FFF8ED",
        paddingHorizontal: 12,
        paddingVertical: 6,
        maxWidth: "100%",
    },
    routePillText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#9A6700",
    },
    visualCol: {
        flex: 1,
        minHeight: 260,
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
    },
    glow: {
        position: "absolute",
        width: 300,
        height: 300,
        borderRadius: 999,
        backgroundColor: "rgba(254, 140, 0, 0.22)",
        transform: [{ scale: 1.04 }],
    },
    heroCard: {
        borderRadius: 28,
        padding: 10,
        backgroundColor: "rgba(255, 255, 255, 0.58)",
        borderWidth: 1,
        borderColor: "#F3DFBE",
    },
});

export default NotFoundScreen;
