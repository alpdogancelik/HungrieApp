import { ProtectedRoute } from "@/src/features/auth/routeGuards";
import CartScreen from "@/src/features/cartCheckout/CartScreen";

export default function CartRoute() {
    return (
        <ProtectedRoute>
            <CartScreen />
        </ProtectedRoute>
    );
}
