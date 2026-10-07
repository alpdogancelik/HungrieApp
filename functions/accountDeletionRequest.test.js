const assert = require("node:assert/strict");
const test = require("node:test");
const { requireAccountDeletionUid } = require("./accountDeletionRequest");

const now = 1_800_000;
const request = (uid = "customer-a", data = {}) => ({ auth: { uid, token: { auth_time: 1_700 } }, data });

test("derives the deletion target only from the authenticated caller", () => {
    assert.equal(requireAccountDeletionUid(request(), now), "customer-a");
});

test("rejects every client-selected identity field", () => {
    for (const field of ["uid", "userId", "profileId", "firebaseUid", "email"]) {
        assert.throws(() => requireAccountDeletionUid(request("customer-a", { [field]: "customer-b" }), now),
            (error) => error.code === "invalid-argument");
    }
});

test("requires authentication and a recent non-future sign-in", () => {
    assert.throws(() => requireAccountDeletionUid({ data: {} }, now), (error) => error.code === "unauthenticated");
    assert.throws(() => requireAccountDeletionUid({ auth: { uid: "customer-a", token: { auth_time: 1_000 } }, data: {} }, now),
        (error) => error.code === "failed-precondition");
    assert.throws(() => requireAccountDeletionUid({ auth: { uid: "customer-a", token: { auth_time: 2_000 } }, data: {} }, now),
        (error) => error.code === "failed-precondition");
});
