import crypto from 'node:crypto';

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
export const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const byProfile = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.profile_id) || [];
    list.push(row);
    map.set(row.profile_id, list);
  }
  return map;
};

export function classify(snapshot, firebaseUsers) {
  const profiles = snapshot.profiles.filter((p) => !p.deleted_at && !p.deletion_pending_at)
    .sort((a, b) => a.id.localeCompare(b.id));
  const profileIds = new Set(profiles.map((p) => p.id));
  const firebaseByUid = new Map(firebaseUsers.map((u) => [u.uid, u]));
  const profileEmailCounts = new Map();
  const profileUidCounts = new Map();
  const firebaseEmailCounts = new Map();
  const roleMap = byProfile(snapshot.roles);
  const memberMap = byProfile(snapshot.memberships);
  const customerData = byProfile([...snapshot.orders, ...snapshot.addresses]);
  const existingMap = new Map(snapshot.access.map((a) => [a.profile_id, a]));
  const restaurantMap = new Map(snapshot.restaurants.map((r) => [r.id, r]));
  const reservations = new Map((snapshot.reservations || []).map((r) => [r.normalized_email, r]));
  const pendingInvites = new Set((snapshot.invitations || []).filter((i) => i.state === 'pending').map((i) => i.normalized_email));
  for (const p of profiles) profileEmailCounts.set(normalizeEmail(p.email), (profileEmailCounts.get(normalizeEmail(p.email)) || 0) + 1);
  for (const p of profiles) if (p.firebase_uid) profileUidCounts.set(p.firebase_uid, (profileUidCounts.get(p.firebase_uid) || 0) + 1);
  for (const u of firebaseUsers) if (u.email) firebaseEmailCounts.set(normalizeEmail(u.email), (firebaseEmailCounts.get(normalizeEmail(u.email)) || 0) + 1);
  const proposals = [];
  const conflicts = [];
  const addConflict = (profileId, reasons) => conflicts.push({ profileId, reasons: [...new Set(reasons)].sort() });
  for (const p of profiles) {
    const reasons = [];
    const email = normalizeEmail(p.email);
    const user = firebaseByUid.get(p.firebase_uid);
    const roles = roleMap.get(p.id) || [];
    const members = memberMap.get(p.id) || [];
    const adminRoles = roles.filter((r) => r.role === 'admin' || r.role === 'super_admin');
    if (!p.firebase_uid || !user) reasons.push('missing_firebase_identity');
    if (p.firebase_uid && profileUidCounts.get(p.firebase_uid) !== 1) reasons.push('duplicate_firebase_mapping');
    if (user?.disabled) reasons.push('disabled_firebase_identity');
    if (!email || normalizeEmail(user?.email) !== email) reasons.push('email_mismatch');
    if (profileEmailCounts.get(email) !== 1 || firebaseEmailCounts.get(email) !== 1) reasons.push('duplicate_normalized_email');
    if (adminRoles.length > 1) reasons.push('multiple_admin_roles');
    if (members.length > 1) reasons.push('multiple_restaurant_memberships');
    if (adminRoles.length && members.length) reasons.push('admin_restaurant_overlap');
    if (roles.some((r) => r.role === 'courier')) reasons.push('courier_legacy_role');
    if (roles.some((r) => !['admin', 'super_admin', 'courier'].includes(r.role))) reasons.push('unknown_legacy_role');
    if ((adminRoles.length || members.length) && customerData.has(p.id)) reasons.push('staff_has_customer_data');
    if ((adminRoles.length || members.length) && !user?.emailVerified) reasons.push('privileged_email_unverified');
    if (pendingInvites.has(email)) reasons.push('pending_invitation');
    const reservation = reservations.get(email);
    if (reservation && reservation.profile_id !== p.id) reasons.push('email_reserved_for_other_identity');
    let type = 'customer';
    let role = null;
    let restaurantId = null;
    if (adminRoles.length) {
      type = 'admin'; role = adminRoles[0].role;
    } else if (members.length) {
      type = 'restaurant'; role = members[0].role; restaurantId = members[0].restaurant_id;
      const restaurant = restaurantMap.get(restaurantId);
      if (!restaurant) reasons.push('orphaned_restaurant_membership');
      else if (!restaurant.is_active || restaurant.lifecycle_status !== 'active') reasons.push('restaurant_not_active');
      if (!['owner', 'manager'].includes(role)) reasons.push('unknown_restaurant_role');
    }
    const existing = existingMap.get(p.id);
    if (existing && (existing.account_type !== type ||
      (existing.restaurant_id || null) !== restaurantId ||
      (existing.restaurant_role || existing.admin_role || null) !== role)) reasons.push('existing_classification_differs');
    if (reasons.length) { addConflict(p.id, reasons); continue; }
    proposals.push({ profileId: p.id, firebaseUid: p.firebase_uid,
      normalizedEmail: email, accountType: type, role, restaurantId });
  }
  for (const row of [...snapshot.roles, ...snapshot.memberships]) {
    if (!profileIds.has(row.profile_id)) addConflict(row.profile_id, ['orphaned_legacy_authority']);
  }
  for (const a of snapshot.access) if (!profileIds.has(a.profile_id)) addConflict(a.profile_id, ['canonical_row_without_live_profile']);
  const counts = {
    activeProfiles: profiles.length, firebaseUsers: firebaseUsers.length,
    unmappedFirebase: firebaseUsers.filter((u) => !profileUidCounts.has(u.uid)).length,
    proposedCustomer: proposals.filter((p) => p.accountType === 'customer').length,
    proposedRestaurant: proposals.filter((p) => p.accountType === 'restaurant').length,
    proposedAdmin: proposals.filter((p) => p.accountType === 'admin').length,
    existingCanonical: snapshot.access.length, conflicts: conflicts.length
  };
  return { proposals, conflicts: conflicts.sort((a,b) => a.profileId.localeCompare(b.profileId)), counts };
}

export function compareShadow(snapshot, proposals, firebaseUsers = []) {
  const access = new Map(snapshot.access.map((a) => [a.profile_id, a]));
  const roles = byProfile(snapshot.roles);
  const members = byProfile(snapshot.memberships);
  const restaurants = new Map(snapshot.restaurants.map((r) => [r.id, r]));
  const firebaseByUid = new Map(firebaseUsers.map((u) => [u.uid, u]));
  const differences = [];
  const push = (profileId, action, legacy, canonical, reason) => {
    if (legacy !== canonical) differences.push({ profileId, action, legacy, canonical, reason });
  };
  for (const p of proposals) {
    const a = access.get(p.profileId);
    if (!a) continue;
    const legacyRoles = roles.get(p.profileId) || [];
    const legacyAdmin = legacyRoles.some((x) => ['admin','super_admin'].includes(x.role));
    const claim = firebaseByUid.get(p.firebaseUid)?.platformRole;
    const legacyAdminOperation = legacyRoles.some((x) => x.role === claim &&
      ['admin','super_admin'].includes(x.role));
    const canonicalCustomer = a.account_type === 'customer' && a.status === 'active';
    const canonicalAdmin = a.account_type === 'admin' && a.status === 'active' && !!a.admin_mfa_enrolled_at;
    for (const action of ['customer_data_access','customer_order_create']) {
      push(p.profileId, action, true, canonicalCustomer,
        p.accountType === 'customer' ? 'unexplained' : 'exclusive_identity_removes_legacy_customer_access');
    }
    for (const restaurant of restaurants.values()) {
      const legacyMembership = (members.get(p.profileId) || []).find((x) => x.restaurant_id === restaurant.id);
      const canonicalMember = a.account_type === 'restaurant' && a.status === 'active' &&
        a.restaurant_id === restaurant.id && restaurant.lifecycle_status === 'active';
      const scope = `:${restaurant.id}`;
      push(p.profileId, `restaurant_order_access${scope}`, !!legacyMembership, canonicalMember, 'unexplained');
      push(p.profileId, `restaurant_menu_mutation${scope}`, !!legacyMembership, canonicalMember, 'unexplained');
      push(p.profileId, `restaurant_owner_management${scope}`,
        legacyMembership?.role === 'owner', canonicalMember && a.restaurant_role === 'owner', 'unexplained');
    }
    push(p.profileId, 'admin_route_access', legacyAdmin, canonicalAdmin,
      p.accountType === 'admin' && a.status === 'pending' ? 'admin_requires_mfa_onboarding' : 'unexplained');
    push(p.profileId, 'admin_operation', legacyAdminOperation, canonicalAdmin,
      p.accountType === 'admin' && a.status === 'pending' ? 'admin_requires_mfa_onboarding' : 'unexplained');
  }
  return { differences, unexplained: differences.filter((d) => d.reason === 'unexplained') };
}
