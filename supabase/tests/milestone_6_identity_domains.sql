begin;

select plan(30);

select has_table('migration', 'identity_profiles_stage', 'profile staging exists');
select has_table('migration', 'identity_addresses_stage', 'address staging exists');
select has_table('migration', 'identity_favorites_stage', 'favorite staging exists');
select has_table('migration', 'identity_memberships_stage', 'membership staging exists');
select has_column('public', 'profiles', 'deletion_pending_at', 'profile deletion pending state exists');
select has_column('public', 'profiles', 'deleted_at', 'profile deletion completion state exists');
select has_function('public', 'update_my_profile', array['text','text','text','text'], 'safe profile update RPC exists');
select has_function('public', 'create_my_address', array['text','text','text','text','text','text','text','boolean'], 'address create RPC exists');
select has_function('public', 'replace_my_favorites', array['text[]'], 'atomic favorite replacement RPC exists');

select throws_ok(
  $$insert into private.restaurant_members(restaurant_id, profile_id, role) values ('fixture_restaurant_b','fixture_owner','manager')$$,
  '23505', null, 'one profile cannot hold multiple restaurant memberships'
);

insert into public.addresses(id, profile_id, label, line1, city, country, is_default)
values ('fixture_address', 'fixture_outsider', 'Scoped duplicate', 'Synthetic line', 'City', 'Country', true);
select is(
  (select count(*)::integer from public.addresses where id='fixture_address'),
  2,
  'Firestore address IDs remain unique within a profile rather than globally'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer","email":"customer@example.invalid"}', true);
select is(public.ensure_my_profile('Overwrite Attempt', null, null, 'tr'), 'fixture_customer', 'ensure reuses the migrated profile');
select is((select name from public.profiles where id='fixture_customer'), 'Fixture Customer', 'ensure does not overwrite migrated profile data');
select is(public.update_my_profile('Updated Customer', null, '+000', 'tr'), 'fixture_customer', 'explicit profile update succeeds');
select is((select name from public.profiles where id='fixture_customer'), 'Updated Customer', 'explicit profile update changes safe data');
select is(public.create_my_address('m6_address','Work','Synthetic line',null,null,'City','Country',true), 'm6_address', 'address create RPC succeeds');
select is((select count(*)::integer from public.addresses where profile_id='fixture_customer' and is_default), 1, 'address create keeps exactly one default');
select lives_ok($$select public.delete_my_address('m6_address')$$, 'default address deletion succeeds');
select is((select id from public.addresses where profile_id='fixture_customer' and is_default), 'fixture_address', 'default address deletion selects replacement');
select is(public.replace_my_favorites(array['fixture_restaurant_b','fixture_restaurant_b']), 1, 'favorite replacement deduplicates IDs');
select is((select restaurant_id from public.favorites where profile_id='fixture_customer'), 'fixture_restaurant_b', 'favorite replacement is atomic');
select throws_ok($$select public.replace_my_favorites(array['missing'])$$, '22023', null, 'favorite replacement rejects unavailable restaurant');

select set_config('request.jwt.claims', '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_outsider","email":"outsider@example.invalid"}', true);
select is((select count(*)::integer from public.addresses), 1, 'another customer sees only their own address');
select is((select count(*)::integer from public.favorites), 0, 'another customer cannot read favorites');

reset role;
select throws_ok($$select public.begin_account_anonymization('fixture_firebase_owner')$$, '23514', 'LAST_RESTAURANT_OWNER', 'last restaurant owner cannot delete account');
select is((select name from public.profiles where id='fixture_owner'), 'Fixture Owner', 'failed owner deletion changes nothing');

select is((public.begin_account_anonymization('fixture_firebase_customer')->>'state'), 'pending', 'customer anonymization begins');
select is((select count(*)::integer from public.addresses where profile_id='fixture_customer'), 0, 'anonymization removes customer addresses');
select ok(public.finalize_account_anonymization('fixture_customer','fixture_firebase_customer'), 'account anonymization finalizes');
select ok((select deleted_at is not null and firebase_uid is null and email like '%@example.invalid' from public.profiles where id='fixture_customer'), 'history profile remains without personal identity mapping');

select * from finish();
rollback;
