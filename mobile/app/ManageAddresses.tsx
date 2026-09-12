import { ManageAddressesScreen } from "@/src/features/address/addressFeature";
import { ProtectedRoute } from "@/src/features/auth/routeGuards";

export default function ManageAddressesRoute() {
    return (
        <ProtectedRoute>
            <ManageAddressesScreen />
        </ProtectedRoute>
    );
}
