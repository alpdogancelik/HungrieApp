import { useEffect, useMemo, useRef, useState, memo } from "react";
import {
    Animated,
    Dimensions,
    FlatList,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useFonts } from "expo-font";

import useAuthStore from "@/store/auth.store";

// --- Assets
import brandMark from "../assets/images/hungrie-mark.png";
const brandWordmark = require("../assets/images/hungrie-wordmark.png");

const allYourFoodOrders = require("../assets/images/allyourfoodorders.png");
const allYouNeedIsSauce = require("../assets/images/allyouneedissauce.png");

// İstersen kart arka planına kullanırsın (şimdilik opsiyonel)
const heroImage = require("../assets/images/flat-lay-burger-with-fries-ketchup.jpg");

const { width: W } = Dimensions.get("window");

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

const HeroCarousel = memo(function HeroCarousel({
    frames,
    height,
    onInteractStart,
    onInteractEnd,
}: {
    frames: HeroFrame[];
    height: number;
    onInteractStart: () => void;
    onInteractEnd: () => void;
}) {
    const innerRef = useRef<FlatList<HeroFrame>>(null);
    const [innerIndex, setInnerIndex] = useState(0);

    const handleEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const i = Math.round(e.nativeEvent.contentOffset.x / W);
        setInnerIndex(i);
        onInteractEnd();
    };

    return (
        <View style={[styles.heroCard, { height }]}>
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
                    <View style={{ width: W - 36, height }}>
                        <Image
                            source={item.image}
                            style={styles.heroImage}
                            contentFit={item.fit ?? "contain"}
                        />
                    </View>
                )}
            />

            {/* Soft shade + premium glow */}
            <LinearGradient
                colors={["rgba(0,0,0,0.26)", "rgba(0,0,0,0.10)", "rgba(0,0,0,0)"]}
                style={styles.heroShade}
            />

            {/* Mini dot indicator inside card */}
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

    // --- Font load
    const [fontsLoaded] = useFonts({
        "ChairoSans-Regular": require("../assets/fonts/ChairoSansRegular-Regular.ttf"),
    });

    const slides: Slide[] = useMemo(() => {
        const brandFrames: HeroFrame[] = [
            { key: "wordmark", image: brandWordmark, fit: "contain" },
            { key: "tagline-foodorders", image: allYourFoodOrders, fit: "contain" },
            { key: "tagline-sauce", image: allYouNeedIsSauce, fit: "contain" },
        ];

        return [
            {
                key: "discover",
                kicker: "hungrie.app",
                title: "Tek uygulama.\nTüm lezzetler.",
                subtitle: "Kampüsteki favori restoranların tek listede. Keşfet, seç, devam et.",
                bullets: ["Favori restoranları tek ekranda bul", "Menüler net, akış hızlı"],
                frames: brandFrames,
            },
            {
                key: "order",
                kicker: "Sipariş Akışı",
                title: "Sipariş ver.\nTakibini gör.",
                subtitle: "Sepet → notlar → onay → teslimat. Her adım kontrol sende.",
                bullets: ["Hızlı sepet ve akıllı notlar", "Restorana anında düşer"],
                frames: brandFrames,
            },
            {
                key: "ready",
                kicker: "Hadi başlayalım",
                title: "Tamamsın?",
                subtitle: "1 dakikada hesabını aç, ilk siparişini ver. Açsan da olur… acıkınca zaten açacaksın 😄",
                bullets: ["Kayıt süreci kısa, giriş güvenli", "Giriş yaptıysan otomatik devam", "Bugün kendine güzellik yap: yemek söyle"],
                frames: brandFrames,
            },
        ];
    }, []);

    const [index, setIndex] = useState(0);

    // dış FlatList refs
    const listRef = useRef<FlatList<Slide>>(null);
    const scrollX = useRef(new Animated.Value(0)).current;

    // kart içi swipe ile dış swipe çakışmasın
    const [outerScrollEnabled, setOuterScrollEnabled] = useState(true);

    useEffect(() => {
        if (isLoading) return;
        if (isAuthenticated) router.replace("/home");
    }, [isAuthenticated, isLoading, router]);

    const goTo = (i: number) => {
        const clamped = Math.max(0, Math.min(i, slides.length - 1));
        listRef.current?.scrollToOffset({ offset: clamped * W, animated: true });
        setIndex(clamped);
    };

    const handleSkip = () => goTo(slides.length - 1);
    const handleNext = () => goTo(index + 1);
    const handleBack = () => goTo(index - 1);

    const handleGetStarted = () => router.push("/sign-up");
    const handleLogin = () => router.push("/sign-in");

    // font gelmeden “flash of default font” olmasın
    if (!fontsLoaded) return null;

    return (
        <LinearGradient colors={["#FFF7EC", "#FFE7D1", "#FFD8B2"]} style={styles.bg}>
            <StatusBar style="dark" />
            <SafeAreaView style={[styles.safe, { paddingBottom: 12 + insets.bottom }]}>
                {/* Top Bar */}
                <View style={styles.topBar}>
                    <View style={styles.brandLeft}>
                        <View style={styles.brandMarkWrap}>
                            <Image source={brandMark} style={styles.brandMark} contentFit="contain" />
                        </View>

                        <View style={{ flex: 1 }}>
                            <Image source={brandWordmark} style={styles.wordmark} contentFit="contain" />
                            <Text style={styles.brandSub}>All your food orders in one app.</Text>
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
                    onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                        useNativeDriver: true,
                    })}
                    onMomentumScrollEnd={(e) => {
                        const i = Math.round(e.nativeEvent.contentOffset.x / W);
                        setIndex(i);
                    }}
                    renderItem={({ item, index: i }) => {
                        const inputRange = [(i - 1) * W, i * W, (i + 1) * W];

                        const cardScale = scrollX.interpolate({
                            inputRange,
                            outputRange: [0.985, 1, 0.985],
                            extrapolate: "clamp",
                        });

                        return (
                            <View style={[styles.slide, { width: W }]}>
                                <Animated.View style={{ transform: [{ scale: cardScale }] }}>
                                    {/* Card with internal carousel */}
                                    <HeroCarousel
                                        frames={item.frames}
                                        height={360}
                                        onInteractStart={() => setOuterScrollEnabled(false)}
                                        onInteractEnd={() => setOuterScrollEnabled(true)}
                                    />

                                    {/* Copy overlay on card */}
                                    <View style={styles.heroOverlay}>
                                        <Text style={styles.kicker}>{item.kicker}</Text>
                                        <Text style={styles.title}>{item.title}</Text>
                                        <Text style={styles.subtitle}>{item.subtitle}</Text>
                                    </View>
                                </Animated.View>

                                {/* Bullets */}
                                <View style={styles.bullets}>
                                    {item.bullets.map((b, bi) => (
                                        <View key={`${item.key}-b-${bi}`} style={styles.bulletRow}>
                                            <View style={styles.bulletDot} />
                                            <Text style={styles.bulletText}>{b}</Text>
                                        </View>
                                    ))}
                                </View>

                                {/* Bottom Controls */}
                                <View style={styles.bottom}>
                                    <View style={styles.dotsRow}>
                                        <Text style={styles.stepText}>
                                            {index + 1}/{slides.length}
                                        </Text>
                                        <View style={styles.dots}>
                                            {slides.map((_, di) => (
                                                <View key={`dot-${di}`} style={[styles.dot, di === index && styles.dotActive]} />
                                            ))}
                                        </View>
                                    </View>

                                    {index < slides.length - 1 ? (
                                        <View style={styles.navRow}>
                                            <Pressable
                                                onPress={handleBack}
                                                disabled={index === 0}
                                                style={[styles.ghostBtn, index === 0 && styles.ghostBtnDisabled]}
                                            >
                                                <Text style={[styles.ghostText, index === 0 && styles.ghostTextDisabled]}>
                                                    Geri
                                                </Text>
                                            </Pressable>

                                            <Pressable onPress={handleNext} style={styles.primaryBtn}>
                                                <Text style={styles.primaryText}>Devam</Text>
                                            </Pressable>
                                        </View>
                                    ) : (
                                        <View style={styles.ctaGroup}>
                                            <Pressable onPress={handleGetStarted} style={styles.primaryBtn}>
                                                <Text style={styles.primaryText}>Hemen başla</Text>
                                            </Pressable>
                                            <Pressable onPress={handleLogin} style={styles.secondaryBtn}>
                                                <Text style={styles.secondaryText}>Giriş yap</Text>
                                            </Pressable>
                                            <Text style={styles.caption}>Giriş yaptıysan seni otomatik olarak devam ettiriyoruz.</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        );
                    }}
                />
            </SafeAreaView>
        </LinearGradient>
    );
}

const FONT = "ChairoSans-Regular";

const styles = StyleSheet.create({
    bg: { flex: 1 },
    safe: { flex: 1 },

    topBar: {
        paddingHorizontal: 18,
        paddingTop: 6,
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
        backgroundColor: "rgba(44,10,0,0.92)",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 12,
        elevation: 6,
        overflow: "hidden",
    },
    brandMark: { width: 44, height: 44 },

    wordmark: { height: 18, width: 150, marginBottom: 2 },
    brandSub: {
        fontFamily: FONT,
        marginTop: 1,
        fontSize: 12,
        color: "#7A4A2A",
    },

    skipBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.65)",
        borderWidth: 1,
        borderColor: "rgba(58,31,11,0.10)",
    },
    skipText: { fontFamily: FONT, color: "#6B3A1D", fontSize: 12 },

    slide: { flex: 1, paddingHorizontal: 18 },

    heroCard: {
        borderRadius: 28,
        overflow: "hidden",
        backgroundColor: "#2C0A00",
        shadowColor: "#000",
        shadowOpacity: Platform.OS === "ios" ? 0.12 : 0.2,
        shadowOffset: { width: 0, height: 14 },
        shadowRadius: 22,
        elevation: 10,
    },
    heroImage: { width: "100%", height: "100%" },
    heroShade: { ...StyleSheet.absoluteFillObject },

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
        backgroundColor: "rgba(0,0,0,0.20)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
    },
    heroDot: {
        width: 7,
        height: 7,
        borderRadius: 99,
        backgroundColor: "rgba(255,255,255,0.30)",
    },
    heroDotActive: { width: 18, backgroundColor: "rgba(255,255,255,0.82)" },

    heroOverlay: {
        position: "absolute",
        left: 18,
        right: 18,
        bottom: 18,
    },
    kicker: {
        fontFamily: FONT,
        color: "rgba(255,255,255,0.88)",
        fontSize: 12,
        letterSpacing: 1.1,
        textTransform: "uppercase",
    },
    title: {
        fontFamily: FONT,
        marginTop: 8,
        color: "#FFF7EC",
        fontSize: 30,
        lineHeight: 34,
        maxWidth: 320,
    },
    subtitle: {
        fontFamily: FONT,
        marginTop: 8,
        color: "rgba(255,247,236,0.92)",
        fontSize: 14,
        lineHeight: 20,
        maxWidth: 320,
    },

    bullets: { marginTop: 16, gap: 10, paddingHorizontal: 2 },
    bulletRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    bulletDot: { width: 10, height: 10, borderRadius: 999, backgroundColor: "#D65A1F" },
    bulletText: { fontFamily: FONT, flex: 1, fontSize: 15, color: "#4A2B15" },

    bottom: { marginTop: 14, flex: 1, justifyContent: "flex-end", paddingBottom: 8 },

    dotsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 4,
        marginBottom: 10,
    },
    stepText: { fontFamily: FONT, color: "#6B3A1D", fontSize: 12 },
    dots: { flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "rgba(107,58,29,0.22)" },
    dotActive: { width: 22, backgroundColor: "rgba(183,49,29,0.85)" },

    navRow: { flexDirection: "row", gap: 12 },
    ghostBtn: {
        flex: 1,
        borderRadius: 16,
        paddingVertical: 14,
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.65)",
        borderWidth: 1,
        borderColor: "rgba(58,31,11,0.10)",
    },
    ghostBtnDisabled: { opacity: 0.55 },
    ghostText: { fontFamily: FONT, color: "#6B3A1D" },
    ghostTextDisabled: { color: "#8B5A3D" },

    primaryBtn: {
        flex: 1,
        backgroundColor: "#B7311D",
        paddingVertical: 15,
        borderRadius: 16,
        alignItems: "center",
        shadowColor: "#B7311D",
        shadowOpacity: 0.32,
        shadowOffset: { width: 0, height: 12 },
        shadowRadius: 18,
        elevation: 8,
    },
    primaryText: { fontFamily: FONT, color: "#FFF7EC", fontSize: 16 },

    ctaGroup: { gap: 12, paddingTop: 4 },
    secondaryBtn: {
        borderColor: "#B7311D",
        borderWidth: 1.5,
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.78)",
    },
    secondaryText: { fontFamily: FONT, color: "#B7311D", fontSize: 15 },

    caption: {
        fontFamily: FONT,
        marginTop: 4,
        textAlign: "center",
        color: "#704424",
        fontSize: 12,
    },
});
