begin;
select no_plan();

select has_table('private','firebase_subject_tombstones',
  'deleted Firebase subjects have a durable denial record');
select is((public.begin_account_anonymization('phase6_deleted_unmapped')->>'state'),'not_found',
  'deleting an unmapped Firebase subject records it safely');
select ok(exists(select 1 from private.firebase_subject_tombstones
  where firebase_uid='phase6_deleted_unmapped'),
  'unmapped deletion creates a subject tombstone');

insert into public.profiles(id,firebase_uid,name,email)
values('phase6_deleted_mapped','phase6_deleted_mapped','Deleted fixture','phase6-reusable@example.invalid');
insert into private.account_access(profile_id,account_type,status,activated_at)
values('phase6_deleted_mapped','customer','active',statement_timestamp());
insert into private.account_email_reservations(normalized_email,account_type,firebase_uid,profile_id)
values('phase6-reusable@example.invalid','customer','phase6_deleted_mapped','phase6_deleted_mapped');
select is((public.begin_account_anonymization('phase6_deleted_mapped')->>'state'),'pending',
  'mapped Customer deletion enters anonymization');
select ok(not exists(select 1 from private.account_email_reservations
  where normalized_email='phase6-reusable@example.invalid'),
  'Customer deletion releases the verified email reservation');
select is((select status::text from private.account_access where profile_id='phase6_deleted_mapped'),'revoked',
  'Customer deletion revokes canonical access immediately');
select ok(exists(select 1 from public.profiles where id='phase6_deleted_mapped'
  and deletion_pending_at is not null and email like 'deleted+%@example.invalid'),
  'Customer deletion anonymizes the retained profile');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"phase6_deleted_unmapped","email":"phase6-deleted@example.invalid"}',true);
select throws_ok($$select public.bootstrap_my_customer_account_v1(
  '61616161-6161-4616-8616-616161616161'::uuid)$$,
  '42501','Firebase identity was deleted',
  'a cached token cannot recreate a deleted Firebase identity');

select * from finish();
rollback;
