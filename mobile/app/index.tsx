import { Redirect } from "expo-router";
import useAuthStore from "@/store/auth.store";
import { isAuthRequired } from "@/lib/runtimeEnv";

const authGuardEnabled = isAuthRequired();

export default function RootRoute() {
    const { isAuthenticated } = useAuthStore();
    if (authGuardEnabled && isAuthenticated) return <Redirect href="/home" />;
    if (authGuardEnabled && !isAuthenticated) return <Redirect href="/welcome" />;

    return <Redirect href={isAuthenticated ? "/home" : "/welcome"} />;
}

