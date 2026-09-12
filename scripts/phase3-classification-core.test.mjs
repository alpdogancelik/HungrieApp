import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, compareShadow } from './phase3-classification-core.mjs';

const base = () => ({
  profiles: [{ id: 'p1', firebase_uid: 'u1', email: ' A@Example.com ' }],
  restaurants: [{ id: 'r1', is_active: true, lifecycle_status: 'active' }],
  roles: [], memberships: [], orders: [], addresses: [], access: [],
  invitations: [], reservations: []
});
const users = () => [{ uid: 'u1', email: 'a@example.com', emailVerified: true, disabled: false }];

test('unambiguous profile becomes a Customer proposal', () => {
  const result = classify(base(), users());
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.proposals.map(({ accountType }) => accountType), ['customer']);
});

test('missing Firebase mapping and duplicate normalized email are quarantined', () => {
  const snapshot = base();
  snapshot.profiles.push({ id: 'p2', firebase_uid: 'u2', email: 'a@example.com' });
  const result = classify(snapshot, users());
  assert.equal(result.proposals.length, 0);
  assert(result.conflicts.find((c) => c.profileId === 'p1').reasons.includes('duplicate_normalized_email'));
  assert(result.conflicts.find((c) => c.profileId === 'p2').reasons.includes('missing_firebase_identity'));
});

test('one valid Restaurant membership is scoped; Customer data blocks staff classification', () => {
  const snapshot = base();
  snapshot.memberships.push({ profile_id: 'p1', restaurant_id: 'r1', role: 'owner' });
  assert.equal(classify(snapshot, users()).proposals[0].restaurantId, 'r1');
  snapshot.addresses.push({ profile_id: 'p1' });
  assert(classify(snapshot, users()).conflicts[0].reasons.includes('staff_has_customer_data'));
});

test('overlapping legacy roles and orphaned membership are quarantined', () => {
  const snapshot = base();
  snapshot.roles.push({ profile_id: 'p1', role: 'admin' });
  snapshot.memberships.push({ profile_id: 'p1', restaurant_id: 'missing', role: 'manager' });
  const reasons = classify(snapshot, users()).conflicts[0].reasons;
  assert(reasons.includes('admin_restaurant_overlap'));
});

test('legacy Admin import remains pending MFA and its shadow difference is explained', () => {
  const snapshot = base();
  snapshot.roles.push({ profile_id: 'p1', role: 'admin' });
  const proposals = classify(snapshot, users()).proposals;
  assert.equal(proposals[0].accountType, 'admin');
  snapshot.access.push({ profile_id: 'p1', account_type: 'admin', status: 'pending',
    onboarding_step: 'admin_mfa_enrollment_required', admin_role: 'admin' });
  const shadow = compareShadow(snapshot, proposals);
  assert.equal(shadow.unexplained.length, 0);
  assert(shadow.differences.some((d) => d.reason === 'admin_requires_mfa_onboarding'));
});

test('Restaurant scope mismatch is reported as unexplained', () => {
  const snapshot = base();
  snapshot.memberships.push({ profile_id: 'p1', restaurant_id: 'r1', role: 'owner' });
  const proposals = classify(snapshot, users()).proposals;
  snapshot.access.push({ profile_id: 'p1', account_type: 'restaurant', status: 'suspended',
    restaurant_id: 'r1', restaurant_role: 'owner' });
  const shadow = compareShadow(snapshot, proposals);
  assert(shadow.unexplained.some((d) => d.action === 'restaurant_order_access:r1'));
});
