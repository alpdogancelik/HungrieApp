import { useEffect, useMemo, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { illustrations } from "@/constants/mediaCatalog";
import { useTheme } from "@/src/theme/themeContext";
import { subscribeCartLock } from "@/store/cart.store";

const CartLockNotice = () => {
    const { theme } = useTheme();
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState("");
    const slideAnim = useMemo(() => new Animated.Value(0), []);
    const Illustration = illustrations.courierHero;

    useEffect(() => {
        const unsubscribe = subscribeCartLock((msg) => {
            setMessage(msg);
            setVisible(true);
            slideAnim.setValue(0);
            Animated.timing(slideAnim, {
                toValue: 1,
                duration: 250,
                useNativeDriver: true,
            }).start(() => {
                setTimeout(() => {
                    Animated.timing(slideAnim, {
                        toValue: 0,
                        duration: 200,
                        useNativeDriver: true,
                    }).start(() => setVisible(false));
                }, 2800);
            });
        });
        return () => {
            // call unsubscribe and ignore its return value (some subscribe implementations return boolean)
            unsubscribe();
        };
    }, [slideAnim]);

    if (!visible) return null;

    const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

    return (
        <Animated.View
            style={[
                styles.container,
                { transform: [{ translateY }], shadowColor: theme.colors.ink, backgroundColor: theme.colors.surface },
            ]}
            pointerEvents="box-none"
        >
            <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                <View style={styles.illustration}>
                    <Illustration width={78} height={78} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                    <Text style={[styles.title, { color: theme.colors.ink }]}>
                        {t("cart.screen.cartLockTitle")}
                    </Text>
                    <Text style={[styles.body, { color: theme.colors.muted }]}>
                        {t("cart.screen.cartLockBody")}
                    </Text>
                    <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                        <TouchableOpacity onPress={() => setVisible(false)} style={styles.button}>
                            <Text style={[styles.buttonLabel, { color: theme.colors.primary }]}>
                                {t("cart.screen.cartLockOk")}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: "absolute",
        left: 16,
        right: 16,
        top: 32,
        zIndex: 9999,
    },
    card: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
    },
    illustration: {
        width: 86,
        height: 86,
        borderRadius: 14,
        backgroundColor: "#FFF5E8",
        alignItems: "center",
        justifyContent: "center",
    },
    title: { fontFamily: "ChairoSans", fontSize: 16 },
    body: { fontFamily: "ChairoSans", fontSize: 13, lineHeight: 18 },
    button: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: "#FDF5E7",
        borderWidth: 1,
        borderColor: "#F5D7A1",
    },
    buttonLabel: { fontFamily: "ChairoSans", fontSize: 13 },
});

export default CartLockNotice;
