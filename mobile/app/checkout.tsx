import { ProtectedRoute } from "@/src/features/auth/routeGuards";
import CheckoutScreen from "@/src/features/cartCheckout/CheckoutScreen";

export default function CheckoutRoute() {
    return (
        <ProtectedRoute>
            <CheckoutScreen />
        </ProtectedRoute>
    );
}
