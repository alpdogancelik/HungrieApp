begin;
select no_plan();

select ok('virtual_pos'=any(enum_range(null::public.payment_method)::text[]),
  'virtual_pos is distinct in the payment method enum');
select ok('pos'=any(enum_range(null::public.payment_method)::text[]),
  'historical physical pos remains present');
select is((select activation_state::text from private.virtual_pos_configuration where singleton),
  'unconfigured','online payment starts unconfigured');
select is((select customer_available from private.virtual_pos_configuration where singleton),
  false,'customer availability is hard disabled');
select is(private.virtual_pos_customer_available_v1(),false,
  'server availability function always fails closed');
select throws_ok($$update private.virtual_pos_configuration set activation_state='active'$$,
  '23514',null,'Milestone A cannot become active');
select throws_ok($$update private.virtual_pos_configuration set customer_available=true$$,
  '23514',null,'Milestone A cannot expose customer payments');

select ok(not has_table_privilege('authenticated','private.virtual_pos_payment_attempts','select'),
  'customers cannot read payment attempts directly');
select ok(not has_table_privilege('authenticated','private.virtual_pos_payment_attempts','update'),
  'customers cannot mutate authoritative payment state');
select ok(not has_table_privilege('service_role','private.virtual_pos_payment_events','select'),
  'service role has no direct payment-event access');
select ok(has_function_privilege('authenticated','public.admin_get_virtual_pos_foundation_v1(text)','execute'),
  'authenticated callers can reach the guarded Admin readiness RPC');
select ok(not has_function_privilege('anon','public.admin_get_virtual_pos_foundation_v1(text)','execute'),
  'anonymous callers cannot reach Virtual POS Admin RPCs');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
  where oid in('private.virtual_pos_configuration'::regclass,
    'private.virtual_pos_commission_rules'::regclass,'private.virtual_pos_checkout_intents'::regclass,
    'private.virtual_pos_payment_attempts'::regclass,'private.virtual_pos_payment_operations'::regclass,
    'private.virtual_pos_payment_events'::regclass,'private.virtual_pos_financial_adjustments'::regclass)),
  'all payment foundation tables use FORCE RLS');

insert into private.account_access(profile_id,account_type,status,activated_at)
values('fixture_customer','customer','active',statement_timestamp());
insert into private.account_access(profile_id,account_type,status,activated_at,admin_role,admin_mfa_enrolled_at)
values('fixture_super_admin','admin','active',statement_timestamp(),'super_admin',statement_timestamp());
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_customer','email_verified',true)::text,true);
select throws_ok($$select public.admin_get_virtual_pos_foundation_v1('fixture_restaurant_a')$$,
  '42501',null,'Customer cannot read Admin Virtual POS preparation');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://securetoken.google.com/hungrieapp-a2288','aud','hungrieapp-a2288',
  'sub','fixture_firebase_super_admin','email_verified',true,
  'auth_time',extract(epoch from statement_timestamp())::bigint,
  'firebase',jsonb_build_object('sign_in_second_factor','totp'))::text,true);
select is((public.admin_schedule_virtual_pos_commission_v1('fixture_restaurant_b',0,
  '2099-01-01 00:00:00+00','provisional-v1','Zero-rate future fixture',
  'b0000000-0000-4000-8000-000000000001')->>'replayed')::boolean,false,
  'recent-TOTP Super Admin can prepare a zero-rate future rule');
select is((public.admin_schedule_virtual_pos_commission_v1('fixture_restaurant_b',0,
  '2099-01-01 00:00:00+00','provisional-v1','Zero-rate future fixture',
  'b0000000-0000-4000-8000-000000000001')->>'replayed')::boolean,true,
  'Virtual POS commission operation replays safely');
select is((select count(*)::integer from private.audit_log
  where action='restaurant.virtual_pos_commission_rule_scheduled_v1'
    and metadata->>'operation_id'='b0000000-0000-4000-8000-000000000001'),1,
  'Virtual POS commission scheduling writes one Admin audit event');

select throws_ok($$insert into public.orders(id,profile_id,restaurant_id,status,payment_method,
  subtotal_kurus,total_kurus) values('virtual_pos_customer_forbidden','fixture_customer',
  'fixture_restaurant_a','pending','virtual_pos',50000,50000)$$,
  '55000','Virtual POS customer payments are not available',
  'no customer order path can initiate Virtual POS');

insert into private.virtual_pos_checkout_intents(id,customer_profile_id,restaurant_id,
  amount_kurus,idempotency_identity,expires_at)
values('b1000000-0000-4000-8000-000000000001','fixture_customer','fixture_restaurant_a',
  50000,'b1000000-0000-4000-8000-000000000002',statement_timestamp()+interval '15 minutes');
insert into private.virtual_pos_payment_attempts(id,checkout_intent_id,customer_profile_id,
  restaurant_id,provider_adapter_id,provider_contract_version,idempotency_identity,
  requested_amount_kurus,authorized_amount_kurus)
values('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',
  'fixture_customer','fixture_restaurant_a','simulated','simulated-v1',
  'b2000000-0000-4000-8000-000000000002',50000,50000);

select ok(private.virtual_pos_transition_allowed_v1('created','checkout_pending'),
  'created can enter checkout pending');
select ok(not private.virtual_pos_transition_allowed_v1('created','captured'),
  'created cannot jump directly to captured');
select is((private.apply_virtual_pos_transition_v1(
  'b2000000-0000-4000-8000-000000000001','checkout_pending','session',
  'b3000000-0000-4000-8000-000000000001',repeat('a',64),'session_created')->>'state'),
  'checkout_pending','server transition succeeds');
select is((private.apply_virtual_pos_transition_v1(
  'b2000000-0000-4000-8000-000000000001','unknown','capture',
  'b3000000-0000-4000-8000-000000000002',repeat('b',64),'unknown')->>'state'),
  'unknown','timeout becomes unknown rather than failed');
select is((private.apply_virtual_pos_transition_v1(
  'b2000000-0000-4000-8000-000000000001','unknown','capture',
  'b3000000-0000-4000-8000-000000000002',repeat('b',64),'unknown')->>'replayed')::boolean,
  true,'duplicate operation ID replays without another transition');
select is((select count(*)::integer from private.virtual_pos_payment_events
  where payment_attempt_id='b2000000-0000-4000-8000-000000000001'),2,
  'operation replay does not duplicate events');
select throws_ok($$select private.apply_virtual_pos_transition_v1(
  'b2000000-0000-4000-8000-000000000001','capture_pending','capture',
  'b3000000-0000-4000-8000-000000000003',repeat('c',64),'capture_pending')$$,
  '55000','Unknown payment must be reconciled before retry',
  'unknown mutation cannot be automatically repeated');
select is((private.apply_virtual_pos_transition_v1(
  'b2000000-0000-4000-8000-000000000001','captured','reconcile',
  'b3000000-0000-4000-8000-000000000004',repeat('d',64),'status_verified','{}',true)->>'state'),
  'captured','verified reconciliation resolves unknown');
select is((select reconciliation_status::text from private.virtual_pos_payment_attempts
  where id='b2000000-0000-4000-8000-000000000001'),'reconciled',
  'reconciliation status is authoritative');
select throws_ok($$update private.virtual_pos_payment_events set event_kind='failed'
  where payment_attempt_id='b2000000-0000-4000-8000-000000000001'$$,
  '55000','Financial contract records are append-only','payment events are immutable');
select throws_ok($$select private.apply_virtual_pos_transition_v1(
  'b2000000-0000-4000-8000-000000000001','refund_pending','refund',
  'b3000000-0000-4000-8000-000000000005',repeat('e',64),'refund_pending',
  '{"raw_payload":"forbidden"}'::jsonb,false)$$,
  '22023','Invalid sanitized payment operation','raw provider payload fields are rejected');
select throws_ok($$insert into private.virtual_pos_payment_events(payment_attempt_id,event_kind,
  prior_state,new_state,provider_adapter_id,sanitized_details) values(
  'b2000000-0000-4000-8000-000000000001','status_verified','captured','captured','simulated',
  '{"nested":{"CVV":"forbidden"}}')$$,'23514',null,
  'nested sensitive payment keys are rejected case-insensitively');

insert into private.virtual_pos_commission_rules(id,restaurant_id,rate_bps,
  financial_contract_version,provider_contract_version,effective_from,created_at,
  created_by_profile_id,reason,operation_id,request_sha256)
values('b4000000-0000-4000-8000-000000000001','fixture_restaurant_a',300,1,
  'provisional-v1','2026-01-02 00:00:00+00','2026-01-02 00:00:00+00',
  'fixture_super_admin','Provider-independent fixture','b4000000-0000-4000-8000-000000000002',repeat('f',64));

alter table public.orders disable trigger aa_virtual_pos_customer_hard_disabled;
insert into public.orders(id,profile_id,restaurant_id,status,payment_method,
  subtotal_kurus,discount_kurus,total_kurus,created_at)
values('virtual_pos_financial_fixture','fixture_customer','fixture_restaurant_a','pending',
  'virtual_pos',50000,0,50000,'2026-02-01 00:00:00+00');
alter table public.orders enable trigger aa_virtual_pos_customer_hard_disabled;
select is((select commission_rate_bps from private.order_commission_terms
  where order_id='virtual_pos_financial_fixture'),800,
  'Hungrie commission rate is snapshotted independently');
select is((select virtual_pos_commission_rate_bps from private.order_commission_terms
  where order_id='virtual_pos_financial_fixture'),300,
  'Virtual POS commission rate is snapshotted independently');
update public.orders set status='delivered',delivered_at='2026-02-01 01:00:00+00'
  where id='virtual_pos_financial_fixture';
select is((select commission_base_kurus from private.delivered_order_financial_snapshots
  where order_id='virtual_pos_financial_fixture'),50000::bigint,'commission base is 500 TL');
select is((select commission_kurus from private.delivered_order_financial_snapshots
  where order_id='virtual_pos_financial_fixture'),4000::bigint,'seeded Hungrie 8% equals 40 TL');
select is((select virtual_pos_commission_kurus from private.delivered_order_financial_snapshots
  where order_id='virtual_pos_financial_fixture'),1500::bigint,'Virtual POS 3% equals 15 TL');
select is((select total_commission_kurus from private.delivered_order_financial_snapshots
  where order_id='virtual_pos_financial_fixture'),5500::bigint,'independent deductions sum exactly');
select is((select restaurant_net_kurus from private.delivered_order_financial_snapshots
  where order_id='virtual_pos_financial_fixture'),44500::bigint,'estimated net uses both deductions');
select is(private.calculate_commission_kurus_v1(50000,500),2500::bigint,
  '500 TL at 5 percent is exactly 25 TL');
select is(private.calculate_commission_kurus_v1(50000,300),1500::bigint,
  '500 TL at 3 percent is exactly 15 TL');
select is((private.earnings_summary_v2('fixture_restaurant_a','2026-02-01','2026-02-01')->>'virtualPosCommissionKurus')::bigint,
  1500::bigint,'v2 earnings exposes estimated Virtual POS commission');
select is((private.earnings_summary_v2('fixture_restaurant_a','2026-02-01','2026-02-01')->>'totalDeductionsKurus')::bigint,
  5500::bigint,'v2 earnings reconciles both configured deductions');
select is((private.earnings_summary_v2('fixture_restaurant_a','2026-02-01','2026-02-01')->>'providerFeesReconciled')::boolean,
  false,'v2 earnings does not claim provider fee reconciliation');
select throws_ok($$update private.delivered_order_financial_snapshots
  set virtual_pos_commission_kurus=0 where order_id='virtual_pos_financial_fixture'$$,
  '55000','Financial contract records are append-only','historical snapshot is immutable');
insert into public.orders(id,profile_id,restaurant_id,status,payment_method,
  subtotal_kurus,total_kurus,created_at)
values('physical_pos_financial_fixture','fixture_customer','fixture_restaurant_a','pending',
  'pos',50000,50000,'2026-02-01 00:00:00+00');
select is((select virtual_pos_commission_rate_bps from private.order_commission_terms
  where order_id='physical_pos_financial_fixture'),0,'physical POS has zero Virtual POS deduction');

select * from finish();
rollback;
