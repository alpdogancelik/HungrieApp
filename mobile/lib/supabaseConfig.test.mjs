import test from "node:test";
import assert from "node:assert/strict";
import { resolveSupabaseState } from "./supabaseConfig.ts";

test("stays disabled when configuration is missing", () => {
    assert.deepEqual(resolveSupabaseState({}), {
        url: "",
        publishableKey: "",
        appEnvironment: "",
        projectRef: "",
        credentialsConfigured: false,
        environmentMatches: false,
        configured: false,
        enabled: false,
    });
});

test("stays disabled when configuration is partial", () => {
    assert.equal(resolveSupabaseState({ url: "https://rlrfvqskzvpysewdxqcr.supabase.co", appEnvironment: "staging", enabled: "true" }).enabled, false);
});

test("recognizes a valid but explicitly disabled configuration", () => {
    const state = resolveSupabaseState({
        url: "https://rlrfvqskzvpysewdxqcr.supabase.co",
        publishableKey: "sb_publishable_test",
        appEnvironment: "staging",
        enabled: "false",
    });
    assert.equal(state.configured, true);
    assert.equal(state.enabled, false);
});

test("enables an exact Staging environment and project match", () => {
    const state = resolveSupabaseState({
        url: "https://rlrfvqskzvpysewdxqcr.supabase.co",
        publishableKey: "sb_publishable_test",
        appEnvironment: "staging",
        enabled: "true",
    });
    assert.equal(state.environmentMatches, true);
    assert.equal(state.enabled, true);
});

test("rejects a Staging URL using the Development environment default", () => {
    const state = resolveSupabaseState({
        url: "https://rlrfvqskzvpysewdxqcr.supabase.co",
        publishableKey: "sb_publishable_test",
        appEnvironment: "development",
        enabled: "true",
    });
    assert.equal(state.credentialsConfigured, true);
    assert.equal(state.environmentMatches, false);
    assert.equal(state.enabled, false);
});

test("production cannot use either non-production Supabase project", () => {
    const state = resolveSupabaseState({
        url: "https://rgjlsjwsitbnwoetmidb.supabase.co",
        publishableKey: "sb_publishable_test",
        appEnvironment: "production",
        enabled: "true",
    });
    assert.equal(state.enabled, false);
});
