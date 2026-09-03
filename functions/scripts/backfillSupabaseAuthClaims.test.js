const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeAuthenticatedRole, parseArgs } = require("./backfillSupabaseAuthClaims");

test("merges the authenticated role without removing existing claims", () => {
  assert.deepEqual(mergeAuthenticatedRole({ admin: true, restaurantId: "restaurant-1" }), {
    admin: true,
    restaurantId: "restaurant-1",
    role: "authenticated",
  });
});

test("replaces only an incompatible role", () => {
  assert.deepEqual(mergeAuthenticatedRole({ role: "legacy", courier: true }), {
    role: "authenticated",
    courier: true,
  });
});

test("defaults to dry-run and parses explicit write options", () => {
  assert.deepEqual(parseArgs(["--confirm-project=hungrieapp-a2288", "--credential", "/tmp/key.json"]), {
    write: false,
    projectId: "hungrieapp-a2288",
    credentialPath: "/tmp/key.json",
  });
  assert.equal(parseArgs(["--write"]).write, true);
});
