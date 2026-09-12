import { useLocalSearchParams } from "expo-router";

import { ProtectedRoute } from "@/src/features/auth/routeGuards";
import OrderDetailsScreen from "@/src/features/orders/OrderDetailsScreen";

const OrderDetailsRoute = () => {
    const { id } = useLocalSearchParams<{ id?: string }>();
    return <ProtectedRoute><OrderDetailsScreen orderId={String(id || "")} /></ProtectedRoute>;
};

export default OrderDetailsRoute;
