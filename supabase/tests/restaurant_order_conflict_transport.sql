begin;
select no_plan();

insert into private.account_access(profile_id,account_type,status,onboarding_step,activated_at,restaurant_id,restaurant_role)
values('fixture_owner','restaurant','active','none',statement_timestamp(),'fixture_restaurant_a','owner');
select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);

select ok(to_regprocedure('private.raise_restaurant_order_conflict_v1(text)') is not null,
  'private conflict transport helper exists');
select ok(not has_function_privilege('authenticated','private.raise_restaurant_order_conflict_v1(text)','execute'),
  'authenticated callers cannot invoke the private transport helper');

insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,approval_deadline_at)
values
  ('conflict_transport_sql_transition','fixture_customer','fixture_restaurant_a','pending','cash',1000,1000,statement_timestamp()+interval '5 minutes'),
  ('conflict_transport_sql_ack','fixture_customer','fixture_restaurant_a','pending','cash',1000,1000,statement_timestamp()+interval '5 minutes'),
  ('conflict_transport_sql_cancel','fixture_customer','fixture_restaurant_a','pending','cash',1000,1000,statement_timestamp()+interval '5 minutes');

select throws_ok($$select public.restaurant_transition_order_v1(
  'conflict_transport_sql_transition','2000-01-01T00:00:00Z','preparing',null,null,
  '61000000-0000-4000-8000-000000000001')$$,
  'PGRST',null,'stale transition uses the non-retryable PostgREST transport');

select throws_ok($$select public.restaurant_acknowledge_order_seen_v1(
  'conflict_transport_sql_ack','2000-01-01T00:00:00Z',
  '61000000-0000-4000-8000-000000000002')$$,
  'PGRST',null,'stale acknowledgement uses the non-retryable PostgREST transport');

select throws_ok($$select public.restaurant_cancel_order_v2(
  'conflict_transport_sql_cancel','2000-01-01T00:00:00Z','other','',
  '61000000-0000-4000-8000-000000000003')$$,
  'PGRST',null,'stale cancellation inherits the non-retryable transition transport');

select is((select count(*)::integer from private.order_status_history
  where order_id like 'conflict_transport_sql_%'),0,'stale conflicts write no status history');
select is((select count(*)::integer from private.restaurant_order_visibility
  where order_id like 'conflict_transport_sql_%'),0,'stale conflicts write no visibility acknowledgement');
select is((select count(*)::integer from private.restaurant_customer_cancellation_messages
  where order_id like 'conflict_transport_sql_%'),0,'stale conflicts write no Customer message');
select is((select count(*)::integer from private.restaurant_operations
  where operation_id in (
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000003')),0,
  'stale conflicts write no completed operation result');

select * from finish();
rollback;
