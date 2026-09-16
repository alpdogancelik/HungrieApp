const assert = require("node:assert/strict");
const test = require("node:test");
const { deleteSharedNonProductionAccount, finalizeSharedAccountDeletion } = require("./phase6CustomerDeletionLogic");

const environments = [{ name: "development" }, { name: "staging" }];

test("begins deletion in both databases before deleting Firebase", async () => {
    const calls = [];
    const result = await deleteSharedNonProductionAccount({
        uid: "firebase-1", environments,
        begin: async (environment) => { calls.push(`begin:${environment.name}`); return { profile_id: `${environment.name}-profile` }; },
        scrub: async () => calls.push("scrub"),
        deleteIdentity: async () => calls.push("delete-firebase"),
        finalize: async (environment) => { calls.push(`finalize:${environment.name}`); return true; },
    });
    assert.deepEqual(calls, ["begin:development", "begin:staging", "scrub", "delete-firebase", "finalize:development", "finalize:staging"]);
    assert.deepEqual(result.finalizationFailures, []);
});

test("does not delete Firebase when either database rejects the begin step", async () => {
    let firebaseDeleted = false;
    await assert.rejects(deleteSharedNonProductionAccount({
        uid: "firebase-1", environments,
        begin: async (environment) => {
            if (environment.name === "staging") throw Object.assign(new Error("unavailable"), { code: "503" });
            return { state: "pending", profile_id: "development-profile" };
        },
        scrub: async () => undefined,
        deleteIdentity: async () => { firebaseDeleted = true; },
        finalize: async () => undefined,
    }), /unavailable/);
    assert.equal(firebaseDeleted, false);
});

test("allows an unmapped environment and records finalization for mapped environments", async () => {
    const finalized = [];
    await deleteSharedNonProductionAccount({
        uid: "firebase-1", environments,
        begin: async (environment) => environment.name === "development" ? { state: "not_found" } : { state: "pending", profile_id: "staging-profile" },
        scrub: async () => undefined,
        deleteIdentity: async () => undefined,
        finalize: async (environment, profileId) => { finalized.push([environment.name, profileId]); return true; },
    });
    assert.deepEqual(finalized, [["staging", "staging-profile"]]);
});

test("returns finalization failures for reconciliation after Firebase is deleted", async () => {
    let firebaseDeleted = false;
    const result = await deleteSharedNonProductionAccount({
        uid: "firebase-1", environments,
        begin: async (environment) => ({ state: "pending", profile_id: `${environment.name}-profile` }),
        scrub: async () => undefined,
        deleteIdentity: async () => { firebaseDeleted = true; },
        finalize: async (environment) => {
            if (environment.name === "staging") throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
            return true;
        },
    });
    assert.equal(firebaseDeleted, true);
    assert.deepEqual(result.finalizationFailures, [{ environment: "staging", code: "ETIMEDOUT" }]);
});

test("treats a false database finalization result as pending reconciliation", async () => {
    const result = await finalizeSharedAccountDeletion({
        uid: "firebase-uid",
        begun: [{ environment: { name: "staging" }, result: { state: "pending", profile_id: "profile-staging" } }],
        finalize: async () => false,
    });

    assert.deepEqual(result, [{ environment: "staging", code: "not-finalized" }]);
});

test("a retry continues finalization when Firebase was already deleted", async () => {
    const finalized = [];
    const result = await deleteSharedNonProductionAccount({
        uid: "firebase-uid",
        environments,
        begin: async (environment) => ({ state: "pending", profile_id: `profile-${environment.name}` }),
        scrub: async () => undefined,
        deleteIdentity: async () => { throw Object.assign(new Error("missing"), { code: "auth/user-not-found" }); },
        finalize: async (environment) => { finalized.push(environment.name); return true; },
    });

    assert.deepEqual(finalized, ["development", "staging"]);
    assert.deepEqual(result.finalizationFailures, []);
});
