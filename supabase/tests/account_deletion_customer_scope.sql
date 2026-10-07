begin;
select plan(31);

insert into private.account_access(
  profile_id,account_type,status,activated_at,suspended_at,revoked_at,
  restaurant_id,restaurant_role,admin_role,admin_mfa_enrolled_at
) values
  ('fixture_customer','customer','active',statement_timestamp(),null,null,null,null,null,null),
  ('fixture_manager','restaurant','active',statement_timestamp(),null,null,
    'fixture_restaurant_a','manager',null,null),
  ('fixture_owner','restaurant','active',statement_timestamp(),null,null,
    'fixture_restaurant_a','owner',null,null),
  ('fixture_admin','admin','active',statement_timestamp(),null,null,
    null,null,'admin',statement_timestamp()),
  ('fixture_super_admin','admin','active',statement_timestamp(),null,null,
    null,null,'super_admin',statement_timestamp()),
  ('fixture_outsider','customer','suspended',statement_timestamp(),statement_timestamp(),null,
    null,null,null,null),
  ('fixture_unscoped_courier','customer','revoked',statement_timestamp(),null,statement_timestamp(),
    null,null,null,null);

-- Deliberately retain stale legacy authority on an inactive Customer-shaped row.
insert into private.restaurant_members(restaurant_id,profile_id,role)
values('fixture_restaurant_b','fixture_outsider','manager');
insert into private.user_roles(profile_id,role)
values('fixture_outsider','admin');

insert into private.push_tokens(id,profile_id,token,token_hash,platform,provider,app)
values('deletion_scope_token','fixture_customer','ExpoPushToken[deletion-scope]',
  repeat('d',64),'ios','expo','hungrie');
insert into private.audit_log(actor_profile_id,action,target_type,target_id,metadata)
values('fixture_customer','deletion.fixture.retained','profile','fixture_customer','{"fixture":true}'::jsonb);

select ok(not has_function_privilege('anon',
  'public.begin_account_anonymization(text)','execute'),
  'anonymous callers cannot execute account anonymization');
select ok(not has_function_privilege('authenticated',
  'public.begin_account_anonymization(text)','execute'),
  'authenticated clients cannot choose an account deletion target');
select ok(has_function_privilege('service_role',
  'public.begin_account_anonymization(text)','execute'),
  'only the trusted service role can execute account anonymization');

set local role anon;
select throws_ok(
  $$select public.begin_account_anonymization('fixture_firebase_customer')$$,
  '42501',null,'anonymous caller is denied');
reset role;

set local role authenticated;
select throws_ok(
  $$select public.begin_account_anonymization('fixture_firebase_outsider')$$,
  '42501',null,'one authenticated Customer cannot target another Customer');
reset role;

select throws_ok(
  $$select public.begin_account_anonymization('fixture_firebase_manager')$$,
  '42501','CUSTOMER_ACCOUNT_REQUIRED',
  'Restaurant manager cannot use Customer self-deletion');
select throws_ok(
  $$select public.begin_account_anonymization('fixture_firebase_owner')$$,
  '23514','LAST_RESTAURANT_OWNER',
  'Restaurant owner cannot use Customer self-deletion');
select throws_ok(
  $$select public.begin_account_anonymization('fixture_firebase_admin')$$,
  '42501','CUSTOMER_ACCOUNT_REQUIRED',
  'Admin cannot use Customer self-deletion');
select throws_ok(
  $$select public.begin_account_anonymization('fixture_firebase_super_admin')$$,
  '42501','CUSTOMER_ACCOUNT_REQUIRED',
  'Super Admin cannot use Customer self-deletion');
update public.profiles set deletion_pending_at=statement_timestamp()
where id='fixture_admin';
select throws_ok(
  $$select public.begin_account_anonymization('fixture_firebase_admin')$$,
  '42501','CUSTOMER_ACCOUNT_REQUIRED',
  'legacy pending marker cannot grant deletion authority to an Admin');
update public.profiles set deletion_pending_at=null where id='fixture_admin';
select throws_ok(
  $$select public.begin_account_anonymization('fixture_firebase_outsider')$$,
  '42501','CUSTOMER_ACCOUNT_REQUIRED',
  'suspended Customer is denied despite stale roles and memberships');
select throws_ok(
  $$select public.begin_account_anonymization('fixture_firebase_unscoped_courier')$$,
  '42501','CUSTOMER_ACCOUNT_REQUIRED',
  'revoked Customer cannot initiate self-deletion');
select ok((select status='active' from private.account_access where profile_id='fixture_manager')
    and (select status='active' from private.account_access where profile_id='fixture_owner')
    and (select status='active' from private.account_access where profile_id='fixture_admin')
    and (select status='active' from private.account_access where profile_id='fixture_super_admin')
    and (select status='suspended' from private.account_access where profile_id='fixture_outsider')
    and (select status='revoked' from private.account_access where profile_id='fixture_unscoped_courier'),
  'denied attempts leave canonical account states unchanged');
select is((select count(*)::integer from private.firebase_subject_tombstones
    where firebase_uid in ('fixture_firebase_manager','fixture_firebase_owner',
      'fixture_firebase_admin','fixture_firebase_super_admin','fixture_firebase_outsider',
      'fixture_firebase_unscoped_courier')),0,
  'denied attempts do not tombstone identities');

select is((public.begin_account_anonymization('fixture_firebase_customer')->>'state'),'pending',
  'active canonical Customer enters the deletion flow');
select is((public.begin_account_anonymization('fixture_firebase_customer')->>'state'),'pending',
  'pending Customer deletion remains retry-safe after canonical revocation');
select ok((select status='revoked' and revoked_at is not null
    and status_reason_code='firebase_identity_deleted'
    from private.account_access where profile_id='fixture_customer'),
  'Customer canonical account access is revoked');
select ok(exists(select 1 from private.firebase_subject_tombstones
    where firebase_uid='fixture_firebase_customer'),
  'Customer Firebase subject is tombstoned');
select ok(exists(select 1 from public.profiles where id='fixture_customer'
    and name='Deleted user' and email like 'deleted+%@example.invalid'
    and avatar_url is null and whatsapp_number is null and deletion_pending_at is not null),
  'Customer profile PII is anonymized');
select is((select count(*)::integer from public.addresses where profile_id='fixture_customer'),0,
  'Customer addresses are removed');
select is((select count(*)::integer from private.push_tokens where profile_id='fixture_customer'),0,
  'Customer push tokens are removed');
select is((select count(*)::integer from public.favorites where profile_id='fixture_customer'),0,
  'Customer favorites are removed');
select is((select count(*)::integer from public.orders where id='fixture_order'
    and profile_id='fixture_customer'),1,
  'historical order ownership structure is retained');
select is((select total_kurus from public.orders where id='fixture_order'),3100::bigint,
  'historical financial total is retained');
select is((select count(*)::integer from public.order_items where order_id='fixture_order'),1,
  'historical order items are retained');
select ok(exists(select 1 from private.order_contacts where order_id='fixture_order'
    and customer_name='Deleted user' and customer_email is null
    and customer_whatsapp is null and delivery_address_snapshot='{}'::jsonb),
  'retained order contact snapshot is anonymized');
select is((select count(*)::integer from public.product_reviews
    where id='fixture_product_review' and profile_id='fixture_customer'),1,
  'historical product review is retained');
select is((select count(*)::integer from public.order_reviews
    where id='fixture_order_review' and profile_id='fixture_customer'),1,
  'historical order review is retained');
select is((select count(*)::integer from private.audit_log
    where action='deletion.fixture.retained' and actor_profile_id='fixture_customer'),1,
  'historical audit record is retained');
select ok(public.finalize_account_anonymization(
    'fixture_customer','fixture_firebase_customer'),
  'Customer deletion finalizes after identity deletion');
select ok(exists(select 1 from public.profiles where id='fixture_customer'
    and firebase_uid is null and supabase_user_id is null and deleted_at is not null),
  'finalization removes identity mappings and marks the profile deleted');

select * from finish();
rollback;
