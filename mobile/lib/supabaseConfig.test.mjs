import test from "node:test";
import assert from "node:assert/strict";
import { resolveSupabaseState } from "./supabaseConfig.ts";

test("stays disabled when configuration is missing", () => {
    assert.deepEqual(resolveSupabaseState({}), {
        url: "",
        publishableKey: "",
        configured: false,
        enabled: false,
    });
});

test("stays disabled when configuration is partial", () => {
    assert.equal(resolveSupabaseState({ url: "https://example.supabase.co", enabled: "true" }).enabled, false);
});

test("recognizes a valid but explicitly disabled configuration", () => {
    const state = resolveSupabaseState({
        url: "https://example.supabase.co",
        publishableKey: "sb_publishable_test",
        enabled: "false",
    });
    assert.equal(state.configured, true);
    assert.equal(state.enabled, false);
});
