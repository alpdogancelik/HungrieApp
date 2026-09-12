import { AppState } from "react-native";
import * as Network from "expo-network";
import { onIdTokenChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { getFirebaseAccessToken } from "@/lib/supabase";
import { requireSupabase, withSupabaseAuthRetry } from "./utils";
import { measureDevelopment } from "@/src/lib/performanceMetrics";

export type OrderRealtimeTopic = {
    topic: string;
    topic_kind: "profile" | "restaurant" | "courier_queue" | "courier" | "admin";
    resource_id: string;
};

export type OrderRealtimeInvalidation = {
    order_id: string;
    operation: "insert" | "update" | "delete";
    version: string;
};

type Subscriber<T = any> = {
    id: number;
    generation: number;
    fetcher: () => Promise<T>;
    onValue: (value: T) => void;
    onError?: (error: unknown) => void;
    topics: Set<string>;
    debounce?: ReturnType<typeof setTimeout>;
    active: boolean;
};

type TopicEntry = {
    topic: string;
    subscribers: Set<number>;
    channel: any;
    reconnectAttempt: number;
    reconnectTimer?: ReturnType<typeof setTimeout>;
};

type SharedQueryEntry<T = any> = {
    fetcher: () => Promise<T>;
    listeners: Map<number, { onValue: (value: T) => void; onError?: (error: unknown) => void }>;
    unsubscribe?: () => void;
    value?: T;
    hasValue: boolean;
};

export type OrderRealtimeCoordinatorDependencies = {
    client: () => any;
    accessToken: () => Promise<string | null>;
    authIdentity: () => string | null;
    watchAuth: (listener: () => void) => () => void;
    watchForeground: (listener: () => void) => () => void;
    watchNetwork: (listener: () => void) => () => void;
};

const RETRY_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000];

export class OrderRealtimeCoordinator {
    private subscribers = new Map<number, Subscriber<any>>();
    private topics = new Map<string, TopicEntry>();
    private nextSubscriberId = 1;
    private nextSharedListenerId = 1;
    private sharedQueries = new Map<string, SharedQueryEntry<any>>();
    private topicsPromise: Promise<OrderRealtimeTopic[]> | null = null;
    private currentIdentity: string | null = null;
    private lifecycleCleanups: (() => void)[] = [];
    private readonly dependencies: OrderRealtimeCoordinatorDependencies;

    constructor(dependencies: OrderRealtimeCoordinatorDependencies) {
        this.dependencies = dependencies;
    }

    subscribe<T>(fetcher: () => Promise<T>, onValue: (value: T) => void, onError?: (error: unknown) => void) {
        const subscriber: Subscriber<T> = {
            id: this.nextSubscriberId++, generation: 0, fetcher, onValue, onError, topics: new Set(), active: true,
        };
        this.subscribers.set(subscriber.id, subscriber as Subscriber);
        if (this.subscribers.size === 1) this.startLifecycle();
        void this.initializeSubscriber(subscriber);
        return () => this.removeSubscriber(subscriber.id);
    }

    subscribeShared<T>(queryKey: string, fetcher: () => Promise<T>, onValue: (value: T) => void, onError?: (error: unknown) => void) {
        const listenerId = this.nextSharedListenerId++;
        let entry = this.sharedQueries.get(queryKey) as SharedQueryEntry<T> | undefined;
        if (!entry) {
            entry = { fetcher, listeners: new Map(), hasValue: false };
            this.sharedQueries.set(queryKey, entry);
            entry.unsubscribe = this.subscribe(
                () => entry!.fetcher(),
                (value) => {
                    entry!.value = value;
                    entry!.hasValue = true;
                    for (const listener of entry!.listeners.values()) listener.onValue(value);
                },
                (error) => {
                    for (const listener of entry!.listeners.values()) listener.onError?.(error);
                },
            );
        } else {
            entry.fetcher = fetcher;
        }
        entry.listeners.set(listenerId, { onValue, onError });
        if (entry.hasValue) queueMicrotask(() => {
            const current = this.sharedQueries.get(queryKey) as SharedQueryEntry<T> | undefined;
            if (current?.listeners.has(listenerId) && current.hasValue) onValue(current.value as T);
        });
        return () => {
            const current = this.sharedQueries.get(queryKey);
            if (!current) return;
            current.listeners.delete(listenerId);
            if (!current.listeners.size) {
                current.unsubscribe?.();
                this.sharedQueries.delete(queryKey);
            }
        };
    }

    refreshAll() {
        for (const subscriber of this.subscribers.values()) this.invalidate(subscriber.id, true);
    }

    teardown() {
        for (const entry of this.sharedQueries.values()) entry.unsubscribe?.();
        this.sharedQueries.clear();
        for (const id of [...this.subscribers.keys()]) this.removeSubscriber(id);
        this.stopLifecycle();
    }

    private async initializeSubscriber<T>(subscriber: Subscriber<T>) {
        await this.fetchSubscriber(subscriber);
        if (!subscriber.active) return;
        try {
            await this.authenticateRealtime();
            const topics = await this.resolveTopics();
            if (!subscriber.active) return;
            for (const item of topics) this.acquireTopic(subscriber, item.topic);
        } catch (error) {
            if (subscriber.active) subscriber.onError?.(error);
        }
    }

    private resolveTopics() {
        if (!this.topicsPromise) {
            this.topicsPromise = withSupabaseAuthRetry(async () => {
                const result: any = await this.dependencies.client().rpc("my_order_realtime_topics");
                if (result.error) throw result.error;
                return (Array.isArray(result.data) ? result.data : []) as OrderRealtimeTopic[];
            }).catch((error) => {
                this.topicsPromise = null;
                throw error;
            });
        }
        return this.topicsPromise;
    }

    private async authenticateRealtime() {
        const token = await this.dependencies.accessToken();
        if (!token) throw new Error("A Firebase session is required for secure order Realtime.");
        await this.dependencies.client().realtime.setAuth(token);
    }

    private async fetchSubscriber<T>(subscriber: Subscriber<T>) {
        const generation = ++subscriber.generation;
        try {
            const value = await measureDevelopment("realtime.reconciliation", () => withSupabaseAuthRetry(subscriber.fetcher));
            if (subscriber.active && subscriber.generation === generation) subscriber.onValue(value);
        } catch (error) {
            if (subscriber.active && subscriber.generation === generation) subscriber.onError?.(error);
        }
    }

    private invalidate(id: number, immediate = false) {
        const subscriber = this.subscribers.get(id);
        if (!subscriber?.active) return;
        if (subscriber.debounce) clearTimeout(subscriber.debounce);
        if (immediate) void this.fetchSubscriber(subscriber);
        else subscriber.debounce = setTimeout(() => void this.fetchSubscriber(subscriber), 75);
    }

    private acquireTopic(subscriber: Subscriber, topic: string) {
        if (!topic || subscriber.topics.has(topic)) return;
        subscriber.topics.add(topic);
        let entry = this.topics.get(topic);
        if (!entry) {
            entry = { topic, subscribers: new Set(), channel: null, reconnectAttempt: 0 };
            this.topics.set(topic, entry);
            this.openTopic(entry);
        }
        entry.subscribers.add(subscriber.id);
    }

    private openTopic(entry: TopicEntry) {
        if (!this.topics.has(entry.topic)) return;
        const client = this.dependencies.client();
        const channel = client.channel(entry.topic, { config: { private: true } });
        entry.channel = channel;
        channel
            .on("broadcast", { event: "order_changed" }, () => {
                for (const id of entry.subscribers) this.invalidate(id);
            })
            .subscribe((status: string) => {
                if (!this.topics.has(entry.topic) || entry.channel !== channel) return;
                if (status === "SUBSCRIBED") {
                    entry.reconnectAttempt = 0;
                    for (const id of entry.subscribers) this.invalidate(id, true);
                } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
                    this.scheduleReconnect(entry);
                }
            });
    }

    private scheduleReconnect(entry: TopicEntry) {
        if (entry.reconnectTimer || !entry.subscribers.size) return;
        const index = Math.min(entry.reconnectAttempt, RETRY_DELAYS_MS.length - 1);
        entry.reconnectAttempt += 1;
        entry.reconnectTimer = setTimeout(async () => {
            entry.reconnectTimer = undefined;
            if (!this.topics.has(entry.topic) || !entry.subscribers.size) return;
            await this.dependencies.client().removeChannel(entry.channel).catch(() => undefined);
            try {
                await this.authenticateRealtime();
                this.openTopic(entry);
            } catch {
                this.scheduleReconnect(entry);
            }
        }, RETRY_DELAYS_MS[index]);
    }

    private removeSubscriber(id: number) {
        const subscriber = this.subscribers.get(id);
        if (!subscriber) return;
        subscriber.active = false;
        subscriber.generation += 1;
        if (subscriber.debounce) clearTimeout(subscriber.debounce);
        for (const topic of subscriber.topics) {
            const entry = this.topics.get(topic);
            if (!entry) continue;
            entry.subscribers.delete(id);
            if (!entry.subscribers.size) this.removeTopic(entry);
        }
        this.subscribers.delete(id);
        if (!this.subscribers.size) this.stopLifecycle();
    }

    private removeTopic(entry: TopicEntry) {
        this.topics.delete(entry.topic);
        if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
        if (entry.channel) void this.dependencies.client().removeChannel(entry.channel).catch(() => undefined);
    }

    private async resetForIdentityOrConnection() {
        const identity = this.dependencies.authIdentity();
        const identityChanged = identity !== this.currentIdentity;
        this.currentIdentity = identity;
        if (identityChanged) {
            this.topicsPromise = null;
            for (const entry of this.sharedQueries.values()) {
                entry.value = undefined;
                entry.hasValue = false;
            }
            for (const entry of [...this.topics.values()]) this.removeTopic(entry);
            for (const subscriber of this.subscribers.values()) subscriber.topics.clear();
            if (!identity) {
                for (const subscriber of this.subscribers.values()) subscriber.generation += 1;
                return;
            }
            for (const subscriber of this.subscribers.values()) void this.initializeSubscriber(subscriber);
            return;
        }
        try { await this.authenticateRealtime(); } catch { /* bounded channel retries recover */ }
        this.refreshAll();
        for (const entry of this.topics.values()) {
            if (!entry.channel) this.scheduleReconnect(entry);
        }
    }

    private startLifecycle() {
        this.currentIdentity = this.dependencies.authIdentity();
        const authorizationRefresh = setInterval(() => void this.resetForIdentityOrConnection(), 5 * 60 * 1000);
        this.lifecycleCleanups = [
            () => clearInterval(authorizationRefresh),
            this.dependencies.watchAuth(() => void this.resetForIdentityOrConnection()),
            this.dependencies.watchForeground(() => void this.resetForIdentityOrConnection()),
            this.dependencies.watchNetwork(() => void this.resetForIdentityOrConnection()),
        ];
    }

    private stopLifecycle() {
        for (const cleanup of this.lifecycleCleanups.splice(0)) cleanup();
        for (const entry of [...this.topics.values()]) this.removeTopic(entry);
        this.currentIdentity = null;
        this.topicsPromise = null;
    }
}

export const orderRealtimeCoordinator = new OrderRealtimeCoordinator({
    client: requireSupabase,
    accessToken: getFirebaseAccessToken,
    authIdentity: () => auth?.currentUser?.uid || null,
    watchAuth: (listener) => auth ? onIdTokenChanged(auth, listener) : () => undefined,
    watchForeground: (listener) => {
        const subscription = AppState.addEventListener("change", (state) => { if (state === "active") listener(); });
        return () => subscription.remove();
    },
    watchNetwork: (listener) => {
        const subscription = Network.addNetworkStateListener((state) => { if (state.isConnected) listener(); });
        return () => subscription.remove();
    },
});
