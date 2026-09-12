const assert = require("node:assert/strict");
const test = require("node:test");
const { buildIdentityImportSql, checksum, transformIdentity } = require("./identityMigration");

const fixture = () => ({
  users: [{ id: "u1", data: { accountId: "u1", name: "User", email: "user@example.invalid", favoriteRestaurantIds: ["r1"] } }],
  authUsers: [{ uid: "u1", email: "user@example.invalid" }, { uid: "u2", email: "staff@example.invalid", displayName: "Staff" }],
  addresses: [{ id: "a1", profileId: "u1", data: { id: "a1", label: "Home", line1: "Line", city: "City", country: "Country", isDefault: true, createdAt: "2026-01-01T00:00:00.000Z" } }],
  restaurantStaff: [{ id: "u2", data: { restaurantId: "r1", role: "owner" } }],
  restaurants: [{ id: "r1", data: { ownerId: "legacy-missing" } }],
});

test("identity union preserves Firestore IDs and creates Auth-only profiles", () => {
  const result = transformIdentity(fixture());
  assert.equal(result.rejections.length, 0);
  assert.deepEqual(result.staged.profiles.map((row) => [row.id, row.source_kind]), [["u1", "firestore_auth"], ["u2", "auth_only"]]);
  assert.equal(result.staged.addresses[0].profile_id, "u1");
  assert.equal(result.staged.memberships[0].profile_id, "u2");
  assert.equal(result.staged.favorites[0].restaurant_id, "r1");
});

test("email similarity never links identities", () => {
  const input = fixture();
  input.authUsers = [{ uid: "different", email: "user@example.invalid" }];
  input.restaurantStaff = [];
  const result = transformIdentity(input);
  assert.deepEqual(result.staged.profiles.map((row) => row.id), ["different", "u1"]);
  assert.equal(result.staged.profiles.find((row) => row.id === "u1").firebase_uid, null);
});

test("conflicts, invalid defaults, and multiple memberships block promotion", () => {
  const input = fixture();
  input.addresses.push({ id: "a2", profileId: "u1", data: { id: "a2", label: "Work", line1: "Line", city: "City", country: "Country", isDefault: true } });
  input.restaurantStaff.push({ id: "u2", data: { restaurantId: "r1", role: "manager" } });
  const result = transformIdentity(input);
  assert.ok(result.rejections.some((item) => item.reasonCode === "ADDRESS_DEFAULT_COUNT_INVALID"));
  assert.ok(result.rejections.some((item) => item.reasonCode === "MULTIPLE_MEMBERSHIPS_NOT_ALLOWED"));
  assert.doesNotMatch(buildIdentityImportSql(result, "hungrieapp-a2288").sql, /promote_identity_import/);
});

test("resolvable contradictory owner identity is rejected", () => {
  const input = fixture();
  input.authUsers.push({ uid: "u3", email: "other@example.invalid" });
  input.restaurants[0].data.ownerId = "u3";
  const result = transformIdentity(input);
  assert.ok(result.rejections.some((item) => item.reasonCode === "OWNERSHIP_SOURCE_CONFLICT"));
});

test("embedded default snapshots are validation evidence only", () => {
  const input = fixture();
  input.users[0].data.defaultAddress = { id: "missing" };
  const result = transformIdentity(input);
  assert.ok(result.rejections.some((item) => item.reasonCode === "EMBEDDED_DEFAULT_MISMATCH"));
  assert.equal(result.staged.addresses.length, 1, "embedded snapshot is not imported as another address");
});

test("identical source produces identical checksums and SQL", () => {
  const first = transformIdentity(fixture());
  const second = transformIdentity(JSON.parse(JSON.stringify(fixture())));
  assert.equal(first.sourceChecksum, second.sourceChecksum);
  assert.equal(first.stagedChecksum, second.stagedChecksum);
  assert.equal(checksum(first.staged), checksum(second.staged));
  assert.equal(buildIdentityImportSql(first, "hungrieapp-a2288").sql, buildIdentityImportSql(second, "hungrieapp-a2288").sql);
});

test("source checksums are stable when Firebase returns a different order", () => {
  const firstInput = fixture();
  const secondInput = fixture();
  secondInput.authUsers.reverse();
  assert.equal(transformIdentity(firstInput).sourceChecksum, transformIdentity(secondInput).sourceChecksum);
});
