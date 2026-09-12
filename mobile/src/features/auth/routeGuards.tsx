import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Redirect, Stack, usePathname } from "expo-router";
import { onIdTokenChanged } from "firebase/auth";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";

import { auth } from "@/lib/firebase";
import useAuthStore from "@/store/auth.store";
import { signOut } from "@/src/data/authRepository";
import { getCurrentMembership } from "@/src/data/membershipRepository";
import {
    checkCurrentAdminAuthorization,
    createAdminAuthorizationCoordinator,
    resolveAdminRouteAction,
    shouldMountAdminChildren,
    shouldRevalidateAdminOnForeground,
    type AdminAuthorizationResult,
} from "@/src/features/auth/adminAuthorization";
import { useTheme } from "@/src/theme/themeContext";

const LoadingGate = () => (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF7EF" }}>
        <ActivityIndicator color="#FE8C00" />
    </View>
);

const GuestScreenGate = ({
    isAuthenticated,
    isLoading,
    redirectTo,
    children,
}: {
    isAuthenticated: boolean;
    isLoading: boolean;
    redirectTo: string;
    children: ReactNode;
}) => {
    if (isLoading) return <LoadingGate />;
    if (isAuthenticated) return <Redirect href={redirectTo as any} />;
    return <>{children}</>;
};

export const GuestOnlyRoute = ({ children, redirectTo = "/home" }: { children?: ReactNode; redirectTo?: string }) => {
    const { isAuthenticated, isLoading } = useAuthStore();

    if (children) {
        return (
            <GuestScreenGate isAuthenticated={isAuthenticated} isLoading={isLoading} redirectTo={redirectTo}>
                {children}
            </GuestScreenGate>
        );
    }

    return (
        <Stack
            screenOptions={{ headerShown: false }}
            screenLayout={({ children: screenChildren }) => (
                <GuestScreenGate isAuthenticated={isAuthenticated} isLoading={isLoading} redirectTo={redirectTo}>
                    {screenChildren}
                </GuestScreenGate>
            )}
        />
    );
};

export const ProtectedRoute = ({
    children,
    redirectTo = "/sign-in",
}: {
    children: ReactNode;
    redirectTo?: string;
}) => {
    const { isAuthenticated, isLoading } = useAuthStore();

    if (isLoading) return <LoadingGate />;
    if (!isAuthenticated) return <Redirect href={redirectTo as any} />;

    return <>{children}</>;
};

export const RestaurantPanelRoute = () => {
    const pathname = usePathname();
    const { isAuthenticated, isLoading } = useAuthStore();
    const [checking, setChecking] = useState(true);
    const [hasMembership, setHasMembership] = useState(false);
    const isLoginRoute = pathname === "/restaurantpanel/login";

    useEffect(() => {
        let active = true;

        const checkMembership = async () => {
            if (isLoading) return;
            if (!isAuthenticated) {
                if (active) {
                    setHasMembership(false);
                    setChecking(false);
                }
                return;
            }

            setChecking(true);
            const membership = await getCurrentMembership().catch(() => null);
            if (active) {
                setHasMembership(Boolean(membership?.restaurantId));
                setChecking(false);
            }
        };

        void checkMembership();

        return () => {
            active = false;
        };
    }, [isAuthenticated, isLoading, pathname]);

    if (isLoading || checking) return <LoadingGate />;

    if (!isAuthenticated) {
        return isLoginRoute ? <Stack screenOptions={{ headerShown: false }} /> : <Redirect href="/restaurantpanel/login" />;
    }

    if (!hasMembership) {
        return isLoginRoute ? <Stack screenOptions={{ headerShown: false }} /> : <Redirect href="/restaurantpanel/login" />;
    }

    if (isLoginRoute) return <Redirect href="/restaurantpanel" />;

    return <Stack screenOptions={{ headerShown: false }} />;
};

const ADMIN_REVALIDATION_INTERVAL_MS = 60_000;

const AdminAuthorizationUnavailable = ({
    retry,
}: {
    retry: () => void;
}) => {
    const { theme } = useTheme();
    const resetAuthState = useAuthStore((state) => state.resetAuthState);
    const [signingOut, setSigningOut] = useState(false);
    const [signOutFailed, setSignOutFailed] = useState(false);

    const handleSignOut = async () => {
        setSigningOut(true);
        setSignOutFailed(false);
        try {
            await signOut();
            resetAuthState();
        } catch {
            setSignOutFailed(true);
        } finally {
            setSigningOut(false);
        }
    };

    return (
        <View style={[adminGateStyles.screen, { backgroundColor: theme.colors.background }]}>
            <Text style={[adminGateStyles.title, { color: theme.colors.ink }]}>Unable to verify admin access</Text>
            <Text style={[adminGateStyles.body, { color: theme.colors.textSecondary }]}>
                Check your connection and try again. Admin tools remain locked until verification succeeds.
            </Text>
            {signOutFailed && (
                <Text style={[adminGateStyles.error, { color: "#DC2626" }]}>Unable to sign out. Please try again.</Text>
            )}
            <View style={adminGateStyles.actions}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Retry admin access verification"
                    onPress={retry}
                    style={({ pressed }) => [
                        adminGateStyles.primaryButton,
                        { backgroundColor: theme.colors.primary, opacity: pressed ? 0.82 : 1 },
                    ]}
                >
                    <Text style={[adminGateStyles.primaryLabel, { color: theme.colors.onPrimary }]}>Try again</Text>
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sign out"
                    disabled={signingOut}
                    onPress={() => void handleSignOut()}
                    style={({ pressed }) => [
                        adminGateStyles.secondaryButton,
                        {
                            borderColor: theme.colors.border,
                            backgroundColor: theme.colors.surface,
                            opacity: signingOut || pressed ? 0.62 : 1,
                        },
                    ]}
                >
                    <Text style={[adminGateStyles.secondaryLabel, { color: theme.colors.ink }]}>
                        {signingOut ? "Signing out..." : "Sign out"}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
};

const AdminScreenGate = ({
    action,
    retry,
    children,
}: {
    action: ReturnType<typeof resolveAdminRouteAction>;
    retry: () => void;
    children: ReactNode;
}) => {
    if (action === "sign_in") return <Redirect href="/sign-in" />;
    if (action === "loading") return <LoadingGate />;
    if (action === "retry") return <AdminAuthorizationUnavailable retry={retry} />;
    if (action === "home") return <Redirect href="/home" />;
    return shouldMountAdminChildren(action) ? <>{children}</> : null;
};

export const AdminRoute = () => {
    const { isAuthenticated, isLoading } = useAuthStore();
    const [authorization, setAuthorization] = useState<{
        uid: string;
        result: AdminAuthorizationResult;
    } | null>(null);
    const coordinatorRef = useRef(createAdminAuthorizationCoordinator());
    const lastVerifiedTokenRef = useRef<string | null>(null);
    const verificationInFlightRef = useRef(0);
    const authenticatedRef = useRef(isAuthenticated);
    const appStateRef = useRef(AppState.currentState);
    authenticatedRef.current = isAuthenticated;

    const authUser = auth?.currentUser ?? null;
    const userKey = useMemo(() => authUser?.uid || "", [authUser?.uid]);

    const verify = useCallback(async (blocking: boolean) => {
        const requestedUid = auth?.currentUser?.uid || "";
        if (blocking) setAuthorization(null);
        verificationInFlightRef.current += 1;
        try {
            const outcome = await coordinatorRef.current.run(() =>
                checkCurrentAdminAuthorization(authenticatedRef.current),
            );
            if (!outcome.current || requestedUid !== (auth?.currentUser?.uid || "")) return;
            setAuthorization({ uid: requestedUid, result: outcome.result });
            lastVerifiedTokenRef.current = await auth?.currentUser?.getIdToken(false).catch(() => null) ?? null;
            if (__DEV__ && outcome.result.status !== "allowed") {
                console.warn(`[admin-route] ${outcome.result.status}:${outcome.result.reason}`);
            }
        } finally {
            verificationInFlightRef.current = Math.max(0, verificationInFlightRef.current - 1);
        }
    }, []);

    useEffect(() => {
        coordinatorRef.current.invalidate();
        lastVerifiedTokenRef.current = null;
        setAuthorization(null);
        if (!isLoading) void verify(true);
        return () => {
            coordinatorRef.current.invalidate();
        };
    }, [isAuthenticated, isLoading, userKey, verify]);

    useEffect(() => {
        if (isLoading || !isAuthenticated || !auth) return;
        let active = true;
        let firstNotification = true;
        const unsubscribe = onIdTokenChanged(auth, (user) => {
            void (async () => {
                const token = user ? await user.getIdToken(false).catch(() => null) : null;
                if (!active) return;
                if (firstNotification) {
                    firstNotification = false;
                    if (!lastVerifiedTokenRef.current) lastVerifiedTokenRef.current = token;
                    return;
                }
                if (verificationInFlightRef.current > 0 || token === lastVerifiedTokenRef.current) return;
                lastVerifiedTokenRef.current = token;
                void verify(true);
            })();
        });
        return () => {
            active = false;
            unsubscribe();
        };
    }, [isAuthenticated, isLoading, verify]);

    useEffect(() => {
        if (isLoading || !isAuthenticated) return;
        const interval = setInterval(() => void verify(false), ADMIN_REVALIDATION_INTERVAL_MS);
        const appState = AppState.addEventListener("change", (state) => {
            const previousState = appStateRef.current;
            appStateRef.current = state;
            if (shouldRevalidateAdminOnForeground(previousState, state)) void verify(false);
        });
        return () => {
            clearInterval(interval);
            appState.remove();
        };
    }, [isAuthenticated, isLoading, verify]);

    const retry = useCallback(() => {
        coordinatorRef.current.invalidate();
        void verify(true);
    }, [verify]);

    const routeAction = resolveAdminRouteAction(
        isAuthenticated,
        !isLoading && authorization?.uid === userKey ? authorization.result : null,
    );

    return (
        <Stack
            screenOptions={{ headerShown: false }}
            screenLayout={({ children }) => (
                <AdminScreenGate action={routeAction} retry={retry}>
                    {children}
                </AdminScreenGate>
            )}
        />
    );
};

const adminGateStyles = StyleSheet.create({
    screen: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 28,
        gap: 12,
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 24,
        lineHeight: 30,
        textAlign: "center",
    },
    body: {
        maxWidth: 420,
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 22,
        textAlign: "center",
    },
    error: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 20,
        textAlign: "center",
    },
    actions: {
        width: "100%",
        maxWidth: 340,
        marginTop: 10,
        gap: 10,
    },
    primaryButton: {
        minHeight: 50,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        paddingHorizontal: 20,
    },
    secondaryButton: {
        minHeight: 50,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 20,
    },
    primaryLabel: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        lineHeight: 22,
    },
    secondaryLabel: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        lineHeight: 22,
    },
});
