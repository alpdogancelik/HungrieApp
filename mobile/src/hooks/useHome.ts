import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import useAuthStore from "@/store/auth.store";
import useAsyncResource from "@/lib/useAsyncResource";
import { getMenu } from "@/src/data/menuRepository";
import { getRestaurants, subscribeRestaurants } from "@/src/data/restaurantRepository";
import type { Category } from "@/type";
import { CATEGORIES } from "@/constants/mediaCatalog";
import type { IconName } from "@/components/Icon";

type QuickAction = {
    id: string;
    label: string;
    icon: IconName;
    target: string;
    description: string;
};

type UseHomeResult = {
    userName: string;
    menu: any[] | null;
    menuLoading: boolean;
    heroLoading: boolean;
    restaurants: any[] | null;
    restaurantsLoading: boolean;
    categories: Category[];
    categoriesLoading: boolean;
    quickActions: QuickAction[];
};

export const useHome = (): UseHomeResult => {
    const { user } = useAuthStore();
    const { t, i18n } = useTranslation();
    const featuredMenuParams = useMemo(() => ({ limit: 6 }), []);
    const { data: menu, loading: menuLoading } = useAsyncResource({
        fn: getMenu,
        params: featuredMenuParams,
        skipAlert: true,
    });
    const [restaurants, setRestaurants] = useState<any[] | null>(null);
    const [restaurantsLoading, setRestaurantsLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const unsubscribe = subscribeRestaurants(
            (nextRestaurants) => {
                if (!active) return;
                setRestaurants(nextRestaurants);
                setRestaurantsLoading(false);
            },
            (error) => {
                console.warn("[home] restaurants subscription failed", error);
                void getRestaurants()
                    .then((nextRestaurants) => {
                        if (!active) return;
                        setRestaurants(nextRestaurants);
                    })
                    .catch(() => undefined)
                    .finally(() => {
                        if (active) setRestaurantsLoading(false);
                    });
            },
        );

        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    const categories = useMemo(() => CATEGORIES as unknown as Category[], []);
    const quickActions = useMemo<QuickAction[]>(
        () => [
            {
                id: "orders",
                label: t("home.quickActions.orders.label"),
                description: t("home.quickActions.orders.description"),
                icon: "clock",
                target: "/orders",
            },
            {
                id: "favorites",
                label: t("home.quickActions.favorites.label"),
                description: t("home.quickActions.favorites.description"),
                icon: "star",
                target: "/search?query=popular",
            },
            {
                id: "addresses",
                label: t("home.quickActions.addresses.label"),
                description: t("home.quickActions.addresses.description"),
                icon: "location",
                target: "/profile",
            },
            {
                id: "coupons",
                label: t("home.quickActions.coupons.label"),
                description: t("home.quickActions.coupons.description"),
                icon: "dollar",
                target: "/search?query=promo",
            },
        ],
        [t, i18n.language],
    );

    return {
        userName: user?.name || "Hungrie User",
        menu,
        menuLoading,
        heroLoading: menuLoading,
        restaurants,
        restaurantsLoading,
        categories,
        categoriesLoading: menuLoading,
        quickActions,
    };
};

export default useHome;
