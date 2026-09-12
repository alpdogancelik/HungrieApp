export type AuthHydrationUser = {
    id?: string;
    $id?: string;
    accountId?: string;
    name: string;
    email: string;
    avatar?: string;
    whatsappNumber?: string;
};

type AuthIdentity = {
    uid: string;
    name: string;
    email: string;
    avatar?: string;
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
    };
};

export const resolveAuthHydration = (
    profile: AuthHydrationUser | null,
    persistedIdentity: AuthIdentity | null,
) => {
    const source = profile || persistedIdentity;
    return source
        ? { isAuthenticated: true as const, user: mapUser(source) }
        : { isAuthenticated: false as const, user: null };
};
