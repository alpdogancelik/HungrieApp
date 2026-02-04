import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    FlatList,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from "react-native";
import { useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import useAuthStore from "@/store/auth.store";

// --- Assets
import brandMark from "../assets/images/hungrie-mark.png";
const brandWordmark = require("../assets/images/hungrie-wordmark.png");

const burgerMeal = require("../assets/images/view-3d-burger-meal-with-french-fries.jpg");
const fastFoodPlatter = require("../assets/images/vecteezy_fast-food-meal-with_25065315.png");
const burger3d = require("../assets/images/Burger.png");
const pizza3d = require("../assets/images/Pizza.png");
const fries3d = require("../assets/images/Fries.png");

const deliveryBag = require("../assets/images/Delivery Bag.png");
const deliveryTime = require("../assets/images/Delivery Time.png");
const foodOrder = require("../assets/images/Food Order.png");

const WEB_MAX_WIDTH = 430;
const ONBOARDING_SEEN_KEY = "hungrie.onboarding.seen";

type HeroFrame = {
    key: string;
    image: any;
    fit?: "cover" | "contain";
};

type Slide = {
    key: string;
    kicker: string;
    title: string;
    subtitle: string;
    bullets: string[];
    frames: HeroFrame[];
};

// ---------- Buttons
function PrimaryButton({
    label,
    onPress,
    style,
}: {
    label: string;
    onPress: () => void;
    style?: any;
}) {
    return (
        <Pressable
            onPress={onPress}
            hitSlop={8}
            style={({ pressed }) => [
                styles.btnBase,
                styles.btnPrimary,
                pressed && styles.btnPressed,
                style,
            ]}
        >
            <LinearGradient
                colors={["#C63A24", "#B02A1D", "#8E1F19"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
            />
            <Text style={styles.btnPrimaryText}>{label}</Text>
        </Pressable>
    );
}

function SecondaryButton({
    label,
    onPress,
    style,
}: {
    label: string;
    onPress: () => void;
    style?: any;
}) {
    return (
        <Pressable
            onPress={onPress}
            hitSlop={8}
            style={({ pressed }) => [
                styles.btnBase,
                styles.btnSecondary,
                pressed && styles.btnPressed,
                style,
            ]}
        >
            <Text style={styles.btnSecondaryText}>{label}</Text>
        </Pressable>
    );
}

function GhostButton({
    label,
    onPress,
    disabled,
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
}) {
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            hitSlop={8}
            style={({ pressed }) => [
                styles.btnBase,
                styles.btnGhost,
                disabled && styles.btnDisabled,
                pressed && !disabled && styles.btnPressed,
            ]}
        >
            <Text style={[styles.btnGhostText, disabled && styles.btnGhostTextDisabled]}>
                {label}
            </Text>
        </Pressable>
    );
}

// ---------- HeroCarousel
const HeroCarousel = memo(function HeroCarousel({
    frames,
    height,
    width,
    onInteractStart,
    onInteractEnd,
}: {
    frames: HeroFrame[];
    height: number;
    width: number;
    onInteractStart: () => void;
    onInteractEnd: () => void;
}) {
    const innerRef = useRef<FlatList<HeroFrame>>(null);
    const [innerIndex, setInnerIndex] = useState(0);

    const handleEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const i = Math.round(e.nativeEvent.contentOffset.x / width);
        setInnerIndex(i);
        onInteractEnd();
    };

    return (
        <View style={[styles.heroCard, { height, width }]}>
            {/* premium background */}
            <LinearGradient
                colors={["#2B0B07", "#160604", "#0F0403"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
            />

            <FlatList
                ref={innerRef}
                data={frames}
                keyExtractor={(it) => it.key}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                bounces={false}
                nestedScrollEnabled
                scrollEventThrottle={16}
                onTouchStart={onInteractStart}
                onMomentumScrollEnd={handleEnd}
                renderItem={({ item }) => (
                    <View style={{ width, height }}>
                        <Image
                            source={item.image}
                            style={styles.heroImage}
                            contentFit={item.fit ?? "contain"}
                        />
                    </View>
                )}
            />

            {/* vignette for legibility */}
            <LinearGradient
                colors={[
                    "rgba(0,0,0,0.00)",
                    "rgba(0,0,0,0.22)",
                    "rgba(0,0,0,0.74)",
                ]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.heroVignette}
                pointerEvents="none"
            />

            {/* subtle border highlight */}
            <View style={styles.heroBorder} pointerEvents="none" />

            {/* mini indicator */}
            <View style={styles.heroDots}>
                {frames.map((_, i) => (
                    <View
                        key={`h-dot-${i}`}
                        style={[styles.heroDot, i === innerIndex && styles.heroDotActive]}
                    />
                ))}
            </View>
        </View>
    );
});

export default function WelcomeScreen() {
    const { isAuthenticated, isLoading } = useAuthStore();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();

    const contentWidth =
        Platform.OS === "web" ? Math.min(windowWidth, WEB_MAX_WIDTH) : windowWidth;

    const cardWidth = Math.max(260, contentWidth - 36);

    // biraz daha “dolu” dursun diye yüksekliği akıllı ayarladım
    const heroHeight = Math.min(
        380,
        Math.max(290, Math.round(cardWidth * 0.84))
    );

    const slides: Slide[] = useMemo(() => {
        const discoverFrames: HeroFrame[] = [
            { key: "burgermeal", image: burgerMeal, fit: "cover" },
            { key: "pizza", image: pizza3d, fit: "contain" },
            { key: "burger", image: burger3d, fit: "contain" },
        ];

        const orderFrames: HeroFrame[] = [
            { key: "delivery-bag", image: deliveryBag, fit: "contain" },
            { key: "food-order", image: foodOrder, fit: "contain" },
            { key: "delivery-time", image: deliveryTime, fit: "contain" },
        ];

        const readyFrames: HeroFrame[] = [
            { key: "fastfood", image: fastFoodPlatter, fit: "contain" },
            { key: "fries", image: fries3d, fit: "contain" },
            { key: "wordmark", image: brandWordmark, fit: "contain" },
        ];

        return [
            {
                key: "discover",
                kicker: "Bugün ne yesek?",
                title: "Canın çektiyse\nsöyle.",
                subtitle:
                    "Burger, pizza, dürüm… Kampüsteki iyi yerler burada. Keşfet, seç, afiyetle bekle.",
                bullets: ["Gerçek menüler, net fiyatlar", "Favorilerini tek dokunuşla bul"],
                frames: discoverFrames,
            },
            {
                key: "order",
                kicker: "Sıcak sıcak",
                title: "Sipariş ver.\nTakibini gör.",
                subtitle: "Sepet → not → onay → teslimat. Her adım ekranda; kontrol sende.",
                bullets: ["Hızlı sepet, akıllı notlar", "Anlık durum ve teslimat süresi"],
                frames: orderFrames,
            },
            {
                key: "ready",
                kicker: "Hadi başlayalım",
                title: "Hazır mısın?",
                subtitle:
                    "1 dakikada hesabını aç. Açsan da olur—acıkınca zaten açacaksın 🙂",
                bullets: [
                    "Kayıt kısa, giriş güvenli",
                    "Giriş yaptıysan kaldığın yerden",
                    "Bugün kendine bir iyilik: yemek söyle",
                ],
                frames: readyFrames,
            },
        ];
    }, []);

    const [index, setIndex] = useState(0);
    const listRef = useRef<FlatList<Slide>>(null);
    const scrollX = useRef(new Animated.Value(0)).current;

    const [outerScrollEnabled, setOuterScrollEnabled] = useState(true);

    useEffect(() => {
        if (isLoading) return;
        if (isAuthenticated) router.replace("/home");
    }, [isAuthenticated, isLoading, router]);

    const goTo = (i: number) => {
        const clamped = Math.max(0, Math.min(i, slides.length - 1));
        listRef.current?.scrollToOffset({ offset: clamped * contentWidth, animated: true });
        setIndex(clamped);
    };

    const markOnboardingSeen = () => AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1").catch(() => null);

    const handleSkip = () => {
        markOnboardingSeen();
        goTo(slides.length - 1);
    };
    const handleNext = () => goTo(index + 1);
    const handleBack = () => goTo(index - 1);

    const handleGetStarted = () => {
        markOnboardingSeen();
        router.push("/sign-up");
    };
    const handleLogin = () => {
        markOnboardingSeen();
        router.push("/sign-in");
    };

    return (
        <LinearGradient colors={["#FFF7EF", "#FFEBDD", "#FFDCC4"]} style={styles.bg}>
            <StatusBar style="dark" />

            <SafeAreaView style={[styles.safe, { paddingBottom: 10 + insets.bottom }]}>
                <View style={[styles.container, { width: contentWidth }]}>
                    {/* Top Bar */}
                    <View style={styles.topBar}>
                        <View style={styles.brandLeft}>
                            <View style={styles.brandMarkWrap}>
                                <Image source={brandMark} style={styles.brandMark} contentFit="contain" />
                            </View>

                            <View style={{ flex: 1 }}>
                                <Image source={brandWordmark} style={styles.wordmark} contentFit="contain" />
                                <Text style={styles.brandSub}>Tüm siparişlerin tek uygulamada.</Text>
                            </View>
                        </View>

                        {index < slides.length - 1 ? (
                            <Pressable onPress={handleSkip} style={styles.skipBtn} hitSlop={10}>
                                <Text style={styles.skipText}>Atla</Text>
                            </Pressable>
                        ) : (
                            <View style={{ width: 54 }} />
                        )}
                    </View>

                    {/* Slides */}
                    <Animated.FlatList
                        ref={listRef}
                        data={slides}
                        keyExtractor={(it) => it.key}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        bounces={false}
                        scrollEventThrottle={16}
                        scrollEnabled={outerScrollEnabled}
                        style={{ width: contentWidth, alignSelf: "center", flex: 1 }}
                        onScroll={Animated.event(
                            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                            { useNativeDriver: true }
                        )}
                        onMomentumScrollEnd={(e) => {
                            const i = Math.round(e.nativeEvent.contentOffset.x / contentWidth);
                            setIndex(i);
                        }}
                        renderItem={({ item, index: i }) => {
                            const inputRange = [
                                (i - 1) * contentWidth,
                                i * contentWidth,
                                (i + 1) * contentWidth,
                            ];

                            const cardScale = scrollX.interpolate({
                                inputRange,
                                outputRange: [0.988, 1, 0.988],
                                extrapolate: "clamp",
                            });

                            return (
                                <View style={[styles.slide, { width: contentWidth }]}>
                                    {/* Card */}
                                    <Animated.View style={{ transform: [{ scale: cardScale }] }}>
                                        <HeroCarousel
                                            frames={item.frames}
                                            height={heroHeight}
                                            width={cardWidth}
                                            onInteractStart={() => setOuterScrollEnabled(false)}
                                            onInteractEnd={() => setOuterScrollEnabled(true)}
                                        />

                                        {/* Copy overlay */}
                                        <View style={styles.heroOverlay}>
                                            <View style={styles.kickerPill}>
                                                <Text style={styles.kicker}>{item.kicker}</Text>
                                            </View>

                                            <Text style={styles.title}>{item.title}</Text>
                                            <Text style={styles.subtitle}>{item.subtitle}</Text>
                                        </View>
                                    </Animated.View>

                                    {/* Bullets (glass panel) */}
                                    <View style={styles.bulletsPanel}>
                                        {item.bullets.map((b, bi) => (
                                            <View key={`${item.key}-b-${bi}`} style={styles.bulletRow}>
                                                <View style={styles.bulletDot} />
                                                <Text style={styles.bulletText}>{b}</Text>
                                            </View>
                                        ))}
                                    </View>

                                    {/* Footer */}
                                    <View style={styles.footer}>
                                        <View style={styles.dotsRow}>
                                            <Text style={styles.stepText}>
                                                {index + 1}/{slides.length}
                                            </Text>

                                            <View style={styles.dots}>
                                                {slides.map((_, di) => (
                                                    <View
                                                        key={`dot-${di}`}
                                                        style={[styles.dot, di === index && styles.dotActive]}
                                                    />
                                                ))}
                                            </View>
                                        </View>

                                        {index < slides.length - 1 ? (
                                            <View style={styles.navRow}>
                                                <GhostButton label="Geri" onPress={handleBack} disabled={index === 0} />
                                                <PrimaryButton label="Devam" onPress={handleNext} />
                                            </View>
                                        ) : (
                                            <View style={styles.ctaGroup}>
                                                <PrimaryButton label="Hemen başla" onPress={handleGetStarted} style={{ flex: 1 }} />
                                                <SecondaryButton label="Giriş yap" onPress={handleLogin} style={{ flex: 1 }} />
                                                <Text style={styles.caption}>
                                                    Giriş yaptıysan seni otomatik olarak devam ettiriyoruz.
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            );
                        }}
                    />
                </View>
            </SafeAreaView>
        </LinearGradient>
    );
}

const FONT_BODY = "ChairoSans";
const FONT_UI = "ChairoSans";
const FONT_DISPLAY = "ChairoSans";

const styles = StyleSheet.create({
    bg: { flex: 1 },
    safe: { flex: 1 },
    container: { flex: 1, alignSelf: "center" },

    topBar: {
        paddingHorizontal: 18,
        paddingTop: 8,
        paddingBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    brandLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },

    brandMarkWrap: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: "rgba(20,6,4,0.94)",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.16,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 14,
        elevation: 6,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
    },
    brandMark: { width: 44, height: 44 },

    wordmark: { height: 18, width: 150, marginBottom: 2 },
    brandSub: {
        fontFamily: FONT_BODY,
        marginTop: 1,
        fontSize: 12,
        color: "#7A4A2A",
        opacity: 0.9,
    },

    skipBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.70)",
        borderWidth: 1,
        borderColor: "rgba(58,31,11,0.10)",
    },
    skipText: { fontFamily: FONT_UI, color: "#6B3A1D", fontSize: 12 },

    slide: {
        flex: 1,
        paddingHorizontal: 18,
        paddingBottom: 10,
        justifyContent: "space-between",
    },

    heroCard: {
        borderRadius: 30,
        overflow: "hidden",
        backgroundColor: "#160604",
        shadowColor: "#000",
        shadowOpacity: Platform.OS === "ios" ? 0.14 : 0.22,
        shadowOffset: { width: 0, height: 16 },
        shadowRadius: 24,
        elevation: 10,
    },
    heroImage: { width: "100%", height: "100%" },
    heroVignette: { ...StyleSheet.absoluteFillObject },
    heroBorder: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        borderRadius: 30,
    },

    heroDots: {
        position: "absolute",
        right: 14,
        bottom: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.10)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
    },
    heroDot: {
        width: 7,
        height: 7,
        borderRadius: 99,
        backgroundColor: "rgba(255,255,255,0.26)",
    },
    heroDotActive: { width: 18, backgroundColor: "rgba(255,255,255,0.84)" },

    heroOverlay: {
        position: "absolute",
        left: 18,
        right: 18,
        bottom: 18,
    },
    kickerPill: {
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.12)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        marginBottom: 10,
    },
    kicker: {
        fontFamily: FONT_UI,
        color: "rgba(255,255,255,0.92)",
        fontSize: 12,
        letterSpacing: 0.6,
    },
    title: {
        fontFamily: FONT_DISPLAY,
        color: "#FFF7EF",
        fontSize: 36,
        lineHeight: 41,
        maxWidth: 350,
        letterSpacing: -0.2,
        textShadowColor: "rgba(0,0,0,0.45)",
        textShadowOffset: { width: 0, height: 4 },
        textShadowRadius: 12,
    },
    subtitle: {
        fontFamily: FONT_BODY,
        marginTop: 10,
        color: "rgba(255,247,239,0.92)",
        fontSize: 15,
        lineHeight: 22,
        maxWidth: 340,
        textShadowColor: "rgba(0,0,0,0.28)",
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 10,
    },

    bulletsPanel: {
        marginTop: 14,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: "rgba(255,255,255,0.62)",
        borderWidth: 1,
        borderColor: "rgba(58,31,11,0.10)",
        gap: 10,
    },
    bulletRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    bulletDot: {
        width: 10,
        height: 10,
        borderRadius: 999,
        backgroundColor: "#C63A24",
    },
    bulletText: { fontFamily: FONT_BODY, flex: 1, fontSize: 15, lineHeight: 20, color: "#4A2B15" },

    footer: { paddingTop: 12 },

    dotsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 4,
        marginBottom: 10,
    },
    stepText: { fontFamily: FONT_BODY, color: "#6B3A1D", fontSize: 12 },
    dots: { flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "rgba(107,58,29,0.22)" },
    dotActive: { width: 22, backgroundColor: "rgba(198,58,36,0.88)" },

    navRow: { flexDirection: "row", gap: 12 },

    btnBase: {
        flex: 1,
        height: 52,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    btnPressed: { transform: [{ scale: 0.985 }], opacity: 0.98 },

    btnPrimary: {
        shadowColor: "#B02A1D",
        shadowOpacity: 0.28,
        shadowOffset: { width: 0, height: 12 },
        shadowRadius: 18,
        elevation: 8,
    },
    btnPrimaryText: { fontFamily: FONT_UI, color: "#FFF7EF", fontSize: 16 },

    btnSecondary: {
        backgroundColor: "rgba(255,255,255,0.86)",
        borderWidth: 1.5,
        borderColor: "rgba(176,42,29,0.55)",
    },
    btnSecondaryText: { fontFamily: FONT_UI, color: "#B02A1D", fontSize: 15 },

    btnGhost: {
        backgroundColor: "rgba(255,255,255,0.70)",
        borderWidth: 1,
        borderColor: "rgba(58,31,11,0.10)",
    },
    btnDisabled: { opacity: 0.55 },
    btnGhostText: { fontFamily: FONT_UI, color: "#6B3A1D", fontSize: 15 },
    btnGhostTextDisabled: { color: "#8B5A3D" },

    ctaGroup: { gap: 12 },

    caption: {
        fontFamily: FONT_BODY,
        marginTop: 2,
        textAlign: "center",
        color: "#704424",
        fontSize: 12,
        opacity: 0.95,
    },
});
