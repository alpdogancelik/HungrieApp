export type RepositoryBackend = "firebase" | "supabase";

export type Unsubscribe = () => void;

export type RepositoryDomain =
    | "auth"
    | "catalog"
    | "profile"
    | "membership"
    | "restaurant"
    | "menu"
    | "order"
    | "review"
    | "address"
    | "favorites"
    | "notification";

export type RepositoryRuntimeFlags = {
    supabaseEnabled?: boolean;
    domains?: Partial<Record<RepositoryDomain, RepositoryBackend | boolean | string | undefined>>;
};

export type RepositorySelection = {
    domain: RepositoryDomain;
    backend: RepositoryBackend;
    supabaseEnabled: boolean;
};
