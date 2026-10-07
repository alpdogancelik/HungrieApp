import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    updateProfile,
    reload,
    sendEmailVerification,
    type User as FirebaseUser,
} from "firebase/auth";
import {
    addDoc,
    deleteDoc,
    collection,
    deleteField,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    setDoc,
    updateDoc,
    where,
} from "firebase/firestore";
import {
    FIREBASE_COLLECTIONS,
    auth,
    firebaseConfigured,
    firestore,
    getRestaurantMenu as fetchRestaurantMenu,
    createMenuItem as createMenuItemCore,
} from "./firebase";
import { filterMenuForCustomer, filterRestaurantMenuForCustomer } from "./menuVisibility";
import { transitionOrder as transitionFirebaseOrder } from "@/src/services/firebaseOrders";
import i18n from "@/src/lib/i18n";
import { getAuthErrorMessage } from "@/src/features/auth/authCopy";
import { isStrongPassword } from "@/src/features/auth/passwordValidation";
import {
    createAccountAndRequestVerification,
    createEmailVerificationCoordinator,
    type VerificationFailureCategory,
} from "@/src/features/auth/emailVerificationFlow";
import { requestPasswordReset } from "@/src/features/auth/passwordResetFlow";
import { classifyPublicSignInFailure } from "@/src/features/auth/credentialPrivacy";
import { classifyPublicSignupFailure, signupFailureCopyKey } from "@/src/features/auth/signupPrivacy";

export { getOwnedRestaurantId } from "./restaurantOwnership";

export type Profile = { name: string; email: string; avatar?: string; accountId?: string; whatsappNumber?: string };
export const firebaseOrdersEnabled = firebaseConfigured && Boolean(firestore);
export const getMockOwnerAccount = async () => null;
export const clearMockOwnerAccount = async () => undefined;

const requireAuth = () => {
    if (!firebaseConfigured || !auth) throw new Error("Firebase authentication is not configured.");
    return auth;
};
const requireDB = () => {
    if (!firebaseConfigured || !firestore) throw new Error("Firebase Firestore is not configured.");
    return firestore;
};
const avatarUrl = (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "Hungrie User")}&background=FE8C00&color=ffffff`;
const parseWhatsappFromPhoto = (photoUrl?: string | null) =>
    photoUrl && photoUrl.startsWith("wa:") ? photoUrl.replace("wa:", "") : undefined;
const compactObject = <T extends Record<string, any>>(value: T) =>
    Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)) as Partial<T>;
const mapFirebaseUser = (user: FirebaseUser, overrides: Partial<Profile> = {}): Profile & { accountId: string } => {
    const name = overrides.name || user.displayName || user.email || "Hungrie User";
    const whatsappNumber = overrides.whatsappNumber ?? parseWhatsappFromPhoto(user.photoURL);
    return {
        name,
        email: user.email || overrides.email || "operator@hungrie.app",
        avatar: overrides.avatar || avatarUrl(name),
        accountId: user.uid,
        whatsappNumber,
    };
};
const parseErr = (e: any) => (typeof e === "string" ? e : e?.message || "Unexpected error occurred.");
const normalizeAuthErrorMessage = (error: any) => {
    const language = i18n.language;
    const code = String(error?.code || "").toLowerCase();
    const rawMessage = parseErr(error);
    const message = rawMessage.toLowerCase();

    if (classifyPublicSignInFailure(code) === "invalid_credentials") {
        return getAuthErrorMessage(language, "invalidCredentials") || rawMessage;
    }
    if (code === "auth/weak-password") {
        return getAuthErrorMessage(language, "weakPassword") || rawMessage;
    }
    if (code === "auth/invalid-email") {
        return getAuthErrorMessage(language, "invalidEmail") || rawMessage;
    }
    if (code === "auth/too-many-requests") {
        return getAuthErrorMessage(language, "tooManyRequests") || rawMessage;
    }
    if (code === "auth/requires-recent-login") {
        return "For security, please sign in again and then try deleting your profile.";
    }
    if (message.includes("verify your email")) {
        return getAuthErrorMessage(language, "verifyEmail") || rawMessage;
    }
    if (message.includes("user not found") || message.includes("no user record")) {
        return getAuthErrorMessage(language, "userNotFound") || rawMessage;
    }
    if (
        message.includes("wrong password") ||
        message.includes("invalid password") ||
        message.includes("password is invalid")
    ) {
        return getAuthErrorMessage(language, "invalidPassword") || rawMessage;
    }
    if (
        message.includes("incorrect username or password") ||
        message.includes("incorrect email or password") ||
        message.includes("invalid login credentials")
    ) {
        return getAuthErrorMessage(language, "invalidCredentials") || rawMessage;
    }
    return rawMessage;
};

const normalizeSignupErrorMessage = (error: unknown) => {
    const failure = classifyPublicSignupFailure(error);
    return getAuthErrorMessage(i18n.language, signupFailureCopyKey(failure))
        || getAuthErrorMessage(i18n.language, "signupUnavailable")
        || "We couldn't complete registration with these details.";
};

const waitForAuthUser = async (): Promise<FirebaseUser | null> => {
    const firebaseAuth = auth;
    if (!firebaseAuth) return null;
    if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
    await (firebaseAuth as any).authStateReady?.().catch(() => null);
    if (firebaseAuth.currentUser) return firebaseAuth.currentUser;

    return new Promise((resolve) => {
        let resolved = false;
        const done = (u: FirebaseUser | null) => {
            if (resolved) return;
            resolved = true;
            resolve(u);
        };
        const unsub = onAuthStateChanged(
            firebaseAuth,
            (u) => {
                unsub();
                done(u);
            },
            () => {
                unsub();
                done(null);
            },
        );
        setTimeout(() => {
            unsub();
            done(firebaseAuth.currentUser ?? null);
        }, 8000);
    });
};

const emailVerificationCoordinator = createEmailVerificationCoordinator({
    send: (user) => sendEmailVerification(user as FirebaseUser),
    reload: (user) => reload(user as FirebaseUser),
    forceTokenRefresh: (user) => (user as FirebaseUser).getIdToken(true),
});

const logVerificationFailure = (operation: "initial_request" | "resend" | "refresh", category: VerificationFailureCategory) => {
    console.warn("[auth] Email verification operation failed", { operation, category });
};

export const getVerificationErrorMessage = (category: VerificationFailureCategory) => {
    if (category === "too_many_requests") {
        return getAuthErrorMessage(i18n.language, "tooManyRequests") || "Too many attempts. Please try again later.";
    }
    if (category === "network") {
        return getAuthErrorMessage(i18n.language, "verificationNetwork") || "Check your connection and try again.";
    }
    if (category === "invalid_session") {
        return getAuthErrorMessage(i18n.language, "verificationSession") || "Sign in again to continue verification.";
    }
    return getAuthErrorMessage(i18n.language, "verificationRequestFailed") || "We couldn't request a verification email. Please try again.";
};

const ensureVerified = async (user: FirebaseUser | null) => {
    if (!user) return null;
    const result = await emailVerificationCoordinator.refresh(user);
    if (result.state === "verified") return user;
    if (result.state === "failed") throw new Error(getVerificationErrorMessage(result.category));
    return null;
};

const syncProfile = async (user: FirebaseUser, overrides: Partial<Profile> = {}) => {
    const db = requireDB();
    const name = overrides.name || user.displayName || user.email || "Hungrie User";
    const base: Profile & { accountId: string } = {
        name,
        email: user.email || overrides.email || "operator@hungrie.app",
        avatar: overrides.avatar || avatarUrl(name),
        accountId: user.uid,
        whatsappNumber: overrides.whatsappNumber ?? parseWhatsappFromPhoto(user.photoURL),
    };
    const ref = doc(db, FIREBASE_COLLECTIONS.users, user.uid);
    const snap = await getDoc(ref).catch(() => null);
    const now = Date.now();
    if (!snap || !snap.exists()) {
        await setDoc(ref, compactObject({ ...base, ...overrides, createdAt: now, updatedAt: now }), { merge: true });
        return base;
    }
    const stored = snap.data() as Profile & { accountId?: string };
    // Always use Firebase auth uid as the canonical account id.
    const merged = { ...base, ...stored, accountId: user.uid };
    const needsUpdate =
        stored.name !== merged.name ||
        stored.email !== merged.email ||
        stored.avatar !== merged.avatar ||
        stored.whatsappNumber !== merged.whatsappNumber ||
        stored.accountId !== user.uid;
    if (needsUpdate) {
        await setDoc(
            ref,
            compactObject({
                name: merged.name,
                email: merged.email,
                avatar: merged.avatar,
                whatsappNumber: merged.whatsappNumber,
                accountId: merged.accountId,
                updatedAt: now,
            }),
            { merge: true },
        ).catch(() => null);
    }
    return merged;
};

// Auth
export const signIn = async ({ email, password }: { email: string; password: string }) => {
    try {
        const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
        const verifiedUser = await ensureVerified(credential.user);
        if (verifiedUser) return mapFirebaseUser(verifiedUser);
        return {
            verificationRequired: true as const,
            email: credential.user.email || email,
        };
    } catch (e: any) {
        throw new Error(normalizeAuthErrorMessage(e));
    }
};

export const createUser = async ({
    email,
    password,
    name,
    whatsappNumber,
}: {
    email: string;
    password: string;
    name: string;
    whatsappNumber?: string;
}) => {
    if (!isStrongPassword(password)) {
        throw new Error(getAuthErrorMessage(i18n.language, "weakPassword") || "Password does not meet requirements.");
    }

    try {
        const result = await createAccountAndRequestVerification({
            createAccount: async () => (await createUserWithEmailAndPassword(requireAuth(), email, password)).user,
            prepareAccount: async (user) => {
                await updateProfile(user, {
                    displayName: name,
                    photoURL: whatsappNumber ? `wa:${whatsappNumber}` : user.photoURL ?? undefined,
                }).catch(() => null);
            },
            requestVerification: (user) => emailVerificationCoordinator.request(user),
        });
        if (result.verificationRequest.state === "failed") {
            logVerificationFailure("initial_request", result.verificationRequest.category);
        }
        return result;
    } catch (e: any) {
        throw new Error(normalizeSignupErrorMessage(e));
    }
};

export const getCurrentUser = async () => {
    const current = await waitForAuthUser();
    if (!current) return null;
    const verified = await ensureVerified(current).catch(() => null);
    return verified ? mapFirebaseUser(verified) : null;
};

export const getCurrentVerificationSession = async () => {
    const user = await waitForAuthUser();
    if (!user) return null;
    return { uid: user.uid, email: user.email || "", emailVerified: user.emailVerified };
};

export const resendEmailVerification = async () => {
    const user = await waitForAuthUser();
    if (!user) return { state: "failed" as const, category: "invalid_session" as const };
    const result = await emailVerificationCoordinator.request(user);
    if (result.state === "failed") logVerificationFailure("resend", result.category);
    return result;
};

export const refreshEmailVerification = async () => {
    const result = await emailVerificationCoordinator.refresh(await waitForAuthUser());
    if (result.state === "failed") logVerificationFailure("refresh", result.category);
    return result;
};

export const signOutVerificationSession = async () => firebaseSignOut(requireAuth());

export const signOut = async () => {
    return firebaseSignOut(requireAuth());
};

export const sendPasswordReset = async (email: string) => {
    return requestPasswordReset({
        email,
        send: (normalizedEmail) => sendPasswordResetEmail(requireAuth(), normalizedEmail),
    });
};

export const updateUserProfile = async ({
    name,
    whatsappNumber,
}: {
    name?: string;
    whatsappNumber?: string;
}) => {
    const authUser = await waitForAuthUser();
    if (!authUser) throw new Error("User is not signed in.");
    const db = requireDB();
    const normalizedName = typeof name === "string" ? name.trim() : undefined;
    const normalizedWhatsapp = typeof whatsappNumber === "string" ? whatsappNumber.trim() : whatsappNumber;
    const updates: Partial<Profile> = {};
    if (normalizedName) updates.name = normalizedName;
    if (normalizedWhatsapp !== undefined) updates.whatsappNumber = normalizedWhatsapp || undefined;

    await updateProfile(authUser, {
        displayName: normalizedName ?? authUser.displayName ?? undefined,
        photoURL: normalizedWhatsapp ? `wa:${normalizedWhatsapp}` : null,
    });

    await setDoc(
        doc(db, FIREBASE_COLLECTIONS.users, authUser.uid),
        {
            ...(normalizedName ? { name: normalizedName } : {}),
            ...(normalizedWhatsapp !== undefined
                ? normalizedWhatsapp
                    ? { whatsappNumber: normalizedWhatsapp }
                    : { whatsappNumber: deleteField() }
                : {}),
            updatedAt: Date.now(),
        },
        { merge: true },
    );

    return syncProfile(authUser, updates);
};

// ---- Stubbed data helpers to avoid Firestore access ----
export const getMenu = async ({ category, query, limit }: { category?: string; query?: string; limit?: number }) => {
    const applyFilters = (raw: any[]) => {
        let list = raw.map((item) => ({ ...item, price: Number(item.price ?? 0) }));
        if (category) {
            const term = category.toLowerCase();
            list = list.filter((item: any) => (item.category || item.categories || "").toString().toLowerCase().includes(term));
        }
        if (query) {
            const term = query.toLowerCase();
            list = list.filter(
                (item: any) => item.name?.toLowerCase().includes(term) || item.description?.toLowerCase().includes(term),
            );
        }
        if (limit) list = list.slice(0, limit);
        return filterMenuForCustomer(list);
    };
    if (!firebaseConfigured || !firestore) return [];

    const snap = await getDocs(collection(requireDB(), FIREBASE_COLLECTIONS.menus));
    //console.log("Menus",snap.docs);
    if (snap.empty) return [];
    return applyFilters(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
};

export const getCategories = async () => {
    if (!firebaseConfigured || !firestore) return [];
    const snap = await getDocs(collection(requireDB(), FIREBASE_COLLECTIONS.categories));
    
    if (snap.empty) return [];
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Stubbed order creation for API compatibility
export const createOrderDocument = async (orderData: Record<string, any>, orderItems: Record<string, any>[]) => {
    return {
        id: orderData?.id || `order-${Date.now()}`,
        ...orderData,
        orderItems,
        status: orderData?.status || "pending",
        createdAt: orderData?.createdAt || Date.now(),
    };
};

// Restaurants & menus
const ownerId = () => auth?.currentUser?.uid ?? null;

/*export const getOwnerRestaurants = async () => {
    const owner = ownerId();
    if (!owner) return [];
    const q = query(collection(requireDB(), FIREBASE_COLLECTIONS.restaurants), where("ownerId", "==", owner));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};*/

/*export const createRestaurant = async (payload: {
    name: string;
    cuisine: string;
    description?: string;
    deliveryFee?: string;
    deliveryTime?: string;
    imageUrl?: string;
}) => {
    const owner = ownerId();
    if (!owner) throw new Error("An owner must be signed in to create restaurants.");
    const data = { ...payload, ownerId: owner, createdAt: Date.now(), updatedAt: Date.now() };
    const ref = await addDoc(collection(requireDB(), FIREBASE_COLLECTIONS.restaurants), data);
    return { id: ref.id, ...data };
};*/

export const getRestaurantMenu = async ({ restaurantId }: { restaurantId: string }) => {
    if (!firebaseConfigured || !firestore) return [];
    try {
        const result = await fetchRestaurantMenu(restaurantId);
        if (!result || !Array.isArray(result) || !result.length) return [];
        return filterRestaurantMenuForCustomer(restaurantId, result);
    } catch (error) {
        //const fallback = sampleMenu[restaurantId] || Object.values(sampleMenu).flat();
        return [];
    }
};

/*export const createMenuItem = async (
    restaurantId: string,
    payload: { name: string; price: string | number; description?: string; imageUrl?: string },
) => {
    return createMenuItemCore(restaurantId, payload);
};*/

// Orders
export const listenToOrders = (
    filter: { restaurantId?: string; statuses?: string[] },
    onChange: (orders: any[]) => void,
    onError?: (error: Error) => void,
) => {
    if (!firebaseOrdersEnabled) {
        onChange([]);
        return () => {};
    }

    const constraints: any[] = [];
    if (filter.restaurantId) {
        constraints.push(where("restaurantId", "==", String(filter.restaurantId)));
    }
    if (filter.statuses?.length) {
        constraints.push(where("status", "in", filter.statuses));
    }
    const q = constraints.length
        ? query(collection(requireDB(), FIREBASE_COLLECTIONS.orders), ...constraints)
        : query(collection(requireDB(), FIREBASE_COLLECTIONS.orders));

    return onSnapshot(
        q,
        (snap) => {
            const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            onChange(items);
        },
        (err) => {
            onError?.(err as any);
        },
    );
};

export const assignCourier = async (orderId: string, courierLabel: string, currentStatus?: string) => {
    if (!orderId) throw new Error("orderId is required.");
    if (!firebaseOrdersEnabled) return { id: orderId, courierLabel, status: currentStatus || "pending" };
    const ref = doc(requireDB(), FIREBASE_COLLECTIONS.orders, orderId);
    await updateDoc(ref, { courierLabel, updatedAt: Date.now() });
    return { id: orderId, courierLabel, status: currentStatus };
};

export const updateOrderStatus = async (orderId: string, status: string) => {
    if (!orderId) throw new Error("orderId is required.");
    if (!status) throw new Error("status is required.");
    if (!firebaseOrdersEnabled) return { id: orderId, status };
    await transitionFirebaseOrder(orderId, status);
    return { id: orderId, status };
};
