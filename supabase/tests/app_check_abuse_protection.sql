begin;
select plan(17);

select ok(
  private.consume_abuse_quota('actor-a', 'test-boundary', 2, 60, '2026-10-05 10:00:00+00'),
  'request below the durable limit passes'
);
select ok(
  private.consume_abuse_quota('actor-a', 'test-boundary', 2, 60, '2026-10-05 10:00:01+00'),
  'request at the durable limit passes'
);
select is(
  private.consume_abuse_quota('actor-a', 'test-boundary', 2, 60, '2026-10-05 10:00:02+00'),
  false,
  'request over the durable limit is denied'
);
select ok(
  private.consume_abuse_quota('actor-b', 'test-boundary', 2, 60, '2026-10-05 10:00:02+00'),
  'different identities do not share quota'
);
select ok(
  private.consume_abuse_quota('actor-a', 'different-operation', 2, 60, '2026-10-05 10:00:02+00'),
  'different operation categories do not share quota'
);
select ok(
  private.consume_abuse_quota('actor-a', 'test-boundary', 2, 60, '2026-10-05 10:01:00+00'),
  'a completed window resets atomically'
);

select is(
  (select count(*) from private.api_abuse_limits where operation = 'test-boundary'),
  2::bigint,
  'one bounded counter row is retained per actor and operation'
);
select ok(
  not exists(select 1 from private.api_abuse_limits where actor_hash in ('actor-a', 'actor-b')),
  'raw actor identifiers are not retained'
);

select set_config('request.method', 'POST', true);
select set_config('request.path', 'rpc/create_order_v2', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"api-actor-a"}', true);
select lives_ok(
  $$select public.hungrie_data_api_abuse_check()$$,
  'classified authenticated Data API operation passes below its limit'
);

select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok(
  $$select public.hungrie_data_api_abuse_check()$$,
  'anonymous traffic cannot create authenticated limiter state'
);
select is(
  (select count(*) from private.api_abuse_limits where operation = 'customer-order-create'),
  1::bigint,
  'only the authenticated classified request consumed quota'
);

select volatility_is('public', 'quote_order_v2', array['text', 'jsonb'], 'v',
  'quote RPC is read-write so its high-cost requests can be counted');

select ok(
  (select count(*) from cron.job where jobname = 'hungrie-abuse-limit-cleanup') = 1,
  'expired limiter records have one scheduled cleanup job'
);

insert into private.account_access(profile_id,account_type,status,activated_at,restaurant_id,restaurant_role)
values('fixture_owner','restaurant','active',statement_timestamp(),'fixture_restaurant_a','owner');
select set_config('request.jwt.claims','{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);
select ok(
  public.restaurant_media_upload_allowed_v1('fixture_restaurant_a/first.png'),
  'canonical Restaurant upload passes below its tenant and rate quotas'
);
select ok(
  not public.restaurant_media_upload_allowed_v1('fixture_restaurant_b/cross-tenant.png'),
  'cross-tenant upload is denied independently of quota'
);
select ok(
  (select bool_and(public.restaurant_media_upload_allowed_v1('fixture_restaurant_a/' || sequence_number || '.png')) from generate_series(2,30) as generated(sequence_number)),
  'Restaurant uploads pass through the configured boundary'
);
select is(
  public.restaurant_media_upload_allowed_v1('fixture_restaurant_a/over-limit.png'),
  false,
  'Restaurant upload over the durable boundary is denied'
);

select * from finish();
rollback;
