export type AuthHydrationUser = {
    id?: string;
    $id?: string;
    accountId?: string;
    name: string;
    email: string;
    avatar?: string;
    whatsappNumber?: string;
    firebaseUid?: string;
};

type AuthIdentity = {
    uid: string;
    name: string;
    email: string;
    avatar?: string;
};

export type AuthSyncState = {
    user: AuthHydrationUser | null;
};

const mapUser = (source: AuthHydrationUser | AuthIdentity): AuthHydrationUser => {
    const accountId = "uid" in source ? source.uid : source.accountId || source.id || source.$id;
    return {
        id: accountId,
        $id: accountId,
        accountId,
        name: source.name,
        email: source.email,
        avatar: source.avatar,
        whatsappNumber: "whatsappNumber" in source ? source.whatsappNumber : undefined,
        firebaseUid: "uid" in source ? source.uid : source.firebaseUid,
    };
};

export const resolveAuthHydration = (
    profile: AuthHydrationUser | null,
    persistedIdentity: AuthIdentity | null,
) => {
    const source = profile || persistedIdentity;
    const user = source ? mapUser(source) : null;
    if (user && persistedIdentity) user.firebaseUid = persistedIdentity.uid;
    return user
        ? { isAuthenticated: true as const, user }
        : { isAuthenticated: false as const, user: null };
};

export const resolveAuthSyncHydration = (
    state: AuthSyncState,
    identity: AuthIdentity,
) => {
    const currentFirebaseUid = state.user?.firebaseUid
        || state.user?.accountId
        || state.user?.id
        || state.user?.$id;
    return {
        ...resolveAuthHydration(currentFirebaseUid === identity.uid ? state.user : null, identity),
        isLoading: false as const,
    };
};
