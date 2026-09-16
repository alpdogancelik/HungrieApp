/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import test from "node:test";

import { classifyCustomerAccessContext, customerBootstrapOperationKey, resolveCustomerAccessSingleFlight, resolveCustomerAccessWithDependencies, withTransientCustomerAccessRetry } from "./customerAccess.ts";
import { withRequestDeadline } from "../../lib/requestDeadline.ts";

test("Customer context admits only an active Customer", () => {
    assert.deepEqual(classifyCustomerAccessContext({ state: "resolved", accountType: "customer", accountStatus: "active", profileId: "customer-1" }), { state: "active", profileId: "customer-1" });
    assert.deepEqual(classifyCustomerAccessContext({ state: "resolved", accountType: "restaurant", accountStatus: "active" }), { state: "wrong_portal", accountType: "restaurant" });
    assert.deepEqual(classifyCustomerAccessContext({ state: "resolved", accountType: "admin", accountStatus: "active" }), { state: "wrong_portal", accountType: "admin" });
    assert.deepEqual(classifyCustomerAccessContext({ state: "resolved", accountType: "customer", accountStatus: "suspended" }), { state: "suspended" });
    assert.deepEqual(classifyCustomerAccessContext({ state: "resolved", accountType: "customer", accountStatus: "revoked" }), { state: "revoked" });
    assert.deepEqual(classifyCustomerAccessContext({ state: "configuration_error", referenceId: "safe-ref" }), { state: "configuration_error", referenceId: "safe-ref" });
    assert.deepEqual(classifyCustomerAccessContext({ state: "resolved", accountType: "customer", accountStatus: "pending" }), { state: "configuration_error" });
});

test("Customer bootstrap operation key is valid for native SecureStore", () => {
    const key = customerBootstrapOperationKey("ruxTHgZ2yNQeeyJURlH66Xlznzh1");
    assert.match(key, /^[\w.-]+$/);
    assert.doesNotMatch(key, /:/);
});

test("unmapped Customer bootstraps and removes its persisted operation ID after resolution", async () => {
    const values = new Map();
    const bootstraps = [];
    let reads = 0;
    const result = await resolveCustomerAccessWithDependencies({
        uid: "firebase-customer",
        readContext: async () => ++reads === 1 ? { state: "unmapped" } : { state: "resolved", accountType: "customer", accountStatus: "active", profileId: "customer-1" },
        bootstrap: async (operationId) => { bootstraps.push(operationId); },
        getOperationId: async (key) => values.get(key) || null,
        setOperationId: async (key, value) => { values.set(key, value); },
        removeOperationId: async (key) => { values.delete(key); },
    });
    assert.deepEqual(result, { state: "active", profileId: "customer-1" });
    assert.equal(bootstraps.length, 1);
    assert.match(bootstraps[0], /^[0-9a-f-]{36}$/i);
    assert.equal(values.size, 0);
});

test("failed bootstrap keeps the same operation ID for a safe retry", async () => {
    const values = new Map();
    const bootstraps = [];
    const dependencies = {
        uid: "firebase-customer",
        readContext: async () => ({ state: "unmapped" }),
        bootstrap: async (operationId) => { bootstraps.push(operationId); throw new Error("response lost"); },
        getOperationId: async (key) => values.get(key) || null,
        setOperationId: async (key, value) => { values.set(key, value); },
        removeOperationId: async (key) => { values.delete(key); },
    };
    assert.equal((await resolveCustomerAccessWithDependencies(dependencies)).state, "unavailable");
    assert.equal((await resolveCustomerAccessWithDependencies(dependencies)).state, "unavailable");
    assert.equal(bootstraps.length, 2);
    assert.equal(bootstraps[0], bootstraps[1]);
    assert.equal(values.size, 1);
});

test("concurrent Customer access checks share one operation per Firebase UID", async () => {
    let calls = 0;
    let release;
    const operation = async () => {
        calls += 1;
        await new Promise((resolve) => { release = resolve; });
        return { state: "active", profileId: "customer-1" };
    };
    const first = resolveCustomerAccessSingleFlight("firebase-customer", operation);
    const second = resolveCustomerAccessSingleFlight("firebase-customer", operation);
    assert.equal(first, second);
    assert.equal(calls, 1);
    release();
    assert.deepEqual(await first, { state: "active", profileId: "customer-1" });
});

test("a stalled single-flight check expires and does not poison the next retry", async () => {
    let calls = 0;
    await assert.rejects(resolveCustomerAccessSingleFlight("stalled-customer", async () => {
        calls += 1;
        return new Promise(() => undefined);
    }, 10), /timed out/i);

    const recovered = await resolveCustomerAccessSingleFlight("stalled-customer", async () => {
        calls += 1;
        return { state: "active", profileId: "customer-1" };
    }, 10);
    assert.deepEqual(recovered, { state: "active", profileId: "customer-1" });
    assert.equal(calls, 2);
});

test("transient Customer access failures retry but authorization denial does not", async () => {
    let transientCalls = 0;
    const waits = [];
    const value = await withTransientCustomerAccessRetry(async () => {
        transientCalls += 1;
        if (transientCalls === 1) throw { status: 504, message: "gateway timeout" };
        return "recovered";
    }, [10], async (delay) => { waits.push(delay); });
    assert.equal(value, "recovered");
    assert.equal(transientCalls, 2);
    assert.deepEqual(waits, [10]);

    let deniedCalls = 0;
    await assert.rejects(withTransientCustomerAccessRetry(async () => {
        deniedCalls += 1;
        throw { status: 403, code: "42501" };
    }, [10], async () => undefined));
    assert.equal(deniedCalls, 1);
});

test("post-bootstrap confirmation retries a transient read failure", async () => {
    const values = new Map();
    const waits = [];
    let reads = 0;
    const result = await resolveCustomerAccessWithDependencies({
        uid: "firebase-customer",
        readContext: async () => {
            reads += 1;
            if (reads === 1) return { state: "unmapped" };
            if (reads === 2) throw new Error("temporary gateway failure");
            return { state: "resolved", accountType: "customer", accountStatus: "active", profileId: "customer-1" };
        },
        bootstrap: async () => undefined,
        getOperationId: async (key) => values.get(key) || null,
        setOperationId: async (key, value) => { values.set(key, value); },
        removeOperationId: async (key) => { values.delete(key); },
        postBootstrapRetryDelays: [0, 10],
        wait: async (delay) => { waits.push(delay); },
    });

    assert.deepEqual(result, { state: "active", profileId: "customer-1" });
    assert.deepEqual(waits, [10]);
    assert.equal(values.size, 0);
});

test("local operation cleanup cannot hide confirmed active access", async () => {
    let reads = 0;
    const result = await resolveCustomerAccessWithDependencies({
        uid: "firebase-customer",
        readContext: async () => ++reads === 1
            ? { state: "unmapped" }
            : { state: "resolved", accountType: "customer", accountStatus: "active", profileId: "customer-1" },
        bootstrap: async () => undefined,
        getOperationId: async () => null,
        setOperationId: async () => undefined,
        removeOperationId: async () => { throw new Error("secure storage unavailable"); },
        postBootstrapRetryDelays: [0],
    });

    assert.deepEqual(result, { state: "active", profileId: "customer-1" });
});

test("backend failure is availability rather than an account classification", async () => {
    const result = await resolveCustomerAccessWithDependencies({
        uid: "firebase-customer",
        readContext: async () => { throw new Error("offline"); },
        bootstrap: async () => undefined,
        getOperationId: async () => null,
        setOperationId: async () => undefined,
        removeOperationId: async () => undefined,
    });
    assert.equal(result.state, "unavailable");
    assert.match(result.referenceId, /-context$/);
});

test("an HTTP 401 is classified as an authentication session failure", async () => {
    const result = await resolveCustomerAccessWithDependencies({
        uid: "customer-session",
        readContext: async () => { throw { status: 401, code: "PGRST301" }; },
        bootstrap: async () => undefined,
        getOperationId: async () => null,
        setOperationId: async () => undefined,
        removeOperationId: async () => undefined,
    });

    assert.deepEqual(result, { state: "session_error" });
});

test("a denied Customer bootstrap is reported as a configuration conflict", async () => {
    const result = await resolveCustomerAccessWithDependencies({
        uid: "firebase-customer",
        readContext: async () => ({ state: "unmapped" }),
        bootstrap: async () => { throw { code: "42501", status: 403 }; },
        getOperationId: async () => null,
        setOperationId: async () => undefined,
        removeOperationId: async () => undefined,
    });
    assert.equal(result.state, "configuration_error");
    assert.match(result.referenceId, /^customer-bootstrap-[0-9a-f]{8}$/);
});

test("a stalled startup request aborts and returns control for retry", async () => {
    let signal;
    await assert.rejects(withRequestDeadline((requestSignal) => {
        signal = requestSignal;
        return new Promise(() => undefined);
    }, 10), /timed out/i);
    assert.equal(signal.aborted, true);
});
