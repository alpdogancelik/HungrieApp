begin;
select plan(25);

select ok(
  not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='restaurant_media_canonical_insert'),
  'authenticated clients have no direct public Restaurant media insert policy'
);
select ok(
  not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='restaurant_media_canonical_update'),
  'authenticated clients cannot overwrite validated Restaurant media'
);
select ok(not has_table_privilege('authenticated','private.validated_restaurant_media','select'),
  'validated-media authority is not exposed to authenticated clients');
select ok(has_function_privilege('authenticated','public.restaurant_begin_media_upload_v1(uuid)','execute'),
  'active Restaurant clients may request a trusted upload reservation');
select ok(not has_function_privilege('authenticated','public.server_record_validated_restaurant_media_v1(text,text,uuid,text,text,text,text,integer,integer,integer,text)','execute'),
  'clients cannot self-declare bytes as validated');

insert into private.account_access(profile_id,account_type,status,activated_at,restaurant_id,restaurant_role)
values
  ('fixture_owner','restaurant','active',statement_timestamp(),'fixture_restaurant_a','owner'),
  ('fixture_manager','restaurant','active',statement_timestamp(),'fixture_restaurant_a','manager');

select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);
select is(
  public.restaurant_begin_media_upload_v1('66000000-0000-4000-8000-000000000001')->>'restaurantId',
  'fixture_restaurant_a',
  'owner upload authority derives the tenant instead of accepting it from the client'
);

select set_config('request.jwt.claims','{"role":"service_role","sub":"trusted-test-service"}',true);
select is(
  public.server_record_validated_restaurant_media_v1(
    'fixture_firebase_owner','fixture_restaurant_a','66000000-0000-4000-8000-000000000001',
    'fixture_restaurant_a/66000000-0000-4000-8000-000000000001-'||repeat('a',64)||'.png',
    'https://fixture.invalid/storage/v1/object/public/restaurant-media/fixture_restaurant_a/66000000-0000-4000-8000-000000000001-'||repeat('a',64)||'.png',
    'image/png','png',1200,400,300,repeat('a',64)
  )->>'mime',
  'image/png',
  'trusted service can register decoder-derived media metadata'
);

select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);
select is((public.restaurant_begin_media_upload_v1('66000000-0000-4000-8000-000000000001')->>'replayed')::boolean,true,
  'completed upload retries replay the registered media without another object');

select lives_ok($$
  select public.restaurant_save_menu_item_v2(jsonb_build_object(
    'id','fixture_menu_a','categoryId','fixture_category_a','name','Validated meal','description','',
    'imageUrl','https://fixture.invalid/storage/v1/object/public/restaurant-media/fixture_restaurant_a/66000000-0000-4000-8000-000000000001-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
    'priceKurus',2500,'active',true,'sortOrder',0,'ingredients','[]'::jsonb,'groups','[]'::jsonb
  ),'66000000-0000-4000-8000-000000000002')
$$, 'same-tenant validated media can be published by the menu RPC');

select throws_ok($$
  select public.restaurant_save_menu_item_v2(jsonb_build_object(
    'id','fixture_menu_a','categoryId','fixture_category_a','name','Spoofed meal','description','',
    'imageUrl','https://attacker.invalid/photo.jpg','priceKurus',2500,'active',true,'sortOrder',0,
    'ingredients','[]'::jsonb,'groups','[]'::jsonb
  ),'66000000-0000-4000-8000-000000000003')
$$,'22023','UNVALIDATED_MEDIA_REFERENCE','arbitrary menu image URLs cannot bypass validation');

insert into private.validated_restaurant_media(
  object_path,restaurant_id,uploaded_by_profile_id,operation_id,public_url,mime_type,extension,
  byte_size,width,height,content_sha256
) values (
  'fixture_restaurant_b/66000000-0000-4000-8000-000000000004-'||repeat('b',64)||'.jpg',
  'fixture_restaurant_b','fixture_outsider','66000000-0000-4000-8000-000000000004',
  'https://fixture.invalid/storage/v1/object/public/restaurant-media/fixture_restaurant_b/66000000-0000-4000-8000-000000000004-'||repeat('b',64)||'.jpg',
  'image/jpeg','jpg',900,300,200,repeat('b',64)
);
select throws_ok($$
  select public.restaurant_save_menu_item_v2(jsonb_build_object(
    'id','fixture_menu_a','categoryId','fixture_category_a','name','Cross tenant','description','',
    'imageUrl','https://fixture.invalid/storage/v1/object/public/restaurant-media/fixture_restaurant_b/66000000-0000-4000-8000-000000000004-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg',
    'priceKurus',2500,'active',true,'sortOrder',0,'ingredients','[]'::jsonb,'groups','[]'::jsonb
  ),'66000000-0000-4000-8000-000000000005')
$$,'22023','UNVALIDATED_MEDIA_REFERENCE','another tenant validated image cannot be published');

update public.menu_items set image_url='https://legacy.invalid/menu.jpg' where id='fixture_menu_a';
select lives_ok($$
  select public.restaurant_save_menu_item_v2(jsonb_build_object(
    'id','fixture_menu_a','categoryId','fixture_category_a','name','Legacy unchanged','description','',
    'imageUrl','https://legacy.invalid/menu.jpg','priceKurus',2500,'active',true,'sortOrder',0,
    'ingredients','[]'::jsonb,'groups','[]'::jsonb
  ),'66000000-0000-4000-8000-000000000006')
$$,'unchanged legacy menu media remains compatible without being claimed as validated');

select throws_ok($$
  select public.restaurant_update_settings_v1('{"image_url":"https://attacker.invalid/logo.svg"}',
    '66000000-0000-4000-8000-000000000007')
$$,'22023','UNVALIDATED_MEDIA_REFERENCE','Restaurant settings cannot publish an arbitrary media URL');
select throws_ok($$
  select public.update_restaurant_details('fixture_restaurant_a','{"image_url":"https://attacker.invalid/legacy-logo.jpg"}')
$$,'22023','UNVALIDATED_MEDIA_REFERENCE','legacy Restaurant settings RPC cannot bypass media validation');
select throws_ok($$
  select public.upsert_menu_item('fixture_restaurant_a','fixture_menu_a','fixture_category_a','Legacy spoof',2500,'',
    'https://attacker.invalid/legacy-menu.jpg')
$$,'22023','UNVALIDATED_MEDIA_REFERENCE','legacy menu upsert RPC cannot bypass media validation');
update public.restaurants set image_url='https://legacy.invalid/logo.jpg' where id='fixture_restaurant_a';
select lives_ok($$
  select public.restaurant_update_settings_v1('{"image_url":"https://legacy.invalid/logo.jpg"}',
    '66000000-0000-4000-8000-000000000008')
$$,'unchanged legacy Restaurant image remains compatible');

select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_manager"}',true);
select is(public.restaurant_begin_media_upload_v1('66000000-0000-4000-8000-000000000009')->>'restaurantId',
  'fixture_restaurant_a','active Manager is authorized by current role policy');

update private.account_access set status='suspended',suspended_at=statement_timestamp() where profile_id='fixture_manager';
select throws_ok($$select public.restaurant_begin_media_upload_v1('66000000-0000-4000-8000-000000000010')$$,
  '42501','Active Restaurant account and restaurant required','suspended Manager cannot reserve an upload');
update private.account_access set status='active',suspended_at=null where profile_id='fixture_manager';

select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);
select ok(
  (select bool_and((public.restaurant_begin_media_upload_v1(gen_random_uuid())->>'restaurantId')='fixture_restaurant_a')
   from generate_series(1,29)),
  'upload attempts pass through the configured durable boundary up to its limit'
);
select throws_ok($$select public.restaurant_begin_media_upload_v1('66000000-0000-4000-8000-000000000011')$$,
  'P0001','RESTAURANT_MEDIA_RATE_LIMITED','durable upload rate quota remains enforced after repeated attempts');

delete from private.api_abuse_limits where operation='restaurant-media-upload';
delete from private.restaurant_media_upload_reservations;
insert into private.restaurant_media_upload_reservations(restaurant_id,operation_id,profile_id,expires_at)
select 'fixture_restaurant_a',gen_random_uuid(),'fixture_owner',statement_timestamp()+interval'15 minutes'
from generate_series(1,500);
select throws_ok($$select public.restaurant_begin_media_upload_v1('66000000-0000-4000-8000-000000000012')$$,
  'P0001','RESTAURANT_MEDIA_QUOTA_EXCEEDED','concurrent reservations cannot overrun the per-tenant object quota');

select set_config('request.jwt.claims','{"role":"service_role","sub":"trusted-test-service"}',true);
select throws_ok($$
  select public.server_record_validated_restaurant_media_v1(
    'fixture_firebase_owner','fixture_restaurant_b','66000000-0000-4000-8000-000000000013',
    'fixture_restaurant_b/66000000-0000-4000-8000-000000000013-'||repeat('c',64)||'.jpg',
    'https://fixture.invalid/storage/v1/object/public/restaurant-media/fixture_restaurant_b/66000000-0000-4000-8000-000000000013-'||repeat('c',64)||'.jpg',
    'image/jpeg','jpg',500,20,20,repeat('c',64)
  )
$$,'42501','Active Restaurant account required','trusted registration rechecks tenant membership after decoding');

select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);
select throws_ok($$
  select public.server_record_validated_restaurant_media_v1(
    'fixture_firebase_owner','fixture_restaurant_a','66000000-0000-4000-8000-000000000014',
    'x','https://fixture.invalid/x','image/jpeg','jpg',1,1,1,repeat('d',64)
  )
$$,'42501','Trusted service required','modified clients cannot call the validation registration RPC');

select ok(private.is_validated_restaurant_media_url(
  'https://fixture.invalid/storage/v1/object/public/restaurant-media/fixture_restaurant_a/66000000-0000-4000-8000-000000000001-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
  'fixture_restaurant_a'),'publication authority recognizes the exact registered URL');
select ok(not private.is_validated_restaurant_media_url(
  'https://fixture.invalid/storage/v1/object/public/restaurant-media/fixture_restaurant_a/unregistered.png',
  'fixture_restaurant_a'),'unregistered objects cannot become trusted by path knowledge');

select * from finish();
rollback;
