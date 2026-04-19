import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import Icon from "@/components/Icon";
import { makeShadow } from "@/src/lib/shadowStyle";
import { useMenuItemImage } from "@/src/features/restaurantMenu/hooks/useMenuItemImage";

type RestaurantMenuItem = {
    id: string;
    name: string;
    description?: string;
    price: number;
    categories?: string[] | string;
    image_url?: string;
    imageUrl?: string;
};

type MenuItemCardProps = {
    item: RestaurantMenuItem;
    cuisine?: string;
    activeCategory?: string;
    isTurkish: boolean;
    addToCartLabel: string;
    priceLabel: string;
    ratingAverage: number;
    ratingCount: number;
    latestReviewComment?: string;
    onAddToCart: (item: RestaurantMenuItem, imageUrl?: string) => void;
};

const cardShadow = makeShadow({
    color: "#8F6543",
    offsetY: 10,
    blurRadius: 24,
    opacity: Platform.OS === "ios" ? 0.09 : 0.13,
    elevation: 5,
});

const resolvePrimaryCategory = (item: RestaurantMenuItem, activeCategory?: string) => {
    if (activeCategory) return activeCategory;
    if (Array.isArray(item.categories)) return item.categories[0];
    if (typeof item.categories === "string") return item.categories;
    return undefined;
};

const MenuItemCard = ({
    item,
    cuisine,
    activeCategory,
    isTurkish,
    addToCartLabel,
    priceLabel,
    ratingAverage,
    ratingCount,
    latestReviewComment,
    onAddToCart,
}: MenuItemCardProps) => {
    const useNativeDriver = Platform.OS !== "web";
    const categoryForImage = useMemo(() => resolvePrimaryCategory(item, activeCategory), [activeCategory, item.categories]);

    const imageResolution = useMenuItemImage({
        name: item.name,
        category: categoryForImage,
        cuisine,
        explicitImageUrl: item.image_url || item.imageUrl,
    });

    const candidateUrls = useMemo(() => imageResolution.candidates.map((candidate) => candidate.url), [imageResolution.candidates]);
    const [candidateIndex, setCandidateIndex] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const skeletonOpacity = useRef(new Animated.Value(0.42)).current;
    const imageOpacity = useRef(new Animated.Value(0)).current;

    const activeImageUrl = candidateUrls[candidateIndex];

    useEffect(() => {
        setCandidateIndex(0);
        setLoaded(false);
        imageOpacity.setValue(0);
    }, [candidateUrls, imageOpacity]);

    useEffect(() => {
        if (!activeImageUrl || loaded) return;
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(skeletonOpacity, {
                    toValue: 0.7,
                    duration: 560,
                    useNativeDriver,
                }),
                Animated.timing(skeletonOpacity, {
                    toValue: 0.36,
                    duration: 560,
                    useNativeDriver,
                }),
            ]),
        );
        pulse.start();
        return () => {
            pulse.stop();
        };
    }, [activeImageUrl, loaded, skeletonOpacity, useNativeDriver]);

    const handleImageLoaded = () => {
        setLoaded(true);
        Animated.timing(imageOpacity, {
            toValue: 1,
            duration: 220,
            useNativeDriver,
        }).start();
    };

    const handleImageError = () => {
        setLoaded(false);
        imageOpacity.setValue(0);
        setCandidateIndex((current) => {
            const next = current + 1;
            return next < candidateUrls.length ? next : candidateUrls.length;
        });
    };

    const handleAddToCart = () => {
        onAddToCart(item, activeImageUrl || imageResolution.bestImageUrl || undefined);
    };

    return (
        <View style={styles.menuCard}>
            <View style={styles.menuMain}>
                <View style={styles.titleBlock}>
                    <Text style={styles.menuTitle} numberOfLines={2}>
                        {item.name}
                    </Text>

                    {item.description ? (
                        <Text style={styles.menuDescription} numberOfLines={2}>
                            {item.description}
                        </Text>
                    ) : null}

                    {ratingCount > 0 ? (
                        <View style={styles.menuRatingRow}>
                            <Icon name="star" size={14} color="#E0A53E" />
                            <Text style={styles.menuRatingText}>{ratingAverage.toFixed(1)}</Text>
                            <Text style={styles.menuRatingCount}>({ratingCount})</Text>
                        </View>
                    ) : null}

                    {latestReviewComment ? (
                        <View style={styles.menuReviewSnippet}>
                            <Text style={styles.menuReviewSnippetLabel}>
                                {isTurkish ? "Son yorum" : "Latest review"}
                            </Text>
                            <Text style={styles.menuReviewSnippetText} numberOfLines={2}>
                                {latestReviewComment}
                            </Text>
                        </View>
                    ) : null}
                </View>

                <View style={styles.menuFooter}>
                    <Text style={styles.menuPrice}>{priceLabel}</Text>

                    <Pressable onPress={handleAddToCart} style={styles.menuCta}>
                        <Text style={styles.menuCtaText}>{addToCartLabel}</Text>
                    </Pressable>
                </View>
            </View>

            <Pressable onPress={handleAddToCart} style={styles.thumbShell}>
                <View style={styles.thumbInner}>
                    <LinearGradient
                        colors={["#FFECD4", "#FFD7A6"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.thumbPlaceholder}
                    >
                        <View style={styles.placeholderIconBubble}>
                            <Icon name="bag" size={15} color="#BA7C2D" />
                        </View>
                    </LinearGradient>

                    {activeImageUrl ? (
                        <>
                            {!loaded || imageResolution.isResolvingRemote ? (
                                <Animated.View style={[styles.thumbSkeleton, { opacity: skeletonOpacity }]} />
                            ) : null}
                            <Animated.View style={[styles.thumbImageLayer, { opacity: imageOpacity }]}>
                                <Image
                                    source={{ uri: activeImageUrl }}
                                    style={styles.thumbImage}
                                    cachePolicy="memory-disk"
                                    contentFit="cover"
                                    transition={220}
                                    onLoad={handleImageLoaded}
                                    onError={handleImageError}
                                />
                            </Animated.View>
                        </>
                    ) : imageResolution.isResolvingRemote ? (
                        <Animated.View style={[styles.thumbSkeleton, { opacity: skeletonOpacity }]} />
                    ) : null}
                </View>
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    menuCard: {
        flexDirection: "row",
        borderRadius: 26,
        paddingVertical: 15,
        paddingHorizontal: 16,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "rgba(37,27,23,0.06)",
        gap: 13,
        ...cardShadow,
    },
    menuMain: {
        flex: 1,
        minWidth: 0,
        justifyContent: "space-between",
    },
    titleBlock: {
        gap: 5,
    },
    menuTitle: {
        fontFamily: "ChairoSans",
        fontSize: 20,
        lineHeight: 24,
        color: "#251B17",
    },
    menuDescription: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        lineHeight: 18,
        color: "#85776B",
    },
    menuRatingRow: {
        marginTop: 2,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    menuRatingText: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: "#251B17",
    },
    menuRatingCount: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#AB9D90",
    },
    menuReviewSnippet: {
        marginTop: 4,
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: "rgba(242,140,40,0.08)",
    },
    menuReviewSnippetLabel: {
        fontFamily: "ChairoSans",
        fontSize: 11,
        color: "#E46F10",
    },
    menuReviewSnippetText: {
        marginTop: 3,
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 16,
        color: "#7E7167",
    },
    menuFooter: {
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    menuPrice: {
        flexShrink: 1,
        fontFamily: "ChairoSans",
        fontSize: 22,
        color: "#E46F10",
    },
    menuCta: {
        borderRadius: 999,
        paddingHorizontal: 16,
        paddingVertical: 10,
        minWidth: 110,
        alignItems: "center",
        backgroundColor: "#F28C28",
    },
    menuCtaText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#FFFFFF",
    },
    thumbShell: {
        width: 90,
        alignItems: "center",
        justifyContent: "center",
    },
    thumbInner: {
        width: 88,
        height: 88,
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: "#FAEFE3",
    },
    thumbPlaceholder: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    placeholderIconBubble: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.52)",
    },
    thumbSkeleton: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "#F6E5D1",
    },
    thumbImageLayer: {
        ...StyleSheet.absoluteFillObject,
    },
    thumbImage: {
        width: "100%",
        height: "100%",
    },
});

export default memo(MenuItemCard);
