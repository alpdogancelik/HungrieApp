/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";

import {
    createRecentSearchesController,
    decodeOwnedRecentSearches,
    encodeOwnedRecentSearches,
    MAX_RECENT_SEARCH_LENGTH,
} from "./recentSearchesIdentity.ts";

const rawFor = (ownerUid, searches) => JSON.stringify(encodeOwnedRecentSearches(ownerUid, searches));
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const memoryPersistence = (initial = null) => {
    let raw = initial;
    let legacy = null;
    const persistence = {
        read: async () => raw,
        write: async value => { raw = value; },
        remove: async () => { raw = null; },
        removeLegacy: async () => { legacy = null; },
    };
    return {
        persistence,
        raw: () => raw,
        legacy: value => { legacy = value; },
        legacyRaw: () => legacy,
    };
};

test("same Customer restores only their owner-bound searches after restart", async () => {
    const memory = memoryPersistence();
    const first = createRecentSearchesController(memory.persistence);
    await first.bind("uid-a");
    assert.equal(first.add("synthetic-a-query"), true);
    await first.flush();
    const restarted = createRecentSearchesController(memory.persistence);
    await restarted.bind("uid-a");
    assert.deepEqual(restarted.getSnapshot(), {
        ownerUid: "uid-a", identityReady: true, searches: ["synthetic-a-query"],
    });
});

test("normal logout locks memory and removes only the bound owner's envelope", async () => {
    const memory = memoryPersistence(rawFor("uid-a", ["synthetic-a-query"]));
    const controller = createRecentSearchesController(memory.persistence);
    await controller.bind("uid-a");
    const destroying = controller.destroy();
    assert.deepEqual(controller.getSnapshot(), { ownerUid: null, identityReady: false, searches: [] });
    await destroying;
    assert.equal(memory.raw(), null);
    assert.deepEqual(controller.getSnapshot(), { ownerUid: null, identityReady: true, searches: [] });
});

test("direct A to B replacement never exposes or merges A history", async () => {
    const memory = memoryPersistence(rawFor("uid-a", ["private-a-query"]));
    const controller = createRecentSearchesController(memory.persistence);
    await controller.bind("uid-a");
    controller.invalidate();
    assert.deepEqual(controller.getSnapshot().searches, []);
    await controller.bind("uid-b");
    assert.deepEqual(controller.getSnapshot(), { ownerUid: "uid-b", identityReady: true, searches: [] });
    controller.add("synthetic-b-query");
    await controller.flush();
    assert.deepEqual(decodeOwnedRecentSearches(memory.raw(), "uid-b"), {
        status: "restore", value: encodeOwnedRecentSearches("uid-b", ["synthetic-b-query"]),
    });
    await controller.bind("uid-a");
    assert.deepEqual(controller.getSnapshot(), { ownerUid: "uid-a", identityReady: true, searches: [] });
});

test("delayed A hydration is discarded after B becomes active", async () => {
    const readA = deferred();
    let reads = 0;
    const memory = memoryPersistence(rawFor("uid-b", ["synthetic-b-query"]));
    const controller = createRecentSearchesController({
        ...memory.persistence,
        read: () => ++reads === 1 ? readA.promise : memory.persistence.read(),
    });
    const hydrationA = controller.bind("uid-a");
    controller.invalidate();
    await controller.bind("uid-b");
    readA.resolve(rawFor("uid-a", ["private-a-query"]));
    await hydrationA;
    assert.deepEqual(controller.getSnapshot(), {
        ownerUid: "uid-b", identityReady: true, searches: ["synthetic-b-query"],
    });
});

test("A read completion cannot roll back a B write", async () => {
    const readA = deferred();
    let reads = 0;
    const memory = memoryPersistence();
    const controller = createRecentSearchesController({
        ...memory.persistence,
        read: () => ++reads === 1 ? readA.promise : memory.persistence.read(),
    });
    const hydrationA = controller.bind("uid-a");
    controller.invalidate();
    await controller.bind("uid-b");
    controller.add("synthetic-b-query");
    readA.resolve(rawFor("uid-a", ["private-a-query"]));
    await hydrationA;
    await controller.flush();
    assert.deepEqual(controller.getSnapshot().searches, ["synthetic-b-query"]);
    assert.equal(decodeOwnedRecentSearches(memory.raw(), "uid-b").status, "restore");
});

test("delayed A write cannot overwrite B state or persistence", async () => {
    const writeA = deferred();
    const writeStarted = deferred();
    const memory = memoryPersistence();
    let writes = 0;
    const controller = createRecentSearchesController({
        ...memory.persistence,
        write: async value => {
            if (++writes === 1) {
                writeStarted.resolve();
                await writeA.promise;
            }
            await memory.persistence.write(value);
        },
    });
    await controller.bind("uid-a");
    controller.add("private-a-query");
    await writeStarted.promise;
    controller.invalidate();
    await controller.bind("uid-b");
    controller.add("synthetic-b-query");
    writeA.resolve();
    await controller.flush();
    assert.deepEqual(controller.getSnapshot().searches, ["synthetic-b-query"]);
    assert.deepEqual(decodeOwnedRecentSearches(memory.raw(), "uid-b"), {
        status: "restore", value: encodeOwnedRecentSearches("uid-b", ["synthetic-b-query"]),
    });
});

test("delayed A cleanup cannot erase B state or persistence", async () => {
    const removeA = deferred();
    const removeStarted = deferred();
    const memory = memoryPersistence(rawFor("uid-a", ["private-a-query"]));
    let removes = 0;
    const controller = createRecentSearchesController({
        ...memory.persistence,
        remove: async () => {
            if (++removes === 1) {
                removeStarted.resolve();
                await removeA.promise;
            }
            await memory.persistence.remove();
        },
    });
    await controller.bind("uid-a");
    const cleanupA = controller.destroy();
    await removeStarted.promise;
    await controller.bind("uid-b");
    controller.add("synthetic-b-query");
    assert.deepEqual(controller.getSnapshot().searches, ["synthetic-b-query"]);
    removeA.resolve();
    await cleanupA;
    await controller.flush();
    assert.equal(decodeOwnedRecentSearches(memory.raw(), "uid-b").status, "restore");
});

test("account deletion cleanup cannot transfer A history to B", async () => {
    const memory = memoryPersistence(rawFor("uid-a", ["private-a-query"]));
    const controller = createRecentSearchesController(memory.persistence);
    await controller.bind("uid-a");
    await controller.destroy();
    await controller.bind("uid-b");
    assert.deepEqual(controller.getSnapshot().searches, []);
});

test("legacy, missing, malformed, mismatched, and oversized envelopes fail closed", () => {
    assert.deepEqual(decodeOwnedRecentSearches(JSON.stringify(["legacy-query"]), "uid-a"), { status: "reject", reason: "legacy" });
    assert.deepEqual(decodeOwnedRecentSearches(JSON.stringify({ version: 4, searches: [] }), "uid-a"), { status: "reject", reason: "missing_owner" });
    for (const ownerUid of [null, "", "   ", {}, 4, "bad\nowner"]) {
        assert.deepEqual(decodeOwnedRecentSearches(JSON.stringify({ version: 4, ownerUid, searches: [] }), "uid-a"), { status: "reject", reason: "missing_owner" });
    }
    assert.deepEqual(decodeOwnedRecentSearches(rawFor("uid-a", ["private-a-query"]), "uid-b"), { status: "reject", reason: "owner_mismatch" });
    assert.deepEqual(decodeOwnedRecentSearches("not-json", "uid-a"), { status: "reject", reason: "malformed" });
    assert.deepEqual(decodeOwnedRecentSearches(JSON.stringify({ version: 4, ownerUid: "uid-a", searches: "wrong" }), "uid-a"), { status: "reject", reason: "malformed" });
    assert.deepEqual(decodeOwnedRecentSearches(rawFor("uid-a", ["x".repeat(MAX_RECENT_SEARCH_LENGTH + 1)]), "uid-a"), { status: "reject", reason: "malformed" });
    assert.deepEqual(decodeOwnedRecentSearches(JSON.stringify({ ...encodeOwnedRecentSearches("uid-a", []), unexpected: true }), "uid-a"), { status: "reject", reason: "malformed" });
});

test("ownerless v3 history is removed and never assigned to an authenticated user", async () => {
    const memory = memoryPersistence();
    memory.legacy(JSON.stringify(["legacy-private-query"]));
    const controller = createRecentSearchesController(memory.persistence);
    await controller.bind("uid-a");
    await controller.flush();
    assert.equal(memory.legacyRaw(), null);
    assert.deepEqual(controller.getSnapshot().searches, []);
});

test("read, write, and remove failures remain empty or owner-local", async () => {
    const readFailure = createRecentSearchesController({
        read: async () => { throw new Error("unavailable"); },
        write: async () => undefined,
        remove: async () => undefined,
        removeLegacy: async () => undefined,
    });
    await readFailure.bind("uid-a");
    assert.deepEqual(readFailure.getSnapshot(), { ownerUid: "uid-a", identityReady: true, searches: [] });

    const writeFailure = createRecentSearchesController({
        read: async () => null,
        write: async () => { throw new Error("quota"); },
        remove: async () => undefined,
        removeLegacy: async () => undefined,
    });
    await writeFailure.bind("uid-b");
    writeFailure.add("synthetic-b-query");
    await writeFailure.flush();
    assert.deepEqual(writeFailure.getSnapshot().searches, ["synthetic-b-query"]);

    const removeFailure = createRecentSearchesController({
        read: async () => rawFor("uid-a", ["private-a-query"]),
        write: async () => undefined,
        remove: async () => { throw new Error("unavailable"); },
        removeLegacy: async () => { throw new Error("unavailable"); },
    });
    await removeFailure.bind("uid-a");
    await removeFailure.destroy();
    assert.deepEqual(removeFailure.getSnapshot(), { ownerUid: null, identityReady: true, searches: [] });
});

test("mutations are ignored until a trusted owner is bound", async () => {
    const memory = memoryPersistence();
    const controller = createRecentSearchesController(memory.persistence);
    assert.equal(controller.add("ownerless-query"), false);
    assert.equal(controller.clear(), false);
    await controller.bind(null);
    assert.equal(controller.add("anonymous-query"), false);
    assert.equal(memory.raw(), null);
});

test("UI consumes the locked snapshot and the root identity boundary invalidates before hydration", () => {
    const hook = readFileSync(new URL("../hooks/useSearchScreenV3.ts", import.meta.url), "utf8");
    const layout = readFileSync(new URL("../../app/_layout.tsx", import.meta.url), "utf8");
    assert.match(hook, /useSyncExternalStore/);
    assert.match(hook, /recentSearchState\.identityReady \? recentSearchState\.searches : \[\]/);
    assert.doesNotMatch(hook, /storage\.getItem|storage\.setItem/);
    assert.ok(layout.indexOf("invalidateRecentSearchIdentity();") < layout.indexOf("syncAuthenticatedUser(false)"));
    assert.match(layout, /bindRecentSearchesToIdentity\(ownerUid\)/);
});
