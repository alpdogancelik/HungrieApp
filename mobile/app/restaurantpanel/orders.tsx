import { useRouter } from "expo-router";
import { PanelButton, PanelCard, PanelShell } from "@/src/features/restaurantPanel/ui";
import { useRestaurantPanelLocale } from "@/src/features/restaurantPanel/panelLocale";

const RestaurantOrders = () => {
    const router = useRouter();
    const { t } = useRestaurantPanelLocale(null);
    return (
        <PanelShell
            kicker={t("common.restaurantHub")}
            title={t("section.orders")}
            subtitle={t("section.ordersSubtitle")}
        >
            <PanelCard
                title={t("button.goDashboard")}
                subtitle={t("section.ordersSubtitle")}
            >
                <PanelButton
                    label={t("button.goDashboard")}
                    onPress={() => router.push("/restaurantpanel")}
                    accessibilityLabel={t("a11y.goDashboard")}
                />
            </PanelCard>
        </PanelShell>
    );
};

export default RestaurantOrders;
