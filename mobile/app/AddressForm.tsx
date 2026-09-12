import { AddressFormScreen } from "@/src/features/address/addressFeature";
import { ProtectedRoute } from "@/src/features/auth/routeGuards";

export default function AddressFormRoute() {
    return (
        <ProtectedRoute>
            <AddressFormScreen />
        </ProtectedRoute>
    );
}
