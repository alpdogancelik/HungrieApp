begin;
select no_plan();

select ok(not has_function_privilege('authenticated',
  'private.phase3_import_classification(uuid,text,text,jsonb)','execute'),
  'clients cannot invoke the import');
select is((select count(*)::integer from private.account_classification_runs),0,
  'run ledger starts empty');

select is(private.phase3_import_classification(
  '22222222-2222-4222-8222-222222222222','development',repeat('a',64),
  '[{"profileId":"fixture_customer","firebaseUid":"fixture_firebase_customer","normalizedEmail":"customer@example.invalid","accountType":"customer","role":null,"restaurantId":null},{"profileId":"fixture_owner","firebaseUid":"fixture_firebase_owner","normalizedEmail":"owner@example.invalid","accountType":"restaurant","role":"owner","restaurantId":"fixture_restaurant_a"},{"profileId":"fixture_super_admin","firebaseUid":"fixture_firebase_super_admin","normalizedEmail":"superadmin@example.invalid","accountType":"admin","role":"super_admin","restaurantId":null}]'::jsonb),3,
  'valid Customer, Restaurant, and Admin rows import together');
select is((select count(*)::integer from private.account_classification_entries),3,
  'every inserted row has a reversible ledger entry');
select is((select status::text from private.account_access where profile_id='fixture_super_admin'),
  'pending','legacy Admin cannot become active without MFA');
select is((select restaurant_id from private.account_access where profile_id='fixture_owner'),
  'fixture_restaurant_a','Restaurant assignment is scalar and scoped');
select is(private.phase3_import_classification(
  '22222222-2222-4222-8222-222222222222','development',repeat('a',64),
  '[]'::jsonb),0,'same run ID is idempotent');
select throws_ok($$select private.phase3_import_classification(
  '22222222-2222-4222-8222-222222222222','development',repeat('b',64),
  '[]'::jsonb)$$,'23505',null,'changed input digest is rejected');
select throws_ok($$select private.phase3_import_classification(
  '33333333-3333-4333-8333-333333333333','development',repeat('c',64),
  '[{"profileId":"fixture_owner","firebaseUid":"wrong","normalizedEmail":"owner@example.invalid","accountType":"restaurant","role":"owner","restaurantId":"fixture_restaurant_a"}]'::jsonb)$$,
  '23514',null,'changed identity source is rejected');
select is((select count(*)::integer from private.account_classification_runs),1,
  'failed import rolls back its run ledger');
select throws_ok($$select private.phase3_import_classification(
  '66666666-6666-4666-8666-666666666666','development',repeat('d',64),
  '[{"profileId":"fixture_manager","firebaseUid":"fixture_firebase_manager","normalizedEmail":"manager@example.invalid","accountType":"restaurant","role":"manager","restaurantId":"fixture_restaurant_a"},{"profileId":"fixture_owner","firebaseUid":"wrong","normalizedEmail":"owner@example.invalid","accountType":"restaurant","role":"owner","restaurantId":"fixture_restaurant_a"}]'::jsonb)$$,
  '23514',null,'failure after a valid row rolls back the whole import');
select ok(not exists(select 1 from private.account_access where profile_id='fixture_manager'),
  'partial-run recovery leaves no first-row write');
select ok(not exists(select 1 from private.account_classification_runs
  where id='66666666-6666-4666-8666-666666666666'),
  'partial-run recovery leaves no run ledger');
select is(private.phase3_revert_classification('22222222-2222-4222-8222-222222222222'),3,
  'unchanged inserted rows can be reverted');
select is((select count(*)::integer from private.account_access),0,
  'revert removes only imported canonical rows');
select is((select count(*)::integer from private.user_roles where profile_id='fixture_super_admin'),1,
  'legacy Admin authority remains in place');
select is((select count(*)::integer from private.restaurant_members where profile_id='fixture_owner'),1,
  'legacy Restaurant membership remains in place');
select is(private.phase3_revert_classification('22222222-2222-4222-8222-222222222222'),0,
  'revert is idempotent');
select is(private.phase3_import_classification(
  '77777777-7777-4777-8777-777777777777','development',repeat('e',64),
  '[{"profileId":"fixture_customer","firebaseUid":"fixture_firebase_customer","normalizedEmail":"customer@example.invalid","accountType":"customer","role":null,"restaurantId":null},{"profileId":"fixture_owner","firebaseUid":"fixture_firebase_owner","normalizedEmail":"owner@example.invalid","accountType":"restaurant","role":"owner","restaurantId":"fixture_restaurant_a"},{"profileId":"fixture_super_admin","firebaseUid":"fixture_firebase_super_admin","normalizedEmail":"superadmin@example.invalid","accountType":"admin","role":"super_admin","restaurantId":null}]'::jsonb),3,
  'new run can re-import after a verified revert while old ledger history remains');
select is((select count(*)::integer from private.account_classification_entries),6,
  'reverted and corrected runs retain separate insertion records');

select * from finish();
rollback;
