import { Redirect } from "expo-router";
import useAuthStore from "@/store/auth.store";
import { isAuthRequired } from "@/lib/runtimeEnv";

const authGuardEnabled = isAuthRequired();

export default function RootRoute() {
    const { isAuthenticated } = useAuthStore();
    if (authGuardEnabled) {
        const target = isAuthenticated ? "/home" : "/sign-in";
        return <Redirect href={target} />;
    }
    return <Redirect href="/home" />;
}

