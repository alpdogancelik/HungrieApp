import { Redirect } from "expo-router";

// Welcome/onboarding is intentionally disabled.
// Keep this route as a safe redirect to avoid broken deep links or cached navigation state.
export default function Welcome() {
    return <Redirect href="/" />;
}

