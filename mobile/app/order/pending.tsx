import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import OrderPendingScreen from "@/src/screens/OrderPendingScreen";
import { ProtectedRoute } from "@/src/features/auth/routeGuards";

const PendingRoute = () => {
    const router = useRouter();
    const params = useLocalSearchParams<{ orderId?: string; restaurantName?: string; eta?: string }>();

    if (!params.orderId) {
        return <Redirect href="/(tabs)/cart" />;
    }

    const etaSeconds = params.eta ? Number(params.eta) : undefined;

    return (
        <ProtectedRoute>
            <OrderPendingScreen
                orderId={params.orderId}
                restaurantName={params.restaurantName || "Restoran"}
                etaSeconds={Number.isFinite(etaSeconds || NaN) ? etaSeconds : undefined}
                onBack={() => router.replace("/(tabs)/profile")}
                onConfirmed={(orderId) => router.replace({ pathname: "/orders/[id]", params: { id: orderId } })}
                onRejected={(orderId) => router.replace({ pathname: "/orders/[id]", params: { id: orderId } })}
            />
        </ProtectedRoute>
    );
};

export default PendingRoute;
