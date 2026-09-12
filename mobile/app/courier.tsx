import { Redirect } from "expo-router";

// Each restaurant currently operates its own courier. Handoff and delivery
// completion live in the restaurant panel, so no separate courier session or
// claim flow is exposed.
export default function CourierDisabledRoute() {
    return <Redirect href="/restaurantpanel" />;
}
