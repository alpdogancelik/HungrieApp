-- Phase 7 full-staging reliability: repeated Restaurant non-response detector.
-- The detector is private, data-local, idempotent under concurrent execution,
-- and never mutates Restaurant lifecycle or order-acceptance state.

create or replace function private.detect_repeated_order_non_response_v1(
  p_now timestamptz default statement_timestamp()
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_incident_id uuid;
  v_created integer := 0;
begin
  if p_now is null then
    raise exception 'Evaluation time is required' using errcode = '22023';
  end if;

  -- Serialize scheduled and operator-triggered evaluations. The partial unique
  -- index remains the final unresolved-incident constraint.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hungrie.phase7.repeated_order_non_response.v1', 0)
  );

  for v_candidate in
    with eligible as (
      select
        o.restaurant_id,
        count(*)::integer as eligible_order_count,
        count(*) filter (where exists (
          select 1
          from private.order_status_history h
          where h.order_id = o.id
            and h.new_status = 'canceled'
            and h.source = 'system'
            and h.reason = 'approval_deadline_expired'
        ))::integer as ignored_order_count
      from public.orders o
      where o.approval_deadline_at >= p_now - interval '30 minutes'
        and o.approval_deadline_at < p_now
      group by o.restaurant_id
    )
    select e.restaurant_id, e.eligible_order_count, e.ignored_order_count
    from eligible e
    where e.ignored_order_count >= 3
      and e.ignored_order_count * 2 >= e.eligible_order_count
      and not exists (
        select 1
        from private.restaurant_operational_incidents i
        where i.restaurant_id = e.restaurant_id
          and i.incident_type = 'repeated_order_non_response'
          and i.state <> 'resolved'
      )
      and not exists (
        select 1
        from private.restaurant_operational_incidents i
        where i.restaurant_id = e.restaurant_id
          and i.incident_type = 'repeated_order_non_response'
          and i.state = 'resolved'
          and i.resolved_at > p_now - interval '60 minutes'
      )
    order by e.restaurant_id
  loop
    insert into private.restaurant_operational_incidents (
      restaurant_id,
      incident_type,
      state,
      window_started_at,
      window_ended_at,
      ignored_order_count,
      eligible_order_count,
      threshold_snapshot,
      first_detected_at
    ) values (
      v_candidate.restaurant_id,
      'repeated_order_non_response',
      'open',
      p_now - interval '30 minutes',
      p_now,
      v_candidate.ignored_order_count,
      v_candidate.eligible_order_count,
      jsonb_build_object(
        'contractVersion', 1,
        'windowMinutes', 30,
        'minimumIgnoredOrders', 3,
        'minimumIgnoredRatioBasisPoints', 5000,
        'evaluationIntervalMinutes', 5,
        'cooldownMinutes', 60,
        'acknowledgementTargetMinutes', 15,
        'resolutionTargetMinutes', 1440
      ),
      p_now
    )
    returning id into v_incident_id;

    perform private.write_audit(
      null,
      'restaurant.non_response_incident_opened',
      'operational_incident',
      v_incident_id::text,
      jsonb_build_object(
        'restaurant_id', v_candidate.restaurant_id,
        'ignored_order_count', v_candidate.ignored_order_count,
        'eligible_order_count', v_candidate.eligible_order_count,
        'contract_version', 1
      )
    );
    v_created := v_created + 1;
  end loop;

  return v_created;
end
$$;

grant create on schema private to hungrie_api_owner;
alter function private.detect_repeated_order_non_response_v1(timestamptz)
  owner to hungrie_api_owner;
revoke create on schema private from hungrie_api_owner;
revoke all on function private.detect_repeated_order_non_response_v1(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function private.detect_repeated_order_non_response_v1(timestamptz)
  to hungrie_api_owner;

do $jobs$
declare
  v_job bigint;
begin
  for v_job in
    select jobid from cron.job
    where jobname = 'hungrie-detect-restaurant-non-response'
  loop
    perform cron.unschedule(v_job);
  end loop;

  perform cron.schedule(
    'hungrie-detect-restaurant-non-response',
    '*/5 * * * *',
    'select private.detect_repeated_order_non_response_v1()'
  );

  -- The previous one-minute expiry schedule could not satisfy the Phase 7
  -- maximum deadline-lag contract. pg_cron accepts interval schedules for
  -- sub-minute data-local jobs.
  for v_job in
    select jobid from cron.job
    where jobname = 'hungrie-expire-pending-orders'
  loop
    perform cron.unschedule(v_job);
  end loop;
  perform cron.schedule(
    'hungrie-expire-pending-orders',
    '15 seconds',
    'select private.expire_pending_orders(100)'
  );
end
$jobs$;
