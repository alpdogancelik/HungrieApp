import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import OrderPendingScreen from "@/src/screens/OrderPendingScreen";

const PendingRoute = () => {
    const router = useRouter();
    const params = useLocalSearchParams<{ orderId?: string; restaurantName?: string; eta?: string }>();

    if (!params.orderId) {
        return <Redirect href="/(tabs)/cart" />;
    }

    const etaSeconds = params.eta ? Number(params.eta) : undefined;

    return (
        <OrderPendingScreen
            orderId={params.orderId}
            restaurantName={params.restaurantName || "Restoran"}
            etaSeconds={Number.isFinite(etaSeconds || NaN) ? etaSeconds : undefined}
            //onConfirmed={() => router.replace({ pathname: "/order", params: { highlight: params.orderId } })}
            onRejected={() => router.replace("/(tabs)/cart")}
        />
    );
};

export default PendingRoute;
