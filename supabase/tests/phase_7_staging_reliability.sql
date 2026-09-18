begin;
select no_plan();

select ok(
  not has_function_privilege(
    'authenticated',
    'private.detect_repeated_order_non_response_v1(timestamptz)',
    'execute'
  ),
  'authenticated callers cannot invoke the private incident detector'
);

select is(
  (select schedule from cron.job where jobname = 'hungrie-detect-restaurant-non-response'),
  '*/5 * * * *',
  'incident detector runs every five minutes'
);

select is(
  (select schedule from cron.job where jobname = 'hungrie-expire-pending-orders'),
  '15 seconds',
  'deadline expiry reconciliation runs every fifteen seconds'
);

insert into private.account_access(
  profile_id, account_type, status, activated_at, restaurant_id, restaurant_role
) values (
  'fixture_owner', 'restaurant', 'active', statement_timestamp(),
  'fixture_restaurant_a', 'owner'
);

update public.restaurants
set accepting_orders = true
where id = 'fixture_restaurant_a';

insert into public.orders(
  id, profile_id, restaurant_id, status, payment_method,
  subtotal_kurus, total_kurus, approval_deadline_at, canceled_at
)
select
  'phase7_first_' || g,
  'fixture_customer',
  'fixture_restaurant_a',
  case when g <= 2 then 'canceled'::public.order_status else 'preparing'::public.order_status end,
  'cash', 100, 100,
  '2026-09-18 12:00:00+00'::timestamptz - (g || ' minutes')::interval,
  case when g <= 2 then '2026-09-18 12:00:00+00'::timestamptz else null end
from generate_series(1, 4) g;

insert into private.order_status_history(
  order_id, previous_status, new_status, source, reason, created_at
)
select
  'phase7_first_' || g,
  'pending', 'canceled', 'system', 'approval_deadline_expired',
  '2026-09-18 12:00:00+00'::timestamptz
from generate_series(1, 2) g;

select is(
  private.detect_repeated_order_non_response_v1('2026-09-18 12:00:00+00'),
  0,
  'two ignored orders do not reach the count threshold'
);

insert into public.orders(
  id, profile_id, restaurant_id, status, payment_method,
  subtotal_kurus, total_kurus, approval_deadline_at, canceled_at
) values (
  'phase7_first_5', 'fixture_customer', 'fixture_restaurant_a', 'canceled',
  'cash', 100, 100, '2026-09-18 11:55:00+00', '2026-09-18 12:00:00+00'
);
insert into private.order_status_history(
  order_id, previous_status, new_status, source, reason, created_at
) values (
  'phase7_first_5', 'pending', 'canceled', 'system',
  'approval_deadline_expired', '2026-09-18 12:00:00+00'
);

select is(
  private.detect_repeated_order_non_response_v1('2026-09-18 12:00:00+00'),
  1,
  'three ignored of five eligible orders open one incident'
);
select is(
  private.detect_repeated_order_non_response_v1('2026-09-18 12:00:00+00'),
  0,
  'repeated evaluation does not duplicate an unresolved incident'
);
select is(
  (select ignored_order_count from private.restaurant_operational_incidents
   where restaurant_id = 'fixture_restaurant_a'),
  3,
  'incident preserves the ignored-order count'
);
select is(
  (select eligible_order_count from private.restaurant_operational_incidents
   where restaurant_id = 'fixture_restaurant_a'),
  5,
  'incident preserves the eligible-order count'
);
select is(
  (select (threshold_snapshot ->> 'acknowledgementTargetMinutes')::integer
   from private.restaurant_operational_incidents
   where restaurant_id = 'fixture_restaurant_a'),
  15,
  'incident snapshots the acknowledgement target'
);
select is(
  (select count(*)::integer from private.audit_log
   where action = 'restaurant.non_response_incident_opened'
     and metadata ->> 'restaurant_id' = 'fixture_restaurant_a'),
  1,
  'incident creation writes one privacy-safe audit event'
);
select ok(
  (select accepting_orders from public.restaurants where id = 'fixture_restaurant_a'),
  'incident detection does not close Restaurant order acceptance'
);
select is(
  (select status::text from private.account_access where profile_id = 'fixture_owner'),
  'active',
  'incident detection does not suspend the Restaurant account'
);

update private.restaurant_operational_incidents
set state = 'resolved',
    acknowledged_by_profile_id = 'fixture_admin',
    acknowledged_at = '2026-09-18 12:01:00+00',
    resolved_by_profile_id = 'fixture_admin',
    resolved_at = '2026-09-18 12:02:00+00',
    resolution_note = 'Phase 7 fixture resolution'
where restaurant_id = 'fixture_restaurant_a';

insert into public.orders(
  id, profile_id, restaurant_id, status, payment_method,
  subtotal_kurus, total_kurus, approval_deadline_at, canceled_at
)
select
  'phase7_cooldown_' || g, 'fixture_customer', 'fixture_restaurant_a',
  'canceled', 'cash', 100, 100,
  '2026-09-18 12:20:00+00'::timestamptz - (g || ' minutes')::interval,
  '2026-09-18 12:20:00+00'::timestamptz
from generate_series(1, 3) g;
insert into private.order_status_history(
  order_id, previous_status, new_status, source, reason, created_at
)
select
  'phase7_cooldown_' || g, 'pending', 'canceled', 'system',
  'approval_deadline_expired', '2026-09-18 12:20:00+00'::timestamptz
from generate_series(1, 3) g;

select is(
  private.detect_repeated_order_non_response_v1('2026-09-18 12:20:00+00'),
  0,
  'resolved incident remains in the sixty-minute cooldown'
);

insert into public.orders(
  id, profile_id, restaurant_id, status, payment_method,
  subtotal_kurus, total_kurus, approval_deadline_at, canceled_at
)
select
  'phase7_reopen_' || g, 'fixture_customer', 'fixture_restaurant_a',
  'canceled', 'cash', 100, 100,
  '2026-09-18 13:10:00+00'::timestamptz - (g || ' minutes')::interval,
  '2026-09-18 13:10:00+00'::timestamptz
from generate_series(1, 3) g;
insert into private.order_status_history(
  order_id, previous_status, new_status, source, reason, created_at
)
select
  'phase7_reopen_' || g, 'pending', 'canceled', 'system',
  'approval_deadline_expired', '2026-09-18 13:10:00+00'::timestamptz
from generate_series(1, 3) g;

select is(
  private.detect_repeated_order_non_response_v1('2026-09-18 13:10:00+00'),
  1,
  'a new qualifying window opens an incident after cooldown'
);
select is(
  (select count(*)::integer from private.restaurant_operational_incidents
   where restaurant_id = 'fixture_restaurant_a'),
  2,
  'resolved history is retained while one new incident is open'
);

select * from finish();
rollback;
