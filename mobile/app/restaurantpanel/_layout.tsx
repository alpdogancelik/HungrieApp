import { Stack } from "expo-router";
import { PanelSessionProvider } from "@/src/features/restaurantPanel/panelSession";

export default function RestaurantPanelLayout() {
    return (
        <PanelSessionProvider>
            <Stack
                screenOptions={{
                    headerShown: false,
                }}
            />
        </PanelSessionProvider>
    );
}
