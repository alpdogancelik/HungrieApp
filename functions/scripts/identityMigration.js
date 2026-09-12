const crypto = require("node:crypto");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};
const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const checksum = (value) => sha256(canonicalJson(value));
const text = (value, fallback = "") => value == null ? fallback : String(value).trim();
const nullableText = (value) => text(value) || null;
const normalizedEmail = (value) => text(value).toLowerCase();
const rejection = (collectionPath, documentId, reasonCode) => ({ collectionPath, documentId, reasonCode });

const transformIdentity = ({ users = [], authUsers = [], addresses = [], restaurantStaff = [], restaurants = [] }) => {
  const rejections = [];
  const profiles = [];
  const stagedAddresses = [];
  const favorites = [];
  const memberships = [];
  const authByUid = new Map(authUsers.map((user) => [text(user.uid), user]));
  const usedAuthUids = new Set();
  const profileByFirebaseUid = new Map();
  const profileIds = new Set();

  for (const document of [...users].sort((a, b) => text(a.id).localeCompare(text(b.id)))) {
    const id = text(document.id);
    const data = document.data || {};
    const accountId = text(data.accountId || id);
    if (!id || accountId !== id) {
      rejections.push(rejection("users", id || "missing", "PROFILE_IDENTITY_CONFLICT"));
      continue;
    }
    const authUser = authByUid.get(id);
    const email = normalizedEmail(authUser?.email || data.email);
    const name = text(data.name || authUser?.displayName || "Hungrie User");
    if (!email || !name || profileIds.has(id)) {
      rejections.push(rejection("users", id || "missing", "PROFILE_REQUIRED_FIELD_MISSING"));
      continue;
    }
    const row = {
      id,
      firebase_uid: authUser ? id : null,
      name,
      email,
      avatar_url: nullableText(data.avatar || authUser?.photoURL),
      whatsapp_number: nullableText(data.whatsappNumber),
      preferred_language: data.preferredLanguage === "tr" ? "tr" : "en",
      source_kind: authUser ? "firestore_auth" : "firestore_only",
      document_checksum: checksum({ id, data, auth: authUser || null }),
    };
    profiles.push(row);
    profileIds.add(id);
    if (authUser) {
      usedAuthUids.add(id);
      profileByFirebaseUid.set(id, row);
    }
  }

  for (const authUser of [...authUsers].sort((a, b) => text(a.uid).localeCompare(text(b.uid)))) {
    const uid = text(authUser.uid);
    if (!uid || usedAuthUids.has(uid)) continue;
    const email = normalizedEmail(authUser.email);
    if (!email || profileIds.has(uid)) {
      rejections.push(rejection("firebaseAuth", uid || "missing", "AUTH_PROFILE_CONFLICT"));
      continue;
    }
    const row = {
      id: uid,
      firebase_uid: uid,
      name: text(authUser.displayName || "Hungrie User"),
      email,
      avatar_url: nullableText(authUser.photoURL),
      whatsapp_number: null,
      preferred_language: "en",
      source_kind: "auth_only",
      document_checksum: checksum({ uid, email, displayName: authUser.displayName || null, photoURL: authUser.photoURL || null }),
    };
    profiles.push(row);
    profileIds.add(uid);
    profileByFirebaseUid.set(uid, row);
  }

  const defaultsByProfile = new Map();
  for (const document of [...addresses].sort((a, b) => `${text(a.profileId)}\0${text(a.id)}`.localeCompare(`${text(b.profileId)}\0${text(b.id)}`))) {
    const id = text(document.id);
    const profileId = text(document.profileId);
    const data = document.data || {};
    if (!profileIds.has(profileId)) {
      rejections.push(rejection(`users/${profileId}/addresses`, id, "ADDRESS_PROFILE_MISSING"));
      continue;
    }
    if (!id || (data.id != null && text(data.id) !== id)) {
      rejections.push(rejection(`users/${profileId}/addresses`, id || "missing", "ADDRESS_ID_CONFLICT"));
      continue;
    }
    const row = {
      id,
      profile_id: profileId,
      label: text(data.label),
      line1: text(data.line1),
      block: nullableText(data.block),
      room: nullableText(data.room),
      city: text(data.city),
      country: text(data.country),
      is_default: data.isDefault === true,
      created_at: nullableText(data.createdAt),
      document_checksum: checksum({ id, profileId, data }),
    };
    if (!row.label || !row.line1 || !row.city || !row.country) {
      rejections.push(rejection(`users/${profileId}/addresses`, id, "ADDRESS_REQUIRED_FIELD_MISSING"));
      continue;
    }
    if (row.created_at && Number.isNaN(Date.parse(row.created_at))) {
      rejections.push(rejection(`users/${profileId}/addresses`, id, "ADDRESS_CREATED_AT_INVALID"));
      continue;
    }
    if (row.is_default) defaultsByProfile.set(profileId, (defaultsByProfile.get(profileId) || 0) + 1);
    stagedAddresses.push(row);
  }
  const addressCounts = new Map();
  for (const row of stagedAddresses) addressCounts.set(row.profile_id, (addressCounts.get(row.profile_id) || 0) + 1);
  for (const [profileId, count] of addressCounts) {
    if ((defaultsByProfile.get(profileId) || 0) !== 1) {
      rejections.push(rejection(`users/${profileId}/addresses`, profileId, count ? "ADDRESS_DEFAULT_COUNT_INVALID" : "ADDRESS_DEFAULT_MISSING"));
    }
  }

  for (const document of users) {
    const profileId = text(document.id);
    const embedded = document.data?.defaultAddress;
    if (!embedded || typeof embedded !== "object") continue;
    const embeddedId = text(embedded.id);
    if (!embeddedId) continue;
    const matchingDefault = stagedAddresses.find((row) => row.profile_id === profileId && row.id === embeddedId && row.is_default);
    if (!matchingDefault) rejections.push(rejection("users", profileId, "EMBEDDED_DEFAULT_MISMATCH"));
  }

  for (const document of users) {
    const profileId = text(document.id);
    if (!profileIds.has(profileId)) continue;
    const ids = document.data?.favoriteRestaurantIds;
    if (ids == null) continue;
    if (!Array.isArray(ids)) {
      rejections.push(rejection("users", profileId, "FAVORITES_INVALID"));
      continue;
    }
    for (const restaurantId of [...new Set(ids.map(text).filter(Boolean))].sort()) {
      if (!restaurants.some((restaurant) => text(restaurant.id) === restaurantId)) {
        rejections.push(rejection("users", profileId, "FAVORITE_RESTAURANT_MISSING"));
        continue;
      }
      favorites.push({ profile_id: profileId, restaurant_id: restaurantId, document_checksum: checksum({ profileId, restaurantId }) });
    }
  }

  const membershipProfiles = new Set();
  const membershipByRestaurant = new Map();
  const restaurantIds = new Set(restaurants.map((restaurant) => text(restaurant.id)));
  for (const document of [...restaurantStaff].sort((a, b) => text(a.id).localeCompare(text(b.id)))) {
    const uid = text(document.id);
    const data = document.data || {};
    const restaurantId = text(data.restaurantId);
    const role = text(data.role).toLowerCase();
    const profile = profileByFirebaseUid.get(uid);
    if (!profile) rejections.push(rejection("restaurantStaff", uid, "MEMBERSHIP_PROFILE_MISSING"));
    else if (!restaurantIds.has(restaurantId)) rejections.push(rejection("restaurantStaff", uid, "MEMBERSHIP_RESTAURANT_MISSING"));
    else if (role !== "owner" && role !== "manager") rejections.push(rejection("restaurantStaff", uid, "MEMBERSHIP_ROLE_INVALID"));
    else if (membershipProfiles.has(profile.id)) rejections.push(rejection("restaurantStaff", uid, "MULTIPLE_MEMBERSHIPS_NOT_ALLOWED"));
    else {
      const row = { profile_id: profile.id, restaurant_id: restaurantId, role, document_checksum: checksum({ uid, data }) };
      memberships.push(row);
      membershipProfiles.add(profile.id);
      if (!membershipByRestaurant.has(restaurantId)) membershipByRestaurant.set(restaurantId, []);
      membershipByRestaurant.get(restaurantId).push(row);
    }
  }

  // A resolvable contradictory owner UID is dangerous. Unresolvable legacy
  // owner IDs and email arrays are evidence only and never grant membership.
  for (const restaurant of restaurants) {
    const restaurantId = text(restaurant.id);
    const ownerUid = text(restaurant.data?.ownerId);
    const mappedOwner = profileByFirebaseUid.get(ownerUid);
    if (!mappedOwner) continue;
    const authoritativeOwners = (membershipByRestaurant.get(restaurantId) || []).filter((row) => row.role === "owner");
    if (authoritativeOwners.length && !authoritativeOwners.some((row) => row.profile_id === mappedOwner.id)) {
      rejections.push(rejection("restaurants", restaurantId, "OWNERSHIP_SOURCE_CONFLICT"));
    }
  }

  profiles.sort((a, b) => a.id.localeCompare(b.id));
  stagedAddresses.sort((a, b) => `${a.profile_id}\0${a.id}`.localeCompare(`${b.profile_id}\0${b.id}`));
  favorites.sort((a, b) => `${a.profile_id}\0${a.restaurant_id}`.localeCompare(`${b.profile_id}\0${b.restaurant_id}`));
  memberships.sort((a, b) => a.profile_id.localeCompare(b.profile_id));
  const byId = (left, right) => text(left.id || left.uid).localeCompare(text(right.id || right.uid));
  const source = {
    users: [...users].sort(byId),
    authUsers: [...authUsers].sort(byId),
    addresses: [...addresses].sort((left, right) => `${text(left.profileId)}\0${text(left.id)}`.localeCompare(`${text(right.profileId)}\0${text(right.id)}`)),
    restaurantStaff: [...restaurantStaff].sort(byId),
    restaurants: [...restaurants].sort(byId),
  };
  const staged = { profiles, addresses: stagedAddresses, favorites, memberships };
  return {
    sourceChecksum: checksum(source),
    stagedChecksum: checksum(staged),
    source: canonicalize(source),
    staged,
    rejections,
    counts: {
      source: { users: users.length, auth_users: authUsers.length, addresses: addresses.length, restaurant_staff: restaurantStaff.length },
      staged: { profiles: profiles.length, addresses: stagedAddresses.length, favorites: favorites.length, memberships: memberships.length },
      rejected: rejections.length,
    },
  };
};

const sqlLiteral = (value) => value == null ? "null" : `'${String(value).replace(/'/g, "''")}'`;
const jsonLiteral = (value) => `${sqlLiteral(canonicalJson(value))}::jsonb`;
const deterministicRunId = (sourceChecksum) => `${sourceChecksum.slice(0, 8)}-${sourceChecksum.slice(8, 12)}-6${sourceChecksum.slice(13, 16)}-a${sourceChecksum.slice(17, 20)}-${sourceChecksum.slice(20, 32)}`;
const buildIdentityImportSql = (result, sourceProject) => {
  const runId = deterministicRunId(result.sourceChecksum);
  const lines = [
    "do $identity_import$", "begin",
    `insert into migration.import_runs (id,source_project,source_checksum,status,counts) values (${sqlLiteral(runId)}::uuid,${sqlLiteral(sourceProject)},${sqlLiteral(result.sourceChecksum)},'pending',${jsonLiteral({ ...result.counts, staged_checksum: result.stagedChecksum })}) on conflict (id) do update set source_checksum=excluded.source_checksum,status='pending',counts=excluded.counts,started_at=null,completed_at=null;`,
    `delete from migration.import_rejections where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.identity_memberships_stage where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.identity_favorites_stage where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.identity_addresses_stage where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.identity_profiles_stage where run_id=${sqlLiteral(runId)}::uuid;`,
    `delete from migration.firestore_documents where run_id=${sqlLiteral(runId)}::uuid;`,
  ];
  for (const [collectionPath, rows] of Object.entries(result.source)) {
    if (collectionPath === "authUsers") continue;
    for (const row of rows) {
      const id = collectionPath === "addresses" ? `${row.profileId}/${row.id}` : row.id;
      lines.push(`insert into migration.firestore_documents(run_id,collection_path,document_id,payload,document_checksum) values (${sqlLiteral(runId)}::uuid,${sqlLiteral(collectionPath)},${sqlLiteral(id)},${jsonLiteral(row.data || row)},${sqlLiteral(checksum(row))});`);
    }
  }
  const specs = [
    ["identity_profiles_stage", result.staged.profiles], ["identity_addresses_stage", result.staged.addresses],
    ["identity_favorites_stage", result.staged.favorites], ["identity_memberships_stage", result.staged.memberships],
  ];
  for (const [table, rows] of specs) for (const row of rows) {
    const columns = ["run_id", ...Object.keys(row)];
    const values = [`${sqlLiteral(runId)}::uuid`, ...Object.values(row).map((value) => sqlLiteral(value))];
    lines.push(`insert into migration.${table}(${columns.join(",")}) values (${values.join(",")});`);
  }
  for (const item of result.rejections) {
    lines.push(`insert into migration.import_rejections(run_id,collection_path,document_id,reason_code) values (${sqlLiteral(runId)}::uuid,${sqlLiteral(item.collectionPath)},${sqlLiteral(item.documentId)},${sqlLiteral(item.reasonCode)});`);
  }
  if (result.rejections.length) lines.push(`update migration.import_runs set status='failed',completed_at=statement_timestamp() where id=${sqlLiteral(runId)}::uuid;`);
  else lines.push(`perform migration.promote_identity_import(${sqlLiteral(runId)}::uuid);`);
  lines.push("end", "$identity_import$;");
  return { runId, sql: `${lines.join("\n")}\n` };
};

module.exports = { buildIdentityImportSql, canonicalJson, checksum, transformIdentity };
