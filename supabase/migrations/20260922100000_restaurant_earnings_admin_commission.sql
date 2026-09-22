-- Phase 1: local database foundation for Restaurant earnings and Admin-managed
-- commission rules. The capability remains disabled until a separately
-- approved environment activation.

alter table public.restaurants
  add column reporting_timezone text not null default 'Asia/Famagusta'
  check (btrim(reporting_timezone) <> '' and length(reporting_timezone) <= 100);

create table private.restaurant_earnings_capabilities (
  capability text primary key check (capability = 'restaurant_earnings_v1'),
  enabled boolean not null default false,
  updated_at timestamptz not null default statement_timestamp(),
  updated_by_profile_id text references public.profiles(id) on delete set null
);
insert into private.restaurant_earnings_capabilities(capability,enabled)
values('restaurant_earnings_v1',false);

create table private.restaurant_commission_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  rate_bps integer not null check (rate_bps between 0 and 10000),
  commission_contract_version smallint not null default 1
    check (commission_contract_version > 0),
  effective_from timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  created_by_profile_id text not null references public.profiles(id) on delete restrict,
  reason text not null check (reason=btrim(reason) and length(reason) between 1 and 500),
  operation_id uuid not null unique,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  unique(restaurant_id,effective_from),
  unique(id,restaurant_id)
);

create table private.order_commission_terms (
  order_id text primary key references public.orders(id) on delete restrict,
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  commission_rule_id uuid not null,
  commission_rate_bps integer not null check (commission_rate_bps between 0 and 10000),
  commission_contract_version smallint not null check (commission_contract_version > 0),
  snapshotted_at timestamptz not null default statement_timestamp(),
  foreign key(commission_rule_id,restaurant_id)
    references private.restaurant_commission_rules(id,restaurant_id) on delete restrict
);

create table private.delivered_order_financial_snapshots (
  order_id text primary key references public.orders(id) on delete restrict,
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  delivered_at timestamptz not null,
  payment_method public.payment_method not null,
  currency_code text not null default 'TRY' check (currency_code='TRY'),
  subtotal_kurus bigint not null check (subtotal_kurus >= 0),
  discount_kurus bigint not null check (discount_kurus >= 0),
  commission_base_kurus bigint not null check (commission_base_kurus >= 0),
  commission_rate_bps integer not null check (commission_rate_bps between 0 and 10000),
  commission_kurus bigint not null check (commission_kurus >= 0),
  restaurant_net_kurus bigint not null check (restaurant_net_kurus >= 0),
  commission_rule_id uuid not null,
  commission_contract_version smallint not null check (commission_contract_version > 0),
  calculated_at timestamptz not null default statement_timestamp(),
  constraint delivered_financial_snapshot_math check (
    commission_base_kurus=greatest(subtotal_kurus-discount_kurus,0)
    and commission_kurus<=commission_base_kurus
    and restaurant_net_kurus=commission_base_kurus-commission_kurus
  ),
  foreign key(order_id) references private.order_commission_terms(order_id) on delete restrict,
  foreign key(commission_rule_id,restaurant_id)
    references private.restaurant_commission_rules(id,restaurant_id) on delete restrict
);

create table private.restaurant_financial_integrity_alerts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  order_id text references public.orders(id) on delete restrict,
  alert_type text not null check (alert_type in
    ('missing_applicable_rule','missing_order_terms','missing_delivered_snapshot','snapshot_mismatch')),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{32}$'),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  first_detected_at timestamptz not null default statement_timestamp(),
  last_detected_at timestamptz not null default statement_timestamp(),
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  resolved_at timestamptz
);

create unique index restaurant_financial_alert_open_fingerprint_idx
  on private.restaurant_financial_integrity_alerts(fingerprint) where resolved_at is null;
create index restaurant_financial_alert_restaurant_open_idx
  on private.restaurant_financial_integrity_alerts(restaurant_id,last_detected_at desc)
  where resolved_at is null;
create index restaurant_commission_rules_lookup_idx
  on private.restaurant_commission_rules(restaurant_id,effective_from desc,id desc);
create index order_commission_terms_restaurant_rule_idx
  on private.order_commission_terms(restaurant_id,commission_rule_id);
create index delivered_financial_snapshots_restaurant_cursor_idx
  on private.delivered_order_financial_snapshots(restaurant_id,delivered_at desc,order_id desc);
create index delivered_financial_snapshots_restaurant_payment_period_idx
  on private.delivered_order_financial_snapshots(restaurant_id,payment_method,delivered_at);
create index orders_restaurant_created_cursor_idx
  on public.orders(restaurant_id,created_at desc,id desc);

alter table private.restaurant_earnings_capabilities enable row level security;
alter table private.restaurant_earnings_capabilities force row level security;
alter table private.restaurant_commission_rules enable row level security;
alter table private.restaurant_commission_rules force row level security;
alter table private.order_commission_terms enable row level security;
alter table private.order_commission_terms force row level security;
alter table private.delivered_order_financial_snapshots enable row level security;
alter table private.delivered_order_financial_snapshots force row level security;
alter table private.restaurant_financial_integrity_alerts enable row level security;
alter table private.restaurant_financial_integrity_alerts force row level security;

revoke all on private.restaurant_earnings_capabilities,
  private.restaurant_commission_rules,private.order_commission_terms,
  private.delivered_order_financial_snapshots,
  private.restaurant_financial_integrity_alerts
  from public,anon,authenticated,service_role;
grant select,update on private.restaurant_earnings_capabilities to hungrie_api_owner;
grant select,insert on private.restaurant_commission_rules,
  private.order_commission_terms,private.delivered_order_financial_snapshots
  to hungrie_api_owner;
grant select,insert,update on private.restaurant_financial_integrity_alerts
  to hungrie_api_owner;

create policy restaurant_earnings_capability_owner on private.restaurant_earnings_capabilities
  for all to hungrie_api_owner using(true) with check(true);
create policy restaurant_commission_rules_owner on private.restaurant_commission_rules
  for all to hungrie_api_owner using(true) with check(true);
create policy order_commission_terms_owner on private.order_commission_terms
  for all to hungrie_api_owner using(true) with check(true);
create policy delivered_financial_snapshots_owner on private.delivered_order_financial_snapshots
  for all to hungrie_api_owner using(true) with check(true);
create policy restaurant_financial_alerts_owner on private.restaurant_financial_integrity_alerts
  for all to hungrie_api_owner using(true) with check(true);

create function private.reject_financial_record_mutation_v1()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  raise exception 'Financial contract records are append-only' using errcode='55000';
end $$;

create trigger restaurant_commission_rules_immutable
before update or delete on private.restaurant_commission_rules for each row
execute function private.reject_financial_record_mutation_v1();
create trigger order_commission_terms_immutable
before update or delete on private.order_commission_terms for each row
execute function private.reject_financial_record_mutation_v1();
create trigger delivered_financial_snapshots_immutable
before update or delete on private.delivered_order_financial_snapshots for each row
execute function private.reject_financial_record_mutation_v1();

create function private.restaurant_earnings_enabled_v1()
returns boolean language sql stable security definer set search_path='' as $$
  select enabled from private.restaurant_earnings_capabilities
  where capability='restaurant_earnings_v1'
$$;

create function private.lock_restaurant_commission_v1(p_restaurant_id text)
returns void language sql volatile security invoker set search_path='' as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('restaurant-commission-v1:'||p_restaurant_id,0))
$$;

create function private.calculate_commission_kurus_v1(p_base_kurus bigint,p_rate_bps integer)
returns bigint language plpgsql immutable security invoker set search_path='' as $$
declare v_result numeric;
begin
  if p_base_kurus<0 or p_rate_bps not between 0 and 10000 then
    raise exception 'Invalid commission calculation input' using errcode='22023';
  end if;
  v_result:=floor((p_base_kurus::numeric*p_rate_bps::numeric+5000)/10000);
  if v_result>9223372036854775807 then
    raise exception 'Commission calculation overflow' using errcode='22003';
  end if;
  return v_result::bigint;
end $$;

create function private.validate_restaurant_reporting_timezone_v1()
returns trigger language plpgsql stable security definer set search_path='' as $$
begin
  new.reporting_timezone:=btrim(new.reporting_timezone);
  if not exists(select 1 from pg_catalog.pg_timezone_names t
    where t.name=new.reporting_timezone) then
    raise exception 'Valid IANA reporting timezone required' using errcode='22023';
  end if;
  return new;
end $$;
create trigger restaurant_reporting_timezone_valid
before insert or update of reporting_timezone on public.restaurants for each row
execute function private.validate_restaurant_reporting_timezone_v1();

create function private.guard_restaurant_financial_activation_v1()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  if new.accepting_orders then
    -- Serialize order-acceptance changes with capability activation. If this
    -- transaction wins, activation sees the new accepting Restaurant; if
    -- activation wins, this trigger observes the enabled invariant.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('restaurant-earnings-v1:capability',0));
  end if;
  if new.accepting_orders and private.restaurant_earnings_enabled_v1() then
    perform private.lock_restaurant_commission_v1(new.id);
    if not exists(select 1 from private.restaurant_commission_rules r
      where r.restaurant_id=new.id and r.effective_from<=statement_timestamp()) then
      raise exception 'Applicable commission rule required before accepting orders'
        using errcode='55000';
    end if;
  end if;
  return new;
end $$;
create trigger zz_restaurant_financial_activation_guard
before insert or update of accepting_orders,lifecycle_status on public.restaurants for each row
execute function private.guard_restaurant_financial_activation_v1();

create function private.snapshot_order_commission_terms_v1()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare v_rule private.restaurant_commission_rules%rowtype;
begin
  perform private.lock_restaurant_commission_v1(new.restaurant_id);
  select * into v_rule from private.restaurant_commission_rules r
  where r.restaurant_id=new.restaurant_id and r.effective_from<=new.created_at
  order by r.effective_from desc,r.id desc limit 1;
  if not found then
    if private.restaurant_earnings_enabled_v1() then
      raise log 'restaurant_earnings_v1 missing rule restaurant=% order_ref=%',
        new.restaurant_id,substr(md5(new.id),1,12);
      raise exception 'Applicable commission rule unavailable' using errcode='55000';
    end if;
    return new;
  end if;
  insert into private.order_commission_terms(order_id,restaurant_id,
    commission_rule_id,commission_rate_bps,commission_contract_version,snapshotted_at)
  values(new.id,new.restaurant_id,v_rule.id,v_rule.rate_bps,
    v_rule.commission_contract_version,statement_timestamp());
  return new;
end $$;
create trigger order_commission_terms_snapshot
after insert on public.orders for each row
execute function private.snapshot_order_commission_terms_v1();

create function private.protect_order_financial_fields_v1()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  if (new.restaurant_id,new.payment_method,new.subtotal_kurus,new.delivery_fee_kurus,
      new.service_fee_kurus,new.discount_kurus,new.tip_kurus,new.total_kurus,new.created_at)
    is distinct from
     (old.restaurant_id,old.payment_method,old.subtotal_kurus,old.delivery_fee_kurus,
      old.service_fee_kurus,old.discount_kurus,old.tip_kurus,old.total_kurus,old.created_at) then
    raise exception 'Authoritative order financial fields are immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger order_financial_fields_immutable
before update on public.orders for each row
execute function private.protect_order_financial_fields_v1();

create function private.ensure_delivered_financial_snapshot_v1(p_order_id text)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_order public.orders%rowtype;v_terms private.order_commission_terms%rowtype;
  v_existing private.delivered_order_financial_snapshots%rowtype;
  v_base bigint;v_commission bigint;v_reference text:=substr(md5(p_order_id),1,12);
begin
  select * into strict v_order from public.orders where id=p_order_id;
  if v_order.status<>'delivered' then
    raise exception 'Delivered order and timestamp required' using errcode='55000';
  end if;
  if v_order.delivered_at is null then
    if private.restaurant_earnings_enabled_v1() then
      raise log 'restaurant_earnings_v1 missing delivered timestamp restaurant=% order_ref=%',
        v_order.restaurant_id,v_reference;
      raise exception 'Delivered order and timestamp required' using errcode='55000';
    end if;
    return;
  end if;
  select * into v_terms from private.order_commission_terms where order_id=p_order_id;
  if not found then
    if private.restaurant_earnings_enabled_v1() then
      raise log 'restaurant_earnings_v1 missing terms restaurant=% order_ref=%',
        v_order.restaurant_id,v_reference;
      raise exception 'Order commission terms unavailable' using errcode='55000';
    end if;
    return;
  end if;
  if v_terms.commission_contract_version<>1 then
    raise log 'restaurant_earnings_v1 unsupported contract restaurant=% order_ref=% version=%',
      v_order.restaurant_id,v_reference,v_terms.commission_contract_version;
    raise exception 'Unsupported commission contract version' using errcode='55000';
  end if;
  v_base:=greatest(v_order.subtotal_kurus-v_order.discount_kurus,0);
  v_commission:=private.calculate_commission_kurus_v1(v_base,v_terms.commission_rate_bps);
  insert into private.delivered_order_financial_snapshots(order_id,restaurant_id,
    delivered_at,payment_method,currency_code,subtotal_kurus,discount_kurus,
    commission_base_kurus,commission_rate_bps,commission_kurus,
    restaurant_net_kurus,commission_rule_id,commission_contract_version)
  values(v_order.id,v_order.restaurant_id,v_order.delivered_at,v_order.payment_method,
    'TRY',v_order.subtotal_kurus,v_order.discount_kurus,v_base,
    v_terms.commission_rate_bps,v_commission,v_base-v_commission,
    v_terms.commission_rule_id,v_terms.commission_contract_version)
  on conflict(order_id) do nothing;
  select * into strict v_existing from private.delivered_order_financial_snapshots
  where order_id=p_order_id;
  if (v_existing.restaurant_id,v_existing.delivered_at,v_existing.payment_method,
      v_existing.currency_code,v_existing.subtotal_kurus,v_existing.discount_kurus,
      v_existing.commission_base_kurus,v_existing.commission_rate_bps,
      v_existing.commission_kurus,v_existing.restaurant_net_kurus,
      v_existing.commission_rule_id,v_existing.commission_contract_version)
    is distinct from
     (v_order.restaurant_id,v_order.delivered_at,v_order.payment_method,
      'TRY'::text,v_order.subtotal_kurus,v_order.discount_kurus,v_base,
      v_terms.commission_rate_bps,v_commission,v_base-v_commission,
      v_terms.commission_rule_id,v_terms.commission_contract_version) then
    raise log 'restaurant_earnings_v1 snapshot mismatch restaurant=% order_ref=%',
      v_order.restaurant_id,v_reference;
    raise exception 'Delivered financial snapshot mismatch' using errcode='55000';
  end if;
end $$;

create function private.snapshot_delivered_order_financials_v1()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  if new.status='delivered' and (tg_op='INSERT' or old.status<>'delivered') then
    perform private.ensure_delivered_financial_snapshot_v1(new.id);
  end if;
  return new;
end $$;
create trigger zz_delivered_order_financial_snapshot
after insert or update of status on public.orders for each row
execute function private.snapshot_delivered_order_financials_v1();

create function private.detect_restaurant_financial_integrity_v1()
returns integer language plpgsql volatile security definer set search_path='' as $$
declare v_count integer:=0;v_row record;v_fingerprint text;
begin
  if not private.restaurant_earnings_enabled_v1() then return 0; end if;
  for v_row in
    select r.id restaurant_id,null::text order_id,'missing_applicable_rule'::text alert_type
    from public.restaurants r where r.lifecycle_status='active' and r.accepting_orders
      and not exists(select 1 from private.restaurant_commission_rules c
        where c.restaurant_id=r.id and c.effective_from<=statement_timestamp())
    union all
    select o.restaurant_id,o.id,'missing_order_terms' from public.orders o
      where o.status not in('delivered','canceled') and not exists(
        select 1 from private.order_commission_terms t where t.order_id=o.id)
    union all
    select o.restaurant_id,o.id,'missing_delivered_snapshot' from public.orders o
      join private.order_commission_terms t on t.order_id=o.id
      where o.status='delivered' and not exists(
        select 1 from private.delivered_order_financial_snapshots s where s.order_id=o.id)
    union all
    select s.restaurant_id,s.order_id,'snapshot_mismatch'
      from private.delivered_order_financial_snapshots s
      join public.orders o on o.id=s.order_id
      join private.order_commission_terms t on t.order_id=s.order_id
      where s.commission_contract_version=1 and (
        s.restaurant_id,s.delivered_at,s.payment_method,s.subtotal_kurus,s.discount_kurus,
        s.commission_base_kurus,s.commission_rate_bps,s.commission_kurus,
        s.restaurant_net_kurus,s.commission_rule_id,s.commission_contract_version)
      is distinct from (
        o.restaurant_id,o.delivered_at,o.payment_method,o.subtotal_kurus,o.discount_kurus,
        greatest(o.subtotal_kurus-o.discount_kurus,0),t.commission_rate_bps,
        private.calculate_commission_kurus_v1(greatest(o.subtotal_kurus-o.discount_kurus,0),t.commission_rate_bps),
        greatest(o.subtotal_kurus-o.discount_kurus,0)-private.calculate_commission_kurus_v1(
          greatest(o.subtotal_kurus-o.discount_kurus,0),t.commission_rate_bps),
        t.commission_rule_id,t.commission_contract_version)
  loop
    v_fingerprint:=md5(v_row.alert_type||chr(31)||v_row.restaurant_id||chr(31)||coalesce(v_row.order_id,''));
    insert into private.restaurant_financial_integrity_alerts(
      restaurant_id,order_id,alert_type,fingerprint,details)
    values(v_row.restaurant_id,v_row.order_id,v_row.alert_type,v_fingerprint,
      jsonb_strip_nulls(jsonb_build_object('orderReference',
        case when v_row.order_id is null then null else substr(md5(v_row.order_id),1,12) end)))
    on conflict(fingerprint) where resolved_at is null do update set
      last_detected_at=statement_timestamp(),occurrence_count=
        private.restaurant_financial_integrity_alerts.occurrence_count+1;
    v_count:=v_count+1;
  end loop;
  update private.restaurant_financial_integrity_alerts a set resolved_at=statement_timestamp()
  where a.resolved_at is null and a.alert_type='missing_applicable_rule'
    and exists(select 1 from private.restaurant_commission_rules r
      where r.restaurant_id=a.restaurant_id and r.effective_from<=statement_timestamp());
  update private.restaurant_financial_integrity_alerts a set resolved_at=statement_timestamp()
  where a.resolved_at is null and a.alert_type='missing_order_terms'
    and exists(select 1 from private.order_commission_terms t where t.order_id=a.order_id);
  update private.restaurant_financial_integrity_alerts a set resolved_at=statement_timestamp()
  where a.resolved_at is null and a.alert_type='missing_delivered_snapshot'
    and exists(select 1 from private.delivered_order_financial_snapshots s where s.order_id=a.order_id);
  return v_count;
end $$;

create function private.set_restaurant_earnings_capability_v1(p_enabled boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_restaurant record;v_missing_rules integer;v_missing_terms integer;
  v_actor text:=private.canonical_profile_id();
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('restaurant-earnings-v1:capability',0));
  if p_enabled then
    for v_restaurant in select id from public.restaurants
      where lifecycle_status='active' and accepting_orders order by id
    loop perform private.lock_restaurant_commission_v1(v_restaurant.id); end loop;
    select count(*) into v_missing_rules from public.restaurants r
    where r.lifecycle_status='active' and r.accepting_orders and not exists(
      select 1 from private.restaurant_commission_rules c
      where c.restaurant_id=r.id and c.effective_from<=statement_timestamp());
    select count(*) into v_missing_terms from public.orders o
    where o.status not in('delivered','canceled') and not exists(
      select 1 from private.order_commission_terms t where t.order_id=o.id);
    if v_missing_rules<>0 or v_missing_terms<>0 then
      raise exception 'Restaurant earnings preflight failed: missing_rules=%, missing_terms=%',
        v_missing_rules,v_missing_terms using errcode='55000';
    end if;
  end if;
  update private.restaurant_earnings_capabilities set enabled=p_enabled,
    updated_at=statement_timestamp(),updated_by_profile_id=v_actor
  where capability='restaurant_earnings_v1';
  perform private.write_audit(v_actor,'restaurant_earnings.capability_changed_v1',
    'capability','restaurant_earnings_v1',jsonb_build_object('enabled',p_enabled));
  return jsonb_build_object('capability','restaurant_earnings_v1','enabled',p_enabled,
    'missingRules',coalesce(v_missing_rules,0),'missingTerms',coalesce(v_missing_terms,0));
end $$;

create function private.validate_earnings_range_v1(
  p_restaurant_id text,p_from date,p_to date)
returns table(reporting_timezone text,from_utc timestamptz,to_utc timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 then
    raise exception 'Earnings date range must contain 1 to 366 days' using errcode='22023';
  end if;
  select r.reporting_timezone into reporting_timezone from public.restaurants r
    where r.id=p_restaurant_id;
  if not found then raise exception 'Restaurant unavailable' using errcode='42501'; end if;
  from_utc:=p_from::timestamp at time zone reporting_timezone;
  to_utc:=(p_to+1)::timestamp at time zone reporting_timezone;
  return next;
end $$;

create function private.earnings_summary_v1(p_restaurant_id text,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_range record;v_result jsonb;
begin
  select * into v_range from private.validate_earnings_range_v1(p_restaurant_id,p_from,p_to);
  select jsonb_build_object(
    'restaurantId',p_restaurant_id,'from',p_from,'to',p_to,
    'reportingTimezone',v_range.reporting_timezone,'currencyCode','TRY',
    'eligibleGrossKurus',coalesce(sum(s.commission_base_kurus),0),
    'commissionKurus',coalesce(sum(s.commission_kurus),0),
    'estimatedNetKurus',coalesce(sum(s.restaurant_net_kurus),0),
    'deliveredOrderCount',count(s.order_id),
    'paymentBreakdown',jsonb_build_object(
      'cash',jsonb_build_object(
        'eligibleGrossKurus',coalesce(sum(s.commission_base_kurus)filter(where s.payment_method='cash'),0),
        'commissionKurus',coalesce(sum(s.commission_kurus)filter(where s.payment_method='cash'),0),
        'estimatedNetKurus',coalesce(sum(s.restaurant_net_kurus)filter(where s.payment_method='cash'),0),
        'deliveredOrderCount',count(s.order_id)filter(where s.payment_method='cash')),
      'pos',jsonb_build_object(
        'eligibleGrossKurus',coalesce(sum(s.commission_base_kurus)filter(where s.payment_method='pos'),0),
        'commissionKurus',coalesce(sum(s.commission_kurus)filter(where s.payment_method='pos'),0),
        'estimatedNetKurus',coalesce(sum(s.restaurant_net_kurus)filter(where s.payment_method='pos'),0),
        'deliveredOrderCount',count(s.order_id)filter(where s.payment_method='pos'))))
  into v_result from private.delivered_order_financial_snapshots s
  where s.restaurant_id=p_restaurant_id and s.delivered_at>=v_range.from_utc
    and s.delivered_at<v_range.to_utc;
  return v_result;
end $$;

create function private.earnings_cursor_encode_v1(p_delivered_at timestamptz,p_order_id text)
returns text language sql immutable security invoker set search_path='' as $$
  select encode(convert_to(to_char(p_delivered_at at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US')||chr(31)||p_order_id,'UTF8'),'base64')
$$;
create function private.earnings_cursor_decode_v1(p_cursor text)
returns table(delivered_at timestamptz,order_id text)
language plpgsql immutable security invoker set search_path='' as $$
declare v text;v_parts text[];
begin
  if p_cursor is null then return; end if;
  begin v:=convert_from(decode(p_cursor,'base64'),'UTF8'); exception when others then
    raise exception 'Invalid earnings cursor' using errcode='22023'; end;
  v_parts:=string_to_array(v,chr(31));
  if cardinality(v_parts)<>2 or btrim(v_parts[2])='' then
    raise exception 'Invalid earnings cursor' using errcode='22023'; end if;
  begin delivered_at:=(v_parts[1]||'Z')::timestamptz; exception when others then
    raise exception 'Invalid earnings cursor' using errcode='22023'; end;
  order_id:=v_parts[2];return next;
end $$;

create function public.admin_get_restaurant_commission_v1(p_restaurant_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_admin('admin');v_restaurant public.restaurants%rowtype;
begin
  select * into v_restaurant from public.restaurants where id=p_restaurant_id;
  if not found then raise exception 'Restaurant unavailable' using errcode='42501'; end if;
  return jsonb_build_object('restaurantId',p_restaurant_id,
    'reportingTimezone',v_restaurant.reporting_timezone,
    'capabilityEnabled',private.restaurant_earnings_enabled_v1(),
    'currentRule',(select jsonb_build_object('id',r.id,'rateBps',r.rate_bps,
      'contractVersion',r.commission_contract_version,'effectiveFrom',r.effective_from,
      'createdAt',r.created_at,'reason',r.reason)
      from private.restaurant_commission_rules r where r.restaurant_id=p_restaurant_id
        and r.effective_from<=statement_timestamp()
      order by r.effective_from desc,r.id desc limit 1),
    'nextScheduledRule',(select jsonb_build_object('id',r.id,'rateBps',r.rate_bps,
      'contractVersion',r.commission_contract_version,'effectiveFrom',r.effective_from,
      'createdAt',r.created_at,'reason',r.reason)
      from private.restaurant_commission_rules r where r.restaurant_id=p_restaurant_id
        and r.effective_from>statement_timestamp()
      order by r.effective_from,r.id limit 1),
    'history',coalesce((select jsonb_agg(x.value order by x.effective_from desc,x.id desc)
      from(select r.effective_from,r.id,jsonb_build_object('id',r.id,'rateBps',r.rate_bps,
        'contractVersion',r.commission_contract_version,'effectiveFrom',r.effective_from,
        'createdAt',r.created_at,'reason',r.reason) value
        from private.restaurant_commission_rules r where r.restaurant_id=p_restaurant_id
        order by r.effective_from desc,r.id desc limit 100)x),'[]'::jsonb),
    'historyHasMore',(select count(*)>100 from private.restaurant_commission_rules r
      where r.restaurant_id=p_restaurant_id),
    'warnings',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'type',a.alert_type,
      'details',a.details,'firstDetectedAt',a.first_detected_at,
      'lastDetectedAt',a.last_detected_at,'occurrenceCount',a.occurrence_count)
      order by a.last_detected_at desc) from(select * from private.restaurant_financial_integrity_alerts
        where restaurant_id=p_restaurant_id and resolved_at is null
        order by last_detected_at desc limit 20)a),'[]'::jsonb));
end $$;

create function public.admin_schedule_restaurant_commission_v1(
  p_restaurant_id text,p_rate_bps integer,p_effective_from timestamptz,
  p_reason text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_admin('super_admin');v_reason text:=btrim(coalesce(p_reason,''));
  v_digest text;v_existing private.restaurant_commission_rules%rowtype;
  v_restaurant public.restaurants%rowtype;v_rule private.restaurant_commission_rules%rowtype;
  v_prior integer;
begin
  perform private.require_recent_admin_auth(interval '5 minutes');
  if p_operation_id is null or p_effective_from is null or p_rate_bps not between 0 and 10000
    or length(v_reason) not between 1 and 500 then
    raise exception 'Valid commission rule input required' using errcode='22023';
  end if;
  v_digest:=encode(extensions.digest(jsonb_build_object('actor',v_actor,
    'restaurantId',p_restaurant_id,'rateBps',p_rate_bps,
    'effectiveFrom',p_effective_from,'reason',v_reason)::text,'sha256'),'hex');
  perform private.lock_restaurant_commission_v1(p_restaurant_id);
  select * into v_existing from private.restaurant_commission_rules
    where operation_id=p_operation_id;
  if found then
    if v_existing.created_by_profile_id<>v_actor or v_existing.request_sha256<>v_digest then
      raise exception 'Operation ID was already used for another request' using errcode='22023';
    end if;
    return jsonb_build_object('ruleId',v_existing.id,'restaurantId',v_existing.restaurant_id,
      'rateBps',v_existing.rate_bps,'contractVersion',v_existing.commission_contract_version,
      'effectiveFrom',v_existing.effective_from,'reason',v_existing.reason,
      'operationId',v_existing.operation_id,'replayed',true);
  end if;
  select * into v_restaurant from public.restaurants where id=p_restaurant_id;
  if not found or v_restaurant.lifecycle_status='closed' then
    raise exception 'Restaurant unavailable for commission scheduling' using errcode='42501';
  end if;
  if exists(select 1 from private.restaurant_commission_rules r
    where r.restaurant_id=p_restaurant_id and r.effective_from=p_effective_from) then
    raise exception 'Commission rule already exists at this effective time' using errcode='22023';
  end if;
  if exists(select 1 from public.orders o
    left join lateral(select r.effective_from from private.restaurant_commission_rules r
      where r.restaurant_id=o.restaurant_id and r.effective_from<=o.created_at
      order by r.effective_from desc,r.id desc limit 1) current_rule on true
    where o.restaurant_id=p_restaurant_id and o.created_at>=p_effective_from
      and(current_rule.effective_from is null or p_effective_from>current_rule.effective_from)) then
    raise exception 'Effective time would change an existing order rule' using errcode='22023';
  end if;
  select r.rate_bps into v_prior from private.restaurant_commission_rules r
    where r.restaurant_id=p_restaurant_id and r.effective_from<=statement_timestamp()
    order by r.effective_from desc,r.id desc limit 1;
  insert into private.restaurant_commission_rules(restaurant_id,rate_bps,
    commission_contract_version,effective_from,created_by_profile_id,reason,
    operation_id,request_sha256)
  values(p_restaurant_id,p_rate_bps,1,p_effective_from,v_actor,v_reason,
    p_operation_id,v_digest) returning * into v_rule;
  perform private.write_audit(v_actor,'restaurant.commission_rule_scheduled_v1',
    'restaurant_commission_rule',v_rule.id::text,jsonb_build_object(
      'restaurant_id',p_restaurant_id,'prior_rate_bps',v_prior,
      'new_rate_bps',p_rate_bps,'effective_from',p_effective_from,
      'contract_version',1,'operation_id',p_operation_id));
  return jsonb_build_object('ruleId',v_rule.id,'restaurantId',p_restaurant_id,
    'rateBps',p_rate_bps,'contractVersion',1,'effectiveFrom',p_effective_from,
    'reason',v_reason,'operationId',p_operation_id,'replayed',false);
end $$;

create function public.admin_get_restaurant_earnings_summary_v1(
  p_restaurant_id text,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_active_admin('admin');
  return private.earnings_summary_v1(p_restaurant_id,p_from,p_to);
end $$;

create function public.restaurant_get_earnings_summary_v1(p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_restaurant_owner();v_restaurant text:=private.current_restaurant_id();
begin return private.earnings_summary_v1(v_restaurant,p_from,p_to);end $$;

create function public.restaurant_get_earnings_series_v1(
  p_from date,p_to date,p_bucket text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_restaurant_owner();v_restaurant text:=private.current_restaurant_id();
  v_range record;v_result jsonb;
begin
  if p_bucket not in('day','week','month') then
    raise exception 'Supported earnings bucket required' using errcode='22023'; end if;
  select * into v_range from private.validate_earnings_range_v1(v_restaurant,p_from,p_to);
  select jsonb_build_object('restaurantId',v_restaurant,'from',p_from,'to',p_to,
    'bucket',p_bucket,'reportingTimezone',v_range.reporting_timezone,'currencyCode','TRY',
    'points',coalesce(jsonb_agg(jsonb_build_object('bucketStart',x.bucket_start,
      'eligibleGrossKurus',x.gross,'commissionKurus',x.commission,
      'estimatedNetKurus',x.net,'deliveredOrderCount',x.orders,
      'paymentBreakdown',jsonb_build_object(
        'cash',jsonb_build_object('eligibleGrossKurus',x.cash_gross,
          'commissionKurus',x.cash_commission,'estimatedNetKurus',x.cash_net,
          'deliveredOrderCount',x.cash_orders),
        'pos',jsonb_build_object('eligibleGrossKurus',x.pos_gross,
          'commissionKurus',x.pos_commission,'estimatedNetKurus',x.pos_net,
          'deliveredOrderCount',x.pos_orders)))
      order by x.bucket_start),'[]'::jsonb)) into v_result
  from(select case p_bucket
        when 'day' then date_trunc('day',s.delivered_at at time zone v_range.reporting_timezone)::date
        when 'week' then date_trunc('week',s.delivered_at at time zone v_range.reporting_timezone)::date
        else date_trunc('month',s.delivered_at at time zone v_range.reporting_timezone)::date end bucket_start,
      sum(s.commission_base_kurus) gross,sum(s.commission_kurus) commission,
      sum(s.restaurant_net_kurus) net,count(*) orders,
      coalesce(sum(s.commission_base_kurus)filter(where s.payment_method='cash'),0) cash_gross,
      coalesce(sum(s.commission_kurus)filter(where s.payment_method='cash'),0) cash_commission,
      coalesce(sum(s.restaurant_net_kurus)filter(where s.payment_method='cash'),0) cash_net,
      count(*)filter(where s.payment_method='cash') cash_orders,
      coalesce(sum(s.commission_base_kurus)filter(where s.payment_method='pos'),0) pos_gross,
      coalesce(sum(s.commission_kurus)filter(where s.payment_method='pos'),0) pos_commission,
      coalesce(sum(s.restaurant_net_kurus)filter(where s.payment_method='pos'),0) pos_net,
      count(*)filter(where s.payment_method='pos') pos_orders
    from private.delivered_order_financial_snapshots s
    where s.restaurant_id=v_restaurant and s.delivered_at>=v_range.from_utc
      and s.delivered_at<v_range.to_utc group by 1)x;
  return v_result;
end $$;

create function public.restaurant_get_earnings_orders_page_v1(
  p_from date,p_to date,p_cursor text default null,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_restaurant_owner();v_restaurant text:=private.current_restaurant_id();
  v_range record;v_cursor_time timestamptz;v_cursor_id text;
  v_limit integer:=least(greatest(coalesce(p_limit,25),1),50);v_result jsonb;
begin
  select * into v_range from private.validate_earnings_range_v1(v_restaurant,p_from,p_to);
  if p_cursor is not null then
    select c.delivered_at,c.order_id into v_cursor_time,v_cursor_id
      from private.earnings_cursor_decode_v1(p_cursor)c;
  end if;
  with rows as materialized(
    select s.* from private.delivered_order_financial_snapshots s
    where s.restaurant_id=v_restaurant and s.delivered_at>=v_range.from_utc
      and s.delivered_at<v_range.to_utc and(p_cursor is null or
        (s.delivered_at,s.order_id)<(v_cursor_time,v_cursor_id))
    order by s.delivered_at desc,s.order_id desc limit v_limit+1),
  visible as(select * from rows order by delivered_at desc,order_id desc limit v_limit)
  select jsonb_build_object('restaurantId',v_restaurant,'from',p_from,'to',p_to,
    'reportingTimezone',v_range.reporting_timezone,'currencyCode','TRY','limit',v_limit,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'orderReference',upper(substr(md5(v.order_id),1,8)),'deliveredAt',v.delivered_at,
      'paymentMethod',v.payment_method,'currencyCode',v.currency_code,
      'eligibleGrossKurus',v.commission_base_kurus,'commissionRateBps',v.commission_rate_bps,
      'commissionKurus',v.commission_kurus,'estimatedNetKurus',v.restaurant_net_kurus)
      order by v.delivered_at desc,v.order_id desc)from visible v),'[]'::jsonb),
    'nextCursor',(select case when (select count(*) from rows)>v_limit then
      private.earnings_cursor_encode_v1(v.delivered_at,v.order_id) else null end
      from visible v order by v.delivered_at,v.order_id limit 1)) into v_result;
  return v_result;
end $$;

grant create on schema public,private to hungrie_api_owner;
alter table private.restaurant_earnings_capabilities owner to hungrie_api_owner;
alter table private.restaurant_commission_rules owner to hungrie_api_owner;
alter table private.order_commission_terms owner to hungrie_api_owner;
alter table private.delivered_order_financial_snapshots owner to hungrie_api_owner;
alter table private.restaurant_financial_integrity_alerts owner to hungrie_api_owner;
alter function private.reject_financial_record_mutation_v1() owner to hungrie_api_owner;
alter function private.restaurant_earnings_enabled_v1() owner to hungrie_api_owner;
alter function private.lock_restaurant_commission_v1(text) owner to hungrie_api_owner;
alter function private.calculate_commission_kurus_v1(bigint,integer) owner to hungrie_api_owner;
alter function private.validate_restaurant_reporting_timezone_v1() owner to hungrie_api_owner;
alter function private.guard_restaurant_financial_activation_v1() owner to hungrie_api_owner;
alter function private.snapshot_order_commission_terms_v1() owner to hungrie_api_owner;
alter function private.protect_order_financial_fields_v1() owner to hungrie_api_owner;
alter function private.ensure_delivered_financial_snapshot_v1(text) owner to hungrie_api_owner;
alter function private.snapshot_delivered_order_financials_v1() owner to hungrie_api_owner;
alter function private.detect_restaurant_financial_integrity_v1() owner to hungrie_api_owner;
alter function private.set_restaurant_earnings_capability_v1(boolean) owner to hungrie_api_owner;
alter function private.validate_earnings_range_v1(text,date,date) owner to hungrie_api_owner;
alter function private.earnings_summary_v1(text,date,date) owner to hungrie_api_owner;
alter function private.earnings_cursor_encode_v1(timestamptz,text) owner to hungrie_api_owner;
alter function private.earnings_cursor_decode_v1(text) owner to hungrie_api_owner;
alter function public.admin_get_restaurant_commission_v1(text) owner to hungrie_api_owner;
alter function public.admin_schedule_restaurant_commission_v1(text,integer,timestamptz,text,uuid) owner to hungrie_api_owner;
alter function public.admin_get_restaurant_earnings_summary_v1(text,date,date) owner to hungrie_api_owner;
alter function public.restaurant_get_earnings_summary_v1(date,date) owner to hungrie_api_owner;
alter function public.restaurant_get_earnings_series_v1(date,date,text) owner to hungrie_api_owner;
alter function public.restaurant_get_earnings_orders_page_v1(date,date,text,integer) owner to hungrie_api_owner;
revoke create on schema public,private from hungrie_api_owner;

revoke all on function private.reject_financial_record_mutation_v1(),
  private.restaurant_earnings_enabled_v1(),private.lock_restaurant_commission_v1(text),
  private.calculate_commission_kurus_v1(bigint,integer),
  private.validate_restaurant_reporting_timezone_v1(),
  private.guard_restaurant_financial_activation_v1(),
  private.snapshot_order_commission_terms_v1(),private.protect_order_financial_fields_v1(),
  private.ensure_delivered_financial_snapshot_v1(text),
  private.snapshot_delivered_order_financials_v1(),
  private.detect_restaurant_financial_integrity_v1(),
  private.set_restaurant_earnings_capability_v1(boolean),
  private.validate_earnings_range_v1(text,date,date),private.earnings_summary_v1(text,date,date),
  private.earnings_cursor_encode_v1(timestamptz,text),private.earnings_cursor_decode_v1(text)
  from public,anon,authenticated,service_role;
grant execute on function private.restaurant_earnings_enabled_v1(),
  private.lock_restaurant_commission_v1(text),private.calculate_commission_kurus_v1(bigint,integer),
  private.validate_restaurant_reporting_timezone_v1(),
  private.guard_restaurant_financial_activation_v1(),private.snapshot_order_commission_terms_v1(),
  private.protect_order_financial_fields_v1(),private.ensure_delivered_financial_snapshot_v1(text),
  private.snapshot_delivered_order_financials_v1(),private.detect_restaurant_financial_integrity_v1(),
  private.set_restaurant_earnings_capability_v1(boolean),
  private.validate_earnings_range_v1(text,date,date),private.earnings_summary_v1(text,date,date),
  private.earnings_cursor_encode_v1(timestamptz,text),private.earnings_cursor_decode_v1(text)
  to hungrie_api_owner;

revoke all on function public.admin_get_restaurant_commission_v1(text),
  public.admin_schedule_restaurant_commission_v1(text,integer,timestamptz,text,uuid),
  public.admin_get_restaurant_earnings_summary_v1(text,date,date),
  public.restaurant_get_earnings_summary_v1(date,date),
  public.restaurant_get_earnings_series_v1(date,date,text),
  public.restaurant_get_earnings_orders_page_v1(date,date,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_get_restaurant_commission_v1(text),
  public.admin_schedule_restaurant_commission_v1(text,integer,timestamptz,text,uuid),
  public.admin_get_restaurant_earnings_summary_v1(text,date,date),
  public.restaurant_get_earnings_summary_v1(date,date),
  public.restaurant_get_earnings_series_v1(date,date,text),
  public.restaurant_get_earnings_orders_page_v1(date,date,text,integer)
  to authenticated;

do $jobs$
declare v_job bigint;
begin
  for v_job in select jobid from cron.job
    where jobname='hungrie-restaurant-financial-integrity' loop
    perform cron.unschedule(v_job);
  end loop;
  perform cron.schedule('hungrie-restaurant-financial-integrity','*/5 * * * *',
    'select private.detect_restaurant_financial_integrity_v1()');
end $jobs$;

comment on table private.restaurant_commission_rules is
  'Append-only Restaurant commission rules. Client access is RPC-only.';
comment on table private.order_commission_terms is
  'Immutable commission terms selected at authoritative order creation.';
comment on table private.delivered_order_financial_snapshots is
  'Immutable calculated estimates; not payouts, settlements, balances, or accounting profit.';
