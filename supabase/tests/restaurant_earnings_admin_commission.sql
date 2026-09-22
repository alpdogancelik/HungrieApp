begin;
select no_plan();

select ok(has_function_privilege('authenticated',
  'public.admin_get_restaurant_commission_v1(text)','execute'),
  'authenticated callers can reach the guarded commission read RPC');
select ok(has_function_privilege('authenticated',
  'public.restaurant_get_earnings_summary_v1(date,date)','execute'),
  'authenticated callers can reach the guarded owner summary RPC');
select ok(not has_function_privilege('anon',
  'public.restaurant_get_earnings_summary_v1(date,date)','execute'),
  'anonymous callers cannot execute earnings RPCs');
select ok(not has_table_privilege('authenticated',
  'private.restaurant_commission_rules','select'),
  'authenticated callers cannot read commission rules directly');
select ok(not has_table_privilege('service_role',
  'private.delivered_order_financial_snapshots','select'),
  'service role cannot read financial snapshots directly');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid='private.restaurant_commission_rules'::regclass),
  'commission rules use forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid='private.order_commission_terms'::regclass),
  'order terms use forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid='private.delivered_order_financial_snapshots'::regclass),
  'financial snapshots use forced RLS');
select is((select reporting_timezone from public.restaurants
  where id='fixture_restaurant_a'),'Asia/Famagusta','pilot timezone is explicit');
select throws_ok($$update public.restaurants set reporting_timezone='Invalid/Zone'
  where id='fixture_restaurant_a'$$,'22023','Valid IANA reporting timezone required',
  'invalid IANA timezone is rejected');

select is(private.calculate_commission_kurus_v1(49,100),0::bigint,
  'rounding immediately below half kuruş rounds down');
select is(private.calculate_commission_kurus_v1(50,100),1::bigint,
  'rounding exactly at half kuruş rounds up');
select is(private.calculate_commission_kurus_v1(51,100),1::bigint,
  'rounding immediately above half kuruş rounds up');
select is(private.calculate_commission_kurus_v1(99999,0),0::bigint,
  'zero basis points is valid');
select is(private.calculate_commission_kurus_v1(99999,10000),99999::bigint,
  'ten thousand basis points is valid');
select throws_ok($$select private.calculate_commission_kurus_v1(100,-1)$$,
  '22023','Invalid commission calculation input','negative basis points fail');
select throws_ok($$select private.calculate_commission_kurus_v1(100,10001)$$,
  '22023','Invalid commission calculation input','basis points above maximum fail');

insert into private.account_access(profile_id,account_type,status,activated_at,
  restaurant_id,restaurant_role) values
  ('fixture_owner','restaurant','active',statement_timestamp(),'fixture_restaurant_a','owner'),
  ('fixture_manager','restaurant','active',statement_timestamp(),'fixture_restaurant_a','manager');
insert into private.account_access(profile_id,account_type,status,activated_at,
  admin_role,admin_mfa_enrolled_at) values
  ('fixture_admin','admin','active',statement_timestamp(),'admin',statement_timestamp()),
  ('fixture_super_admin','admin','active',statement_timestamp(),'super_admin',statement_timestamp());
insert into private.account_access(profile_id,account_type,status,activated_at)
values('fixture_customer','customer','active',statement_timestamp());

insert into private.restaurant_commission_rules(id,restaurant_id,rate_bps,
  commission_contract_version,effective_from,created_at,created_by_profile_id,
  reason,operation_id,request_sha256)
values('ea100000-0000-4000-8000-000000000001','fixture_restaurant_b',1200,1,
  '2026-06-01 00:00:00+00','2026-05-01 00:00:00+00','fixture_super_admin',
  'Rule boundary fixture','ea100000-0000-4000-8000-000000000011',repeat('c',64));
insert into public.orders(id,profile_id,restaurant_id,status,payment_method,
  subtotal_kurus,total_kurus,created_at) values
  ('earn_rule_before','fixture_customer','fixture_restaurant_b','pending','cash',1000,1000,
    '2026-05-31 23:59:59.999999+00'),
  ('earn_rule_exact','fixture_customer','fixture_restaurant_b','pending','cash',1000,1000,
    '2026-06-01 00:00:00+00'),
  ('earn_rule_after','fixture_customer','fixture_restaurant_b','pending','cash',1000,1000,
    '2026-06-01 00:00:00.000001+00');
select is((select commission_rate_bps from private.order_commission_terms
  where order_id='earn_rule_before'),1000,'order immediately before uses old rule');
select is((select commission_rate_bps from private.order_commission_terms
  where order_id='earn_rule_exact'),1200,'order exactly at effective time uses new rule');
select is((select commission_rate_bps from private.order_commission_terms
  where order_id='earn_rule_after'),1200,'order immediately after uses new rule');

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_super_admin','email_verified',true,
  'auth_time',extract(epoch from statement_timestamp())::bigint,
  'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);
select is((public.admin_schedule_restaurant_commission_v1('fixture_restaurant_a',900,
  '2030-01-01 00:00:00+00','Approved future rate',
  'ea200000-0000-4000-8000-000000000001')->>'replayed')::boolean,false,
  'recent-TOTP super Admin schedules a future rule');
select is((public.admin_schedule_restaurant_commission_v1('fixture_restaurant_a',900,
  '2030-01-01 00:00:00+00','Approved future rate',
  'ea200000-0000-4000-8000-000000000001')->>'replayed')::boolean,true,
  'exact operation replay returns the existing rule');
select is((select count(*)::integer from private.restaurant_commission_rules
  where operation_id='ea200000-0000-4000-8000-000000000001'),1,
  'operation replay creates one rule');
select is((select count(*)::integer from private.audit_log
  where action='restaurant.commission_rule_scheduled_v1'
    and metadata->>'operation_id'='ea200000-0000-4000-8000-000000000001'),1,
  'operation replay creates one PII-free audit event');
select throws_ok($$select public.admin_schedule_restaurant_commission_v1(
  'fixture_restaurant_a',901,'2030-01-01 00:00:00+00','Approved future rate',
  'ea200000-0000-4000-8000-000000000001')$$,'22023',
  'Operation ID was already used for another request',
  'changed-input operation reuse fails');
select throws_ok($$select public.admin_schedule_restaurant_commission_v1(
  'fixture_restaurant_b',1300,'2026-05-31 23:59:59+00','Backdated rate',
  'ea200000-0000-4000-8000-000000000002')$$,'22023',
  'Effective time would change an existing order rule',
  'backdating cannot alter an existing order selection');
select throws_ok($$select public.admin_schedule_restaurant_commission_v1(
  'fixture_restaurant_a',-1,'2031-01-01 00:00:00+00','Invalid rate',
  'ea200000-0000-4000-8000-000000000003')$$,'22023',null,
  'scheduling rejects negative basis points');
select throws_ok($$select public.admin_schedule_restaurant_commission_v1(
  'fixture_restaurant_a',10001,'2031-01-01 00:00:00+00','Invalid rate',
  'ea200000-0000-4000-8000-000000000004')$$,'22023',null,
  'scheduling rejects basis points above maximum');
select throws_ok($$select public.admin_schedule_restaurant_commission_v1(
  'fixture_restaurant_a',700,'2031-01-01 00:00:00+00','',
  'ea200000-0000-4000-8000-000000000005')$$,'22023',null,
  'scheduling requires a reason');
select is((public.admin_schedule_restaurant_commission_v1('fixture_restaurant_a',0,
  '2033-01-01 00:00:00+00','Approved zero boundary',
  'ea200000-0000-4000-8000-000000000008')->>'rateBps')::integer,0,
  'scheduling accepts the zero basis-point boundary');
select is((public.admin_schedule_restaurant_commission_v1('fixture_restaurant_a',10000,
  '2034-01-01 00:00:00+00','Approved maximum boundary',
  'ea200000-0000-4000-8000-000000000009')->>'rateBps')::integer,10000,
  'scheduling accepts the ten-thousand basis-point boundary');
select throws_ok($$select public.admin_schedule_restaurant_commission_v1(
  'fixture_restaurant_a',700,'2035-01-01 00:00:00+00',repeat('x',501),
  'ea200000-0000-4000-8000-000000000010')$$,'22023',null,
  'scheduling enforces the reason length limit');

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_admin','email_verified',true,
  'auth_time',extract(epoch from statement_timestamp())::bigint,
  'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);
select ok((public.admin_get_restaurant_commission_v1('fixture_restaurant_a')
  ->>'currentRule') is not null,'ordinary active Admin can read commission state');
select throws_ok($$select public.admin_schedule_restaurant_commission_v1(
  'fixture_restaurant_a',700,'2032-01-01 00:00:00+00','Admin denied',
  'ea200000-0000-4000-8000-000000000006')$$,'42501',null,
  'ordinary Admin cannot schedule rates');

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_super_admin','email_verified',true,
  'auth_time',extract(epoch from statement_timestamp()-interval '10 minutes')::bigint,
  'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);
select throws_ok($$select public.admin_schedule_restaurant_commission_v1(
  'fixture_restaurant_a',700,'2032-01-01 00:00:00+00','Stale Admin denied',
  'ea200000-0000-4000-8000-000000000007')$$,'42501',
  'Recent authentication required','stale-TOTP super Admin cannot schedule');

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_customer')::text,true);
create temp table earnings_retry_order(order_id text,rate_bps integer);
create temp table earnings_retry_result(result jsonb);
insert into earnings_retry_result select public.create_order_v2(
  'fixture_restaurant_a','fixture_address','cash',
  jsonb_build_array(jsonb_build_object('menuItemId','fixture_menu_a','quantity',1,
    'optionValueIds','[]'::jsonb,'removedIngredientIds','[]'::jsonb)),
  'Commission retry fixture','ea250000-0000-4000-8000-000000000001');
insert into earnings_retry_order select r.result->>'orderId',t.commission_rate_bps
  from earnings_retry_result r join private.order_commission_terms t
    on t.order_id=r.result->>'orderId';
insert into private.restaurant_commission_rules(id,restaurant_id,rate_bps,
  commission_contract_version,effective_from,created_by_profile_id,reason,
  operation_id,request_sha256)
select 'ea250000-0000-4000-8000-000000000002','fixture_restaurant_a',925,1,
  o.created_at+interval '1 microsecond','fixture_super_admin','Retry newer rule fixture',
  'ea250000-0000-4000-8000-000000000003',repeat('f',64)
from public.orders o join earnings_retry_order x on x.order_id=o.id;
select is((public.create_order_v2('fixture_restaurant_a','fixture_address','cash',
  jsonb_build_array(jsonb_build_object('menuItemId','fixture_menu_a','quantity',1,
    'optionValueIds','[]'::jsonb,'removedIngredientIds','[]'::jsonb)),
  'Commission retry fixture','ea250000-0000-4000-8000-000000000001')->>'replayed')::boolean,
  true,'idempotent order retry returns the committed order after a newer rule exists');
select is((select t.commission_rate_bps from private.order_commission_terms t
  join earnings_retry_order x on x.order_id=t.order_id),
  (select rate_bps from earnings_retry_order),
  'idempotent order retry preserves the originally selected commission rate');
select is((select count(*)::integer from private.order_commission_terms t
  join earnings_retry_order x on x.order_id=t.order_id),1,
  'idempotent order retry preserves exactly one terms row');

insert into public.orders(id,profile_id,restaurant_id,status,payment_method,
  subtotal_kurus,delivery_fee_kurus,service_fee_kurus,discount_kurus,tip_kurus,
  total_kurus,delivered_at,created_at) values
  ('earn_cash','fixture_customer','fixture_restaurant_a','delivered','cash',10050,500,200,50,300,
    11000,'2026-09-20 09:00:00+00','2026-09-20 08:00:00+00'),
  ('earn_pos','fixture_customer','fixture_restaurant_a','delivered','pos',20000,1000,100,1000,400,
    20500,'2026-09-20 19:00:00+00','2026-09-20 18:00:00+00'),
  ('earn_nonterminal','fixture_customer','fixture_restaurant_a','ready','cash',5000,0,0,0,0,
    5000,null,'2026-09-20 08:30:00+00'),
  ('earn_canceled','fixture_customer','fixture_restaurant_a','canceled','pos',7000,0,0,0,0,
    7000,null,'2026-09-20 08:45:00+00');
select is((select count(*)::integer from private.delivered_order_financial_snapshots
  where order_id in('earn_cash','earn_pos')),2,'delivered orders get one snapshot each');
select is((select count(*)::integer from private.delivered_order_financial_snapshots
  where order_id in('earn_nonterminal','earn_canceled')),0,
  'nonterminal and canceled orders do not get snapshots');
select is((select commission_base_kurus from private.delivered_order_financial_snapshots
  where order_id='earn_cash'),10000::bigint,'discount reduces eligible gross');
select is((select commission_kurus from private.delivered_order_financial_snapshots
  where order_id='earn_cash'),800::bigint,'snapshot uses deterministic commission');
select is((select restaurant_net_kurus from private.delivered_order_financial_snapshots
  where order_id='earn_cash'),9200::bigint,'snapshot stores estimated net');
select is((select commission_base_kurus from private.delivered_order_financial_snapshots
  where order_id='earn_pos'),19000::bigint,
  'delivery, service, and tip do not enter eligible gross');
select is((select commission_kurus from private.delivered_order_financial_snapshots
  where order_id='earn_pos'),1520::bigint,'POS snapshot uses snapshotted rate');

update public.menu_items set price_kurus=price_kurus+999 where id='fixture_menu_a';
update public.restaurants set delivery_fee_kurus=9999 where id='fixture_restaurant_a';
select is((select commission_kurus from private.delivered_order_financial_snapshots
  where order_id='earn_cash'),800::bigint,
  'later catalog and Restaurant configuration changes do not affect snapshot');
select throws_ok($$update public.orders set subtotal_kurus=10051,total_kurus=11001
  where id='earn_cash'$$,'23514','Authoritative order financial fields are immutable',
  'authoritative order money cannot be changed');
select throws_ok($$update private.restaurant_commission_rules set rate_bps=999
  where id='ea000000-0000-4000-8000-000000000001'$$,'55000',
  'Financial contract records are append-only','commission rules are immutable');
select throws_ok($$delete from private.order_commission_terms
  where order_id='earn_cash'$$,'55000','Financial contract records are append-only',
  'order terms are immutable');
select throws_ok($$update private.delivered_order_financial_snapshots
  set commission_kurus=1 where order_id='earn_cash'$$,'55000',
  'Financial contract records are append-only','financial snapshots are immutable');
select lives_ok($$select private.ensure_delivered_financial_snapshot_v1('earn_cash')$$,
  'replayed delivery snapshot is identical and safe');
select is((select count(*)::integer from private.delivered_order_financial_snapshots
  where order_id='earn_cash'),1,'replayed delivery does not duplicate snapshot');

insert into public.orders(id,profile_id,restaurant_id,status,payment_method,
  subtotal_kurus,total_kurus,created_at)
values('earn_mismatch','fixture_customer','fixture_restaurant_a','out_for_delivery','cash',1000,1000,
  '2026-09-20 20:00:00+00');
insert into private.delivered_order_financial_snapshots(order_id,restaurant_id,
  delivered_at,payment_method,subtotal_kurus,discount_kurus,commission_base_kurus,
  commission_rate_bps,commission_kurus,restaurant_net_kurus,commission_rule_id,
  commission_contract_version)
select 'earn_mismatch','fixture_restaurant_a','2026-09-20 21:00:00+00','cash',
  1000,0,1000,800,1,999,commission_rule_id,1 from private.order_commission_terms
  where order_id='earn_mismatch';
select throws_ok($$update public.orders set status='delivered',
  delivered_at='2026-09-20 21:00:00+00' where id='earn_mismatch'$$,
  '55000','Delivered financial snapshot mismatch',
  'disagreeing existing snapshot fails closed');
select is((select status::text from public.orders where id='earn_mismatch'),
  'out_for_delivery','snapshot disagreement rolls back delivery transition');
select is((select commission_kurus from private.delivered_order_financial_snapshots
  where order_id='earn_mismatch'),1::bigint,'mismatch never overwrites history');

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_owner')::text,true);
select is((public.restaurant_get_earnings_summary_v1('2026-09-20','2026-09-20')
  ->>'eligibleGrossKurus')::bigint,29000::bigint,'owner summary reconciles eligible gross');
select is((public.restaurant_get_earnings_summary_v1('2026-09-20','2026-09-20')
  ->>'commissionKurus')::bigint,2320::bigint,'owner summary reconciles commission');
select is((public.restaurant_get_earnings_summary_v1('2026-09-20','2026-09-20')
  ->>'estimatedNetKurus')::bigint,26680::bigint,'owner summary reconciles estimated net');
select is((public.restaurant_get_earnings_summary_v1('2026-09-20','2026-09-20')
  ->>'deliveredOrderCount')::integer,2,'owner summary counts delivered snapshots only');
select is((public.restaurant_get_earnings_summary_v1('2026-09-20','2026-09-20')
  ->>'restaurantId'),'fixture_restaurant_a',
  'owner scope cannot be redirected to another Restaurant');
select is((public.restaurant_get_earnings_summary_v1('2026-09-20','2026-09-20')
  #>>'{paymentBreakdown,cash,eligibleGrossKurus}')::bigint,10000::bigint,
  'cash breakdown reconciles');
select is((public.restaurant_get_earnings_summary_v1('2026-09-20','2026-09-20')
  #>>'{paymentBreakdown,pos,eligibleGrossKurus}')::bigint,19000::bigint,
  'POS breakdown reconciles');
select is(jsonb_array_length(public.restaurant_get_earnings_series_v1(
  '2026-09-20','2026-09-20','day')->'points'),1,'daily series groups local day');
select is((public.restaurant_get_earnings_series_v1(
  '2026-09-20','2026-09-20','day')#>>'{points,0,paymentBreakdown,cash,eligibleGrossKurus}')::bigint,
  10000::bigint,'daily series cash breakdown reconciles');
select is((public.restaurant_get_earnings_series_v1(
  '2026-09-20','2026-09-20','day')#>>'{points,0,paymentBreakdown,pos,eligibleGrossKurus}')::bigint,
  19000::bigint,'daily series POS breakdown reconciles');
select is(jsonb_array_length(public.restaurant_get_earnings_series_v1(
  '2026-09-20','2026-09-20','week')->'points'),1,'weekly series uses ISO week');
select is(jsonb_array_length(public.restaurant_get_earnings_series_v1(
  '2026-09-20','2026-09-20','month')->'points'),1,'monthly series groups local month');
select throws_ok($$select public.restaurant_get_earnings_series_v1(
  '2026-09-20','2026-09-20','year')$$,'22023',
  'Supported earnings bucket required','unsupported series bucket fails');
select throws_ok($$select public.restaurant_get_earnings_summary_v1(
  '2025-01-01','2026-12-31')$$,'22023',
  'Earnings date range must contain 1 to 366 days','date range is bounded');
select is(jsonb_array_length(public.restaurant_get_earnings_orders_page_v1(
  '2026-09-20','2026-09-20',null,1)->'items'),1,'orders page applies requested limit');
select ok((public.restaurant_get_earnings_orders_page_v1(
  '2026-09-20','2026-09-20',null,1)->>'nextCursor') is not null,
  'orders page returns an opaque next cursor');
select is(jsonb_array_length(public.restaurant_get_earnings_orders_page_v1(
  '2026-09-20','2026-09-20',public.restaurant_get_earnings_orders_page_v1(
    '2026-09-20','2026-09-20',null,1)->>'nextCursor',1)->'items'),1,
  'keyset cursor returns the next row');
select ok((public.restaurant_get_earnings_orders_page_v1(
  '2026-09-20','2026-09-20',null,1)->'items'->0) ? 'orderReference',
  'order page exposes a short reference');
select ok(not ((public.restaurant_get_earnings_orders_page_v1(
  '2026-09-20','2026-09-20',null,1)->'items'->0) ? 'orderId'),
  'order page omits authority-bearing full order ID');

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_manager')::text,true);
select throws_ok($$select public.restaurant_get_earnings_summary_v1(
  '2026-09-20','2026-09-20')$$,'42501','Restaurant owner required',
  'manager cannot read earnings');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_customer')::text,true);
select throws_ok($$select public.restaurant_get_earnings_summary_v1(
  '2026-09-20','2026-09-20')$$,'42501',null,'Customer cannot read earnings');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_owner')::text,true);
update private.account_access set status='suspended',suspended_at=statement_timestamp()
  where profile_id='fixture_owner';
select throws_ok($$select public.restaurant_get_earnings_summary_v1(
  '2026-09-20','2026-09-20')$$,'42501',null,
  'suspended owner cannot read earnings');
update private.account_access set status='active',suspended_at=null,
  activated_at=statement_timestamp() where profile_id='fixture_owner';
insert into private.account_access(profile_id,account_type,status,onboarding_step,
  restaurant_id,restaurant_role)
values('fixture_outsider','restaurant','pending','restaurant_approval_required',
  'fixture_restaurant_a','owner');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_outsider')::text,true);
select throws_ok($$select public.restaurant_get_earnings_summary_v1(
  '2026-09-20','2026-09-20')$$,'42501',null,
  'pending Restaurant owner cannot read earnings');
delete from private.account_access where profile_id='fixture_outsider';
select throws_ok($$select public.restaurant_get_earnings_summary_v1(
  '2026-09-20','2026-09-20')$$,'42501',null,
  'unmapped identity cannot read earnings');
update private.account_access set status='revoked',revoked_at=statement_timestamp()
  where profile_id='fixture_owner';
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_owner')::text,true);
select throws_ok($$select public.restaurant_get_earnings_summary_v1(
  '2026-09-20','2026-09-20')$$,'42501',null,
  'revoked Restaurant owner cannot read earnings');

insert into public.orders(id,profile_id,restaurant_id,status,payment_method,
  subtotal_kurus,total_kurus,delivered_at,created_at) values
  ('earn_dst_before','fixture_customer','fixture_restaurant_b','delivered','cash',1000,1000,
    '2026-03-28 21:59:59+00','2026-03-28 20:00:00+00'),
  ('earn_dst_start','fixture_customer','fixture_restaurant_b','delivered','cash',1000,1000,
    '2026-03-28 22:00:00+00','2026-03-28 20:01:00+00'),
  ('earn_dst_autumn','fixture_customer','fixture_restaurant_b','delivered','pos',1000,1000,
    '2026-10-25 00:30:00+00','2026-10-24 20:00:00+00');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_super_admin','email_verified',true,
  'auth_time',extract(epoch from statement_timestamp())::bigint,
  'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);
select is((public.admin_get_restaurant_earnings_summary_v1(
  'fixture_restaurant_b','2026-03-29','2026-03-29')->>'deliveredOrderCount')::integer,1,
  'Asia/Famagusta spring boundary uses local midnight rather than UTC date');
select is((public.admin_get_restaurant_earnings_summary_v1(
  'fixture_restaurant_b','2026-10-25','2026-10-25')->>'deliveredOrderCount')::integer,1,
  'Asia/Famagusta autumn transition groups the repeated-hour order once');

insert into private.restaurant_commission_rules(id,restaurant_id,rate_bps,
  commission_contract_version,effective_from,created_by_profile_id,reason,
  operation_id,request_sha256)
values('ea300000-0000-4000-8000-000000000001','fixture_restaurant_a',950,2,
  '2040-01-01 00:00:00+00','fixture_super_admin','Future additive contract fixture',
  'ea300000-0000-4000-8000-000000000011',repeat('d',64));
select is((select commission_contract_version from private.delivered_order_financial_snapshots
  where order_id='earn_cash'),1::smallint,
  'newer contract rule does not reinterpret a historical snapshot');
select is((select commission_kurus from private.delivered_order_financial_snapshots
  where order_id='earn_cash'),800::bigint,
  'newer contract rule does not recalculate historical commission');

select is((private.set_restaurant_earnings_capability_v1(true)->>'enabled')::boolean,true,
  'capability preflight succeeds with complete current rule coverage and terms');
select ok(private.detect_restaurant_financial_integrity_v1()>=1,
  'enabled integrity detector records deliberately corrupted fixture state');
select is((select count(*)::integer from private.restaurant_financial_integrity_alerts
  where alert_type='snapshot_mismatch' and order_id='earn_mismatch'
    and resolved_at is null),1,'snapshot mismatch is persisted as an operational warning');
insert into public.restaurants(id,name,is_active,lifecycle_status,accepting_orders,
  description,cuisine,address,delivery_fee_kurus,minimum_order_kurus,opening_hours)
values('earn_missing_rule_restaurant','Missing Rule',false,'pending',false,'','','',0,0,'{}');
select throws_ok($$insert into public.orders(id,profile_id,restaurant_id,status,
  payment_method,subtotal_kurus,total_kurus) values('earn_missing_rule_order',
  'fixture_customer','earn_missing_rule_restaurant','pending','cash',100,100)$$,
  '55000','Applicable commission rule unavailable',
  'enabled capability fails order creation closed without a rule');
select throws_ok($$update public.restaurants set lifecycle_status='active',
  accepting_orders=true where id='earn_missing_rule_restaurant'$$,
  '55000','Applicable commission rule required before accepting orders',
  'activation guard prevents accepting orders without a rule');
select is((private.set_restaurant_earnings_capability_v1(false)->>'enabled')::boolean,false,
  'server-owned capability can be returned to disabled locally');

select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select throws_ok($$select public.restaurant_get_earnings_summary_v1(
  '2026-09-20','2026-09-20')$$,'42501',null,'anonymous RPC call is denied');
reset role;

select * from finish();
rollback;
