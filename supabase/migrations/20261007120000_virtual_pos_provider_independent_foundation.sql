-- Milestone A: provider-independent Virtual POS foundation.
-- No provider is selected and customer online payments remain hard-disabled.

create type private.virtual_pos_activation_state as enum (
  'unconfigured','sandbox_configured','sandbox_qualified','production_configured',
  'production_qualified','active','suspended'
);
create type private.virtual_pos_payment_state as enum (
  'created','checkout_pending','three_ds_pending','authorized','capture_pending',
  'captured','void_pending','voided','refund_pending','partially_refunded',
  'refunded','failed','unknown','chargeback'
);
create type private.virtual_pos_reconciliation_status as enum (
  'not_required','required','in_progress','reconciled','manual_review'
);

create table private.virtual_pos_configuration (
  singleton boolean primary key default true check(singleton),
  activation_state private.virtual_pos_activation_state not null default 'unconfigured',
  customer_available boolean not null default false,
  provider_adapter_id text,
  provider_contract_version text,
  updated_at timestamptz not null default statement_timestamp(),
  updated_by_profile_id text references public.profiles(id) on delete restrict,
  constraint virtual_pos_milestone_a_hard_disabled check(
    customer_available=false and activation_state<>'active' and provider_adapter_id is null
  )
);
insert into private.virtual_pos_configuration(singleton) values(true);

create table private.virtual_pos_commission_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  rate_bps integer not null check(rate_bps between 0 and 10000),
  financial_contract_version smallint not null default 1 check(financial_contract_version>0),
  provider_contract_version text not null check(
    provider_contract_version=btrim(provider_contract_version) and length(provider_contract_version) between 1 and 100),
  effective_from timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  created_by_profile_id text not null references public.profiles(id) on delete restrict,
  reason text not null check(reason=btrim(reason) and length(reason) between 1 and 500),
  operation_id uuid not null unique,
  request_sha256 text not null check(request_sha256~'^[0-9a-f]{64}$'),
  unique(restaurant_id,effective_from),
  unique(id,restaurant_id)
);
create index virtual_pos_commission_rules_lookup_idx
  on private.virtual_pos_commission_rules(restaurant_id,effective_from desc,id desc);

create table private.virtual_pos_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id text not null references public.profiles(id) on delete restrict,
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  currency_code text not null default 'TRY' check(currency_code='TRY'),
  amount_kurus bigint not null check(amount_kurus>=0),
  idempotency_identity uuid not null unique,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  order_id text references public.orders(id) on delete restrict,
  check(expires_at>created_at)
);

create table private.virtual_pos_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  checkout_intent_id uuid not null references private.virtual_pos_checkout_intents(id) on delete restrict,
  customer_profile_id text not null references public.profiles(id) on delete restrict,
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  provider_adapter_id text not null check(provider_adapter_id=btrim(provider_adapter_id) and length(provider_adapter_id) between 1 and 100),
  provider_contract_version text not null check(provider_contract_version=btrim(provider_contract_version) and length(provider_contract_version) between 1 and 100),
  sanitized_provider_reference text check(
    sanitized_provider_reference is null or sanitized_provider_reference~'^[A-Za-z0-9_.:-]{1,200}$'),
  idempotency_identity uuid not null unique,
  currency_code text not null default 'TRY' check(currency_code='TRY'),
  requested_amount_kurus bigint not null check(requested_amount_kurus>=0),
  authorized_amount_kurus bigint not null default 0 check(authorized_amount_kurus>=0),
  captured_amount_kurus bigint not null default 0 check(captured_amount_kurus>=0),
  refunded_amount_kurus bigint not null default 0 check(refunded_amount_kurus>=0),
  state private.virtual_pos_payment_state not null default 'created',
  reconciliation_status private.virtual_pos_reconciliation_status not null default 'not_required',
  sanitized_failure_classification text check(
    sanitized_failure_classification is null or sanitized_failure_classification~'^[a-z0-9_.:-]{1,100}$'),
  last_verified_at timestamptz,
  reconciled_at timestamptz,
  version bigint not null default 1 check(version>0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique(checkout_intent_id,id),
  check(authorized_amount_kurus<=requested_amount_kurus),
  check(captured_amount_kurus<=authorized_amount_kurus),
  check(refunded_amount_kurus<=captured_amount_kurus),
  check((state='unknown')=(reconciliation_status in('required','in_progress','manual_review')) or state<>'unknown')
);
create unique index virtual_pos_single_effective_payment_idx
  on private.virtual_pos_payment_attempts(checkout_intent_id)
  where state in('checkout_pending','three_ds_pending','authorized','capture_pending','captured',
    'void_pending','refund_pending','partially_refunded','refunded','unknown','chargeback');
create unique index virtual_pos_provider_reference_idx
  on private.virtual_pos_payment_attempts(provider_adapter_id,sanitized_provider_reference)
  where sanitized_provider_reference is not null;
create index virtual_pos_attempt_restaurant_idx
  on private.virtual_pos_payment_attempts(restaurant_id,created_at desc);
create index virtual_pos_attempt_customer_idx
  on private.virtual_pos_payment_attempts(customer_profile_id,created_at desc);

create table private.virtual_pos_payment_operations (
  operation_id uuid primary key,
  payment_attempt_id uuid not null references private.virtual_pos_payment_attempts(id) on delete restrict,
  operation_kind text not null check(operation_kind in(
    'session','callback','webhook','verify','authorize','capture','void','refund','chargeback','reconcile')),
  request_sha256 text not null check(request_sha256~'^[0-9a-f]{64}$'),
  resulting_state private.virtual_pos_payment_state not null,
  result jsonb not null check(jsonb_typeof(result)='object'),
  uncertain boolean not null default false,
  created_at timestamptz not null default statement_timestamp()
);

create table private.virtual_pos_payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references private.virtual_pos_payment_attempts(id) on delete restrict,
  operation_id uuid references private.virtual_pos_payment_operations(operation_id) on delete restrict,
  event_kind text not null check(event_kind in(
    'session_created','three_ds_pending','callback_received','webhook_received','status_verified',
    'authorized','capture_pending','captured','void_pending','voided','refund_pending',
    'partially_refunded','refunded','failed','unknown','chargeback','reconciliation_adjustment')),
  prior_state private.virtual_pos_payment_state,
  new_state private.virtual_pos_payment_state not null,
  provider_adapter_id text not null,
  provider_event_identity_sha256 text check(
    provider_event_identity_sha256 is null or provider_event_identity_sha256~'^[0-9a-f]{64}$'),
  sanitized_provider_reference text check(
    sanitized_provider_reference is null or sanitized_provider_reference~'^[A-Za-z0-9_.:-]{1,200}$'),
  sanitized_details jsonb not null default '{}'::jsonb check(
    jsonb_typeof(sanitized_details)='object' and
    not sanitized_details ?| array['pan','card_number','cvv','cvc','expiry','three_ds_password','raw_payload']),
  occurred_at timestamptz not null default statement_timestamp(),
  recorded_at timestamptz not null default statement_timestamp()
);
create unique index virtual_pos_provider_event_dedupe_idx
  on private.virtual_pos_payment_events(provider_adapter_id,provider_event_identity_sha256)
  where provider_event_identity_sha256 is not null;

create table private.virtual_pos_financial_adjustments (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references private.virtual_pos_payment_attempts(id) on delete restrict,
  adjustment_kind text not null check(adjustment_kind in(
    'refund_intent','partial_refund_intent','void_intent','chargeback','chargeback_reversal',
    'provider_fee_correction','settlement_correction','reviewed_manual_accounting_adjustment')),
  amount_kurus bigint not null check(amount_kurus>=0),
  currency_code text not null default 'TRY' check(currency_code='TRY'),
  reconciliation_status private.virtual_pos_reconciliation_status not null default 'required',
  reason text not null check(reason=btrim(reason) and length(reason) between 1 and 500),
  operation_id uuid not null unique,
  created_by_profile_id text not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp()
);

alter table private.order_commission_terms
  add column virtual_pos_commission_rule_id uuid,
  add column virtual_pos_commission_rate_bps integer not null default 0 check(virtual_pos_commission_rate_bps between 0 and 10000),
  add column financial_contract_version smallint not null default 1 check(financial_contract_version>0),
  add constraint order_virtual_pos_rule_fk foreign key(virtual_pos_commission_rule_id,restaurant_id)
    references private.virtual_pos_commission_rules(id,restaurant_id) on delete restrict,
  add constraint order_virtual_pos_terms_consistent check(
    (virtual_pos_commission_rule_id is null and virtual_pos_commission_rate_bps=0) or
    (virtual_pos_commission_rule_id is not null)
  );

alter table private.delivered_order_financial_snapshots
  drop constraint delivered_financial_snapshot_math,
  add column virtual_pos_commission_rate_bps integer not null default 0 check(virtual_pos_commission_rate_bps between 0 and 10000),
  add column virtual_pos_commission_kurus bigint not null default 0 check(virtual_pos_commission_kurus>=0),
  add column virtual_pos_commission_rule_id uuid,
  add column total_commission_kurus bigint generated always as (commission_kurus+virtual_pos_commission_kurus) stored,
  add column financial_contract_version smallint not null default 1 check(financial_contract_version>0),
  add constraint delivered_virtual_pos_rule_fk foreign key(virtual_pos_commission_rule_id,restaurant_id)
    references private.virtual_pos_commission_rules(id,restaurant_id) on delete restrict,
  add constraint delivered_financial_snapshot_math_v2 check(
    commission_base_kurus=greatest(subtotal_kurus-discount_kurus,0)
    and commission_kurus+virtual_pos_commission_kurus<=commission_base_kurus
    and restaurant_net_kurus=commission_base_kurus-commission_kurus-virtual_pos_commission_kurus
    and ((payment_method='virtual_pos' and virtual_pos_commission_rule_id is not null)
      or (payment_method<>'virtual_pos' and virtual_pos_commission_rule_id is null
        and virtual_pos_commission_rate_bps=0 and virtual_pos_commission_kurus=0))
  );

alter table private.virtual_pos_configuration enable row level security;
alter table private.virtual_pos_configuration force row level security;
alter table private.virtual_pos_commission_rules enable row level security;
alter table private.virtual_pos_commission_rules force row level security;
alter table private.virtual_pos_checkout_intents enable row level security;
alter table private.virtual_pos_checkout_intents force row level security;
alter table private.virtual_pos_payment_attempts enable row level security;
alter table private.virtual_pos_payment_attempts force row level security;
alter table private.virtual_pos_payment_operations enable row level security;
alter table private.virtual_pos_payment_operations force row level security;
alter table private.virtual_pos_payment_events enable row level security;
alter table private.virtual_pos_payment_events force row level security;
alter table private.virtual_pos_financial_adjustments enable row level security;
alter table private.virtual_pos_financial_adjustments force row level security;

revoke all on private.virtual_pos_configuration,private.virtual_pos_commission_rules,
  private.virtual_pos_checkout_intents,private.virtual_pos_payment_attempts,
  private.virtual_pos_payment_operations,private.virtual_pos_payment_events,
  private.virtual_pos_financial_adjustments from public,anon,authenticated,service_role;
grant select on private.virtual_pos_configuration to hungrie_api_owner;
grant select,insert on private.virtual_pos_commission_rules,
  private.virtual_pos_checkout_intents,private.virtual_pos_payment_operations,
  private.virtual_pos_payment_events,private.virtual_pos_financial_adjustments to hungrie_api_owner;
grant select,insert,update on private.virtual_pos_payment_attempts to hungrie_api_owner;

create policy virtual_pos_configuration_owner on private.virtual_pos_configuration
  for select to hungrie_api_owner using(true);
create policy virtual_pos_commission_rules_owner on private.virtual_pos_commission_rules
  for all to hungrie_api_owner using(true) with check(true);
create policy virtual_pos_checkout_intents_owner on private.virtual_pos_checkout_intents
  for all to hungrie_api_owner using(true) with check(true);
create policy virtual_pos_payment_attempts_owner on private.virtual_pos_payment_attempts
  for all to hungrie_api_owner using(true) with check(true);
create policy virtual_pos_payment_operations_owner on private.virtual_pos_payment_operations
  for all to hungrie_api_owner using(true) with check(true);
create policy virtual_pos_payment_events_owner on private.virtual_pos_payment_events
  for all to hungrie_api_owner using(true) with check(true);
create policy virtual_pos_financial_adjustments_owner on private.virtual_pos_financial_adjustments
  for all to hungrie_api_owner using(true) with check(true);

create trigger virtual_pos_commission_rules_immutable before update or delete
  on private.virtual_pos_commission_rules for each row execute function private.reject_financial_record_mutation_v1();
create trigger virtual_pos_checkout_intents_immutable before update or delete
  on private.virtual_pos_checkout_intents for each row execute function private.reject_financial_record_mutation_v1();
create trigger virtual_pos_payment_operations_immutable before update or delete
  on private.virtual_pos_payment_operations for each row execute function private.reject_financial_record_mutation_v1();
create trigger virtual_pos_payment_events_immutable before update or delete
  on private.virtual_pos_payment_events for each row execute function private.reject_financial_record_mutation_v1();
create trigger virtual_pos_financial_adjustments_immutable before update or delete
  on private.virtual_pos_financial_adjustments for each row execute function private.reject_financial_record_mutation_v1();

create function private.virtual_pos_customer_available_v1()
returns boolean language sql stable security definer set search_path='' as $$
  select false
$$;

create function private.reject_customer_virtual_pos_order_v1()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  if new.payment_method='virtual_pos' then
    raise exception 'Virtual POS customer payments are not available' using errcode='55000';
  end if;
  return new;
end $$;
create trigger aa_virtual_pos_customer_hard_disabled before insert on public.orders
  for each row execute function private.reject_customer_virtual_pos_order_v1();

create function private.lock_virtual_pos_commission_v1(p_restaurant_id text)
returns void language sql volatile security invoker set search_path='' as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('virtual-pos-commission-v1:'||p_restaurant_id,0))
$$;

create or replace function private.snapshot_order_commission_terms_v1()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare v_rule private.restaurant_commission_rules%rowtype;
  v_virtual_rule private.virtual_pos_commission_rules%rowtype;
begin
  perform private.lock_restaurant_commission_v1(new.restaurant_id);
  select * into v_rule from private.restaurant_commission_rules r
  where r.restaurant_id=new.restaurant_id and r.effective_from<=new.created_at
  order by r.effective_from desc,r.id desc limit 1;
  if not found then
    if private.restaurant_earnings_enabled_v1() then
      raise exception 'Applicable commission rule unavailable' using errcode='55000';
    end if;
    return new;
  end if;
  if new.payment_method='virtual_pos' then
    perform private.lock_virtual_pos_commission_v1(new.restaurant_id);
    select * into v_virtual_rule from private.virtual_pos_commission_rules r
    where r.restaurant_id=new.restaurant_id and r.effective_from<=new.created_at
    order by r.effective_from desc,r.id desc limit 1;
    if not found then raise exception 'Applicable Virtual POS commission rule unavailable' using errcode='55000'; end if;
  end if;
  insert into private.order_commission_terms(order_id,restaurant_id,commission_rule_id,
    commission_rate_bps,commission_contract_version,virtual_pos_commission_rule_id,
    virtual_pos_commission_rate_bps,financial_contract_version,snapshotted_at)
  values(new.id,new.restaurant_id,v_rule.id,v_rule.rate_bps,v_rule.commission_contract_version,
    v_virtual_rule.id,coalesce(v_virtual_rule.rate_bps,0),1,statement_timestamp());
  return new;
end $$;

create or replace function private.ensure_delivered_financial_snapshot_v1(p_order_id text)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_order public.orders%rowtype;v_terms private.order_commission_terms%rowtype;
  v_existing private.delivered_order_financial_snapshots%rowtype;
  v_base bigint;v_hungrie bigint;v_virtual bigint;v_reference text:=substr(md5(p_order_id),1,12);
begin
  select * into strict v_order from public.orders where id=p_order_id;
  if v_order.status<>'delivered' or v_order.delivered_at is null then
    if private.restaurant_earnings_enabled_v1() then raise exception 'Delivered order and timestamp required' using errcode='55000'; end if;
    return;
  end if;
  select * into v_terms from private.order_commission_terms where order_id=p_order_id;
  if not found then
    if private.restaurant_earnings_enabled_v1() then raise exception 'Order commission terms unavailable' using errcode='55000'; end if;
    return;
  end if;
  if v_terms.commission_contract_version<>1 or v_terms.financial_contract_version<>1 then
    raise exception 'Unsupported financial contract version' using errcode='55000';
  end if;
  v_base:=greatest(v_order.subtotal_kurus-v_order.discount_kurus,0);
  v_hungrie:=private.calculate_commission_kurus_v1(v_base,v_terms.commission_rate_bps);
  v_virtual:=private.calculate_commission_kurus_v1(v_base,v_terms.virtual_pos_commission_rate_bps);
  if v_hungrie+v_virtual>v_base then raise exception 'Configured commissions exceed eligible base' using errcode='55000'; end if;
  insert into private.delivered_order_financial_snapshots(order_id,restaurant_id,
    delivered_at,payment_method,currency_code,subtotal_kurus,discount_kurus,
    commission_base_kurus,commission_rate_bps,commission_kurus,restaurant_net_kurus,
    commission_rule_id,commission_contract_version,virtual_pos_commission_rate_bps,
    virtual_pos_commission_kurus,virtual_pos_commission_rule_id,financial_contract_version)
  values(v_order.id,v_order.restaurant_id,v_order.delivered_at,v_order.payment_method,
    'TRY',v_order.subtotal_kurus,v_order.discount_kurus,v_base,v_terms.commission_rate_bps,
    v_hungrie,v_base-v_hungrie-v_virtual,v_terms.commission_rule_id,
    v_terms.commission_contract_version,v_terms.virtual_pos_commission_rate_bps,
    v_virtual,v_terms.virtual_pos_commission_rule_id,v_terms.financial_contract_version)
  on conflict(order_id) do nothing;
  select * into strict v_existing from private.delivered_order_financial_snapshots where order_id=p_order_id;
  if (v_existing.restaurant_id,v_existing.delivered_at,v_existing.payment_method,
      v_existing.subtotal_kurus,v_existing.discount_kurus,v_existing.commission_base_kurus,
      v_existing.commission_rate_bps,v_existing.commission_kurus,v_existing.virtual_pos_commission_rate_bps,
      v_existing.virtual_pos_commission_kurus,v_existing.restaurant_net_kurus,
      v_existing.commission_rule_id,v_existing.virtual_pos_commission_rule_id,
      v_existing.financial_contract_version)
    is distinct from
     (v_order.restaurant_id,v_order.delivered_at,v_order.payment_method,
      v_order.subtotal_kurus,v_order.discount_kurus,v_base,v_terms.commission_rate_bps,
      v_hungrie,v_terms.virtual_pos_commission_rate_bps,v_virtual,v_base-v_hungrie-v_virtual,
      v_terms.commission_rule_id,v_terms.virtual_pos_commission_rule_id,v_terms.financial_contract_version) then
    raise exception 'Delivered financial snapshot mismatch' using errcode='55000';
  end if;
end $$;

create function private.virtual_pos_transition_allowed_v1(
  p_from private.virtual_pos_payment_state,p_to private.virtual_pos_payment_state)
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_from=p_to or p_from::text||'>'||p_to::text in(
    'created>checkout_pending','created>failed',
    'checkout_pending>three_ds_pending','checkout_pending>authorized','checkout_pending>captured','checkout_pending>failed','checkout_pending>unknown',
    'three_ds_pending>authorized','three_ds_pending>captured','three_ds_pending>failed','three_ds_pending>unknown',
    'authorized>capture_pending','authorized>void_pending','authorized>unknown',
    'capture_pending>captured','capture_pending>failed','capture_pending>unknown',
    'captured>refund_pending','captured>chargeback','captured>unknown',
    'void_pending>voided','void_pending>failed','void_pending>unknown',
    'refund_pending>partially_refunded','refund_pending>refunded','refund_pending>failed','refund_pending>unknown',
    'partially_refunded>refund_pending','partially_refunded>chargeback','partially_refunded>unknown',
    'refunded>chargeback',
    'unknown>authorized','unknown>captured','unknown>voided','unknown>partially_refunded','unknown>refunded','unknown>failed','unknown>chargeback')
$$;

create function private.apply_virtual_pos_transition_v1(
  p_payment_attempt_id uuid,p_to private.virtual_pos_payment_state,p_operation_kind text,
  p_operation_id uuid,p_request_sha256 text,p_event_kind text,
  p_sanitized_details jsonb default '{}'::jsonb,p_reconciliation boolean default false)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_attempt private.virtual_pos_payment_attempts%rowtype;
  v_existing private.virtual_pos_payment_operations%rowtype;v_result jsonb;
begin
  if p_operation_id is null or p_request_sha256!~'^[0-9a-f]{64}$' or jsonb_typeof(p_sanitized_details)<>'object'
    or p_sanitized_details ?| array['pan','card_number','cvv','cvc','expiry','three_ds_password','raw_payload'] then
    raise exception 'Invalid sanitized payment operation' using errcode='22023';
  end if;
  select * into v_existing from private.virtual_pos_payment_operations where operation_id=p_operation_id;
  if found then
    if v_existing.payment_attempt_id<>p_payment_attempt_id or v_existing.operation_kind<>p_operation_kind or v_existing.request_sha256<>p_request_sha256 then
      raise exception 'Payment operation ID reused' using errcode='22023';
    end if;
    return v_existing.result||jsonb_build_object('replayed',true);
  end if;
  select * into strict v_attempt from private.virtual_pos_payment_attempts where id=p_payment_attempt_id for update;
  if v_attempt.state='unknown' and not p_reconciliation then
    raise exception 'Unknown payment must be reconciled before retry' using errcode='55000';
  end if;
  if p_reconciliation and v_attempt.state<>'unknown' then
    raise exception 'Reconciliation requires unknown payment state' using errcode='55000';
  end if;
  if not private.virtual_pos_transition_allowed_v1(v_attempt.state,p_to) then
    raise exception 'Invalid payment state transition: % -> %',v_attempt.state,p_to using errcode='55000';
  end if;
  update private.virtual_pos_payment_attempts set state=p_to,
    reconciliation_status=case when p_to='unknown' then 'required'::private.virtual_pos_reconciliation_status
      when p_reconciliation then 'reconciled'::private.virtual_pos_reconciliation_status else reconciliation_status end,
    reconciled_at=case when p_reconciliation then statement_timestamp() else reconciled_at end,
    last_verified_at=case when p_reconciliation then statement_timestamp() else last_verified_at end,
    version=version+1,updated_at=statement_timestamp() where id=p_payment_attempt_id;
  v_result:=jsonb_build_object('paymentAttemptId',p_payment_attempt_id,'state',p_to,
    'version',v_attempt.version+1,'replayed',false,'reconciliationRequired',p_to='unknown');
  insert into private.virtual_pos_payment_operations(operation_id,payment_attempt_id,
    operation_kind,request_sha256,resulting_state,result,uncertain)
  values(p_operation_id,p_payment_attempt_id,p_operation_kind,p_request_sha256,p_to,v_result,p_to='unknown');
  insert into private.virtual_pos_payment_events(payment_attempt_id,operation_id,event_kind,
    prior_state,new_state,provider_adapter_id,sanitized_provider_reference,sanitized_details)
  values(p_payment_attempt_id,p_operation_id,p_event_kind,v_attempt.state,p_to,
    v_attempt.provider_adapter_id,v_attempt.sanitized_provider_reference,p_sanitized_details);
  return v_result;
end $$;

create function public.admin_get_virtual_pos_foundation_v1(p_restaurant_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_admin('admin');v_config private.virtual_pos_configuration%rowtype;
begin
  if not exists(select 1 from public.restaurants where id=p_restaurant_id) then raise exception 'Restaurant unavailable' using errcode='42501'; end if;
  select * into strict v_config from private.virtual_pos_configuration where singleton;
  return jsonb_build_object('restaurantId',p_restaurant_id,'activationState',v_config.activation_state,
    'customerAvailable',false,'providerConfigured',false,
    'currentRule',(select jsonb_build_object('id',r.id,'rateBps',r.rate_bps,
      'financialContractVersion',r.financial_contract_version,'providerContractVersion',r.provider_contract_version,
      'effectiveFrom',r.effective_from,'createdAt',r.created_at,'reason',r.reason)
      from private.virtual_pos_commission_rules r where r.restaurant_id=p_restaurant_id and r.effective_from<=statement_timestamp()
      order by r.effective_from desc,r.id desc limit 1),
    'nextScheduledRule',(select jsonb_build_object('id',r.id,'rateBps',r.rate_bps,
      'financialContractVersion',r.financial_contract_version,'providerContractVersion',r.provider_contract_version,
      'effectiveFrom',r.effective_from,'createdAt',r.created_at,'reason',r.reason)
      from private.virtual_pos_commission_rules r where r.restaurant_id=p_restaurant_id and r.effective_from>statement_timestamp()
      order by r.effective_from,r.id limit 1),
    'history',coalesce((select jsonb_agg(x.value order by x.effective_from desc,x.id desc) from(
      select r.effective_from,r.id,jsonb_build_object('id',r.id,'rateBps',r.rate_bps,
        'financialContractVersion',r.financial_contract_version,'providerContractVersion',r.provider_contract_version,
        'effectiveFrom',r.effective_from,'createdAt',r.created_at,'reason',r.reason)value
      from private.virtual_pos_commission_rules r where r.restaurant_id=p_restaurant_id
      order by r.effective_from desc,r.id desc limit 100)x),'[]'::jsonb),
    'historyHasMore',(select count(*)>100 from private.virtual_pos_commission_rules where restaurant_id=p_restaurant_id));
end $$;

create function public.admin_schedule_virtual_pos_commission_v1(
  p_restaurant_id text,p_rate_bps integer,p_effective_from timestamptz,
  p_provider_contract_version text,p_reason text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_admin('super_admin');v_reason text:=btrim(coalesce(p_reason,''));
  v_contract text:=btrim(coalesce(p_provider_contract_version,''));v_digest text;
  v_existing private.virtual_pos_commission_rules%rowtype;v_rule private.virtual_pos_commission_rules%rowtype;
begin
  perform private.require_recent_admin_auth(interval '5 minutes');
  if p_operation_id is null or p_effective_from is null or p_rate_bps not between 0 and 10000
    or length(v_reason) not between 1 and 500 or length(v_contract) not between 1 and 100 then
    raise exception 'Valid Virtual POS commission rule input required' using errcode='22023';
  end if;
  v_digest:=encode(extensions.digest(jsonb_build_object('actor',v_actor,'restaurantId',p_restaurant_id,
    'rateBps',p_rate_bps,'effectiveFrom',p_effective_from,'providerContractVersion',v_contract,
    'reason',v_reason)::text,'sha256'),'hex');
  perform private.lock_virtual_pos_commission_v1(p_restaurant_id);
  select * into v_existing from private.virtual_pos_commission_rules where operation_id=p_operation_id;
  if found then
    if v_existing.created_by_profile_id<>v_actor or v_existing.request_sha256<>v_digest then
      raise exception 'Operation ID was already used for another request' using errcode='22023'; end if;
    return jsonb_build_object('ruleId',v_existing.id,'restaurantId',v_existing.restaurant_id,
      'rateBps',v_existing.rate_bps,'financialContractVersion',v_existing.financial_contract_version,
      'providerContractVersion',v_existing.provider_contract_version,'effectiveFrom',v_existing.effective_from,
      'reason',v_existing.reason,'operationId',v_existing.operation_id,'replayed',true);
  end if;
  if not exists(select 1 from public.restaurants where id=p_restaurant_id and lifecycle_status<>'closed') then
    raise exception 'Restaurant unavailable for commission scheduling' using errcode='42501'; end if;
  if exists(select 1 from private.virtual_pos_commission_rules where restaurant_id=p_restaurant_id and effective_from=p_effective_from) then
    raise exception 'Virtual POS commission rule already exists at this effective time' using errcode='22023'; end if;
  if exists(select 1 from public.orders where restaurant_id=p_restaurant_id and payment_method='virtual_pos' and created_at>=p_effective_from) then
    raise exception 'Effective time would change an existing order rule' using errcode='22023'; end if;
  insert into private.virtual_pos_commission_rules(restaurant_id,rate_bps,financial_contract_version,
    provider_contract_version,effective_from,created_by_profile_id,reason,operation_id,request_sha256)
  values(p_restaurant_id,p_rate_bps,1,v_contract,p_effective_from,v_actor,v_reason,p_operation_id,v_digest)
  returning * into v_rule;
  perform private.write_audit(v_actor,'restaurant.virtual_pos_commission_rule_scheduled_v1',
    'virtual_pos_commission_rule',v_rule.id::text,jsonb_build_object('restaurant_id',p_restaurant_id,
      'rate_bps',p_rate_bps,'effective_from',p_effective_from,'financial_contract_version',1,
      'provider_contract_version',v_contract,'operation_id',p_operation_id));
  return jsonb_build_object('ruleId',v_rule.id,'restaurantId',p_restaurant_id,'rateBps',p_rate_bps,
    'financialContractVersion',1,'providerContractVersion',v_contract,'effectiveFrom',p_effective_from,
    'reason',v_reason,'operationId',p_operation_id,'replayed',false);
end $$;

grant create on schema public,private to hungrie_api_owner;
alter table private.virtual_pos_configuration owner to hungrie_api_owner;
alter table private.virtual_pos_commission_rules owner to hungrie_api_owner;
alter table private.virtual_pos_checkout_intents owner to hungrie_api_owner;
alter table private.virtual_pos_payment_attempts owner to hungrie_api_owner;
alter table private.virtual_pos_payment_operations owner to hungrie_api_owner;
alter table private.virtual_pos_payment_events owner to hungrie_api_owner;
alter table private.virtual_pos_financial_adjustments owner to hungrie_api_owner;
alter function private.virtual_pos_customer_available_v1() owner to hungrie_api_owner;
alter function private.reject_customer_virtual_pos_order_v1() owner to hungrie_api_owner;
alter function private.lock_virtual_pos_commission_v1(text) owner to hungrie_api_owner;
alter function private.snapshot_order_commission_terms_v1() owner to hungrie_api_owner;
alter function private.ensure_delivered_financial_snapshot_v1(text) owner to hungrie_api_owner;
alter function private.virtual_pos_transition_allowed_v1(private.virtual_pos_payment_state,private.virtual_pos_payment_state) owner to hungrie_api_owner;
alter function private.apply_virtual_pos_transition_v1(uuid,private.virtual_pos_payment_state,text,uuid,text,text,jsonb,boolean) owner to hungrie_api_owner;
alter function public.admin_get_virtual_pos_foundation_v1(text) owner to hungrie_api_owner;
alter function public.admin_schedule_virtual_pos_commission_v1(text,integer,timestamptz,text,text,uuid) owner to hungrie_api_owner;
revoke create on schema public,private from hungrie_api_owner;

revoke all on function private.virtual_pos_customer_available_v1(),
  private.reject_customer_virtual_pos_order_v1(),private.lock_virtual_pos_commission_v1(text),
  private.virtual_pos_transition_allowed_v1(private.virtual_pos_payment_state,private.virtual_pos_payment_state),
  private.apply_virtual_pos_transition_v1(uuid,private.virtual_pos_payment_state,text,uuid,text,text,jsonb,boolean)
  from public,anon,authenticated,service_role;
grant execute on function private.virtual_pos_customer_available_v1(),
  private.reject_customer_virtual_pos_order_v1(),private.lock_virtual_pos_commission_v1(text),
  private.virtual_pos_transition_allowed_v1(private.virtual_pos_payment_state,private.virtual_pos_payment_state),
  private.apply_virtual_pos_transition_v1(uuid,private.virtual_pos_payment_state,text,uuid,text,text,jsonb,boolean)
  to hungrie_api_owner;
revoke all on function public.admin_get_virtual_pos_foundation_v1(text),
  public.admin_schedule_virtual_pos_commission_v1(text,integer,timestamptz,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_get_virtual_pos_foundation_v1(text),
  public.admin_schedule_virtual_pos_commission_v1(text,integer,timestamptz,text,text,uuid)
  to authenticated;

comment on table private.virtual_pos_configuration is
  'Milestone A fail-closed state. The schema constraint forbids customer availability and active state.';
comment on table private.virtual_pos_payment_attempts is
  'Server-authoritative provider-neutral attempts. No cardholder data or raw provider payloads.';
comment on table private.virtual_pos_payment_events is
  'Immutable sanitized payment event ledger; raw provider bodies are forbidden.';
comment on table private.virtual_pos_commission_rules is
  'Append-only configured Restaurant Virtual POS deductions, distinct from actual provider fees.';
comment on column private.delivered_order_financial_snapshots.virtual_pos_commission_kurus is
  'Configured estimated Restaurant deduction; not an actual provider fee or settlement amount.';

-- V2 earnings projections preserve v1 for existing clients while exposing the
-- two independent deductions and the dormant virtual_pos breakdown.
create function private.earnings_summary_v2(p_restaurant_id text,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_range record;v_result jsonb;
begin
  select * into v_range from private.validate_earnings_range_v1(p_restaurant_id,p_from,p_to);
  select jsonb_build_object('restaurantId',p_restaurant_id,'from',p_from,'to',p_to,
    'reportingTimezone',v_range.reporting_timezone,'currencyCode','TRY',
    'eligibleGrossKurus',coalesce(sum(s.commission_base_kurus),0),
    'hungrieCommissionKurus',coalesce(sum(s.commission_kurus),0),
    'virtualPosCommissionKurus',coalesce(sum(s.virtual_pos_commission_kurus),0),
    'totalDeductionsKurus',coalesce(sum(s.total_commission_kurus),0),
    'estimatedNetKurus',coalesce(sum(s.restaurant_net_kurus),0),'deliveredOrderCount',count(s.order_id),
    'providerFeesReconciled',false,
    'paymentBreakdown',jsonb_build_object(
      'cash',jsonb_build_object('eligibleGrossKurus',coalesce(sum(s.commission_base_kurus)filter(where s.payment_method='cash'),0),'hungrieCommissionKurus',coalesce(sum(s.commission_kurus)filter(where s.payment_method='cash'),0),'virtualPosCommissionKurus',0,'totalDeductionsKurus',coalesce(sum(s.commission_kurus)filter(where s.payment_method='cash'),0),'estimatedNetKurus',coalesce(sum(s.restaurant_net_kurus)filter(where s.payment_method='cash'),0),'deliveredOrderCount',count(s.order_id)filter(where s.payment_method='cash')),
      'pos',jsonb_build_object('eligibleGrossKurus',coalesce(sum(s.commission_base_kurus)filter(where s.payment_method='pos'),0),'hungrieCommissionKurus',coalesce(sum(s.commission_kurus)filter(where s.payment_method='pos'),0),'virtualPosCommissionKurus',0,'totalDeductionsKurus',coalesce(sum(s.commission_kurus)filter(where s.payment_method='pos'),0),'estimatedNetKurus',coalesce(sum(s.restaurant_net_kurus)filter(where s.payment_method='pos'),0),'deliveredOrderCount',count(s.order_id)filter(where s.payment_method='pos')),
      'virtual_pos',jsonb_build_object('eligibleGrossKurus',coalesce(sum(s.commission_base_kurus)filter(where s.payment_method='virtual_pos'),0),'hungrieCommissionKurus',coalesce(sum(s.commission_kurus)filter(where s.payment_method='virtual_pos'),0),'virtualPosCommissionKurus',coalesce(sum(s.virtual_pos_commission_kurus)filter(where s.payment_method='virtual_pos'),0),'totalDeductionsKurus',coalesce(sum(s.total_commission_kurus)filter(where s.payment_method='virtual_pos'),0),'estimatedNetKurus',coalesce(sum(s.restaurant_net_kurus)filter(where s.payment_method='virtual_pos'),0),'deliveredOrderCount',count(s.order_id)filter(where s.payment_method='virtual_pos'))))
  into v_result from private.delivered_order_financial_snapshots s
  where s.restaurant_id=p_restaurant_id and s.delivered_at>=v_range.from_utc and s.delivered_at<v_range.to_utc;
  return v_result;
end $$;

create function public.restaurant_get_earnings_summary_v2(p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_restaurant_owner();v_restaurant text:=private.current_restaurant_id();
begin return private.earnings_summary_v2(v_restaurant,p_from,p_to);end $$;

create function public.restaurant_get_earnings_series_v2(p_from date,p_to date,p_bucket text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_restaurant_owner();v_restaurant text:=private.current_restaurant_id();v_range record;v_result jsonb;
begin
  if p_bucket not in('day','week','month') then raise exception 'Supported earnings bucket required' using errcode='22023'; end if;
  select * into v_range from private.validate_earnings_range_v1(v_restaurant,p_from,p_to);
  select jsonb_build_object('restaurantId',v_restaurant,'from',p_from,'to',p_to,'bucket',p_bucket,
    'reportingTimezone',v_range.reporting_timezone,'currencyCode','TRY','points',coalesce(jsonb_agg(
      jsonb_build_object('bucketStart',x.bucket_start,'eligibleGrossKurus',x.gross,
        'hungrieCommissionKurus',x.hungrie,'virtualPosCommissionKurus',x.virtual_pos,
        'totalDeductionsKurus',x.hungrie+x.virtual_pos,'estimatedNetKurus',x.net,
        'deliveredOrderCount',x.orders) order by x.bucket_start),'[]'::jsonb)) into v_result
  from(select case p_bucket when 'day' then date_trunc('day',s.delivered_at at time zone v_range.reporting_timezone)::date
      when 'week' then date_trunc('week',s.delivered_at at time zone v_range.reporting_timezone)::date
      else date_trunc('month',s.delivered_at at time zone v_range.reporting_timezone)::date end bucket_start,
      sum(s.commission_base_kurus) gross,sum(s.commission_kurus) hungrie,
      sum(s.virtual_pos_commission_kurus) virtual_pos,sum(s.restaurant_net_kurus) net,count(*) orders
    from private.delivered_order_financial_snapshots s where s.restaurant_id=v_restaurant
      and s.delivered_at>=v_range.from_utc and s.delivered_at<v_range.to_utc group by 1)x;
  return v_result;
end $$;

create function public.restaurant_get_earnings_orders_page_v2(
  p_from date,p_to date,p_cursor text default null,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_restaurant_owner();v_restaurant text:=private.current_restaurant_id();
  v_range record;v_cursor_time timestamptz;v_cursor_id text;v_limit integer:=least(greatest(coalesce(p_limit,25),1),50);v_result jsonb;
begin
  select * into v_range from private.validate_earnings_range_v1(v_restaurant,p_from,p_to);
  if p_cursor is not null then select c.delivered_at,c.order_id into v_cursor_time,v_cursor_id from private.earnings_cursor_decode_v1(p_cursor)c; end if;
  with rows as materialized(select s.* from private.delivered_order_financial_snapshots s
    where s.restaurant_id=v_restaurant and s.delivered_at>=v_range.from_utc and s.delivered_at<v_range.to_utc
      and(p_cursor is null or(s.delivered_at,s.order_id)<(v_cursor_time,v_cursor_id))
    order by s.delivered_at desc,s.order_id desc limit v_limit+1),
  visible as(select * from rows order by delivered_at desc,order_id desc limit v_limit)
  select jsonb_build_object('restaurantId',v_restaurant,'from',p_from,'to',p_to,
    'reportingTimezone',v_range.reporting_timezone,'currencyCode','TRY','limit',v_limit,
    'items',coalesce((select jsonb_agg(jsonb_build_object('orderReference',upper(substr(md5(v.order_id),1,8)),
      'deliveredAt',v.delivered_at,'paymentMethod',v.payment_method,'currencyCode',v.currency_code,
      'eligibleGrossKurus',v.commission_base_kurus,'hungrieRateBps',v.commission_rate_bps,
      'hungrieCommissionKurus',v.commission_kurus,'virtualPosRateBps',v.virtual_pos_commission_rate_bps,
      'virtualPosCommissionKurus',v.virtual_pos_commission_kurus,'totalDeductionsKurus',v.total_commission_kurus,
      'estimatedNetKurus',v.restaurant_net_kurus,'providerFeesReconciled',false)
      order by v.delivered_at desc,v.order_id desc)from visible v),'[]'::jsonb),
    'nextCursor',(select case when(select count(*)from rows)>v_limit then private.earnings_cursor_encode_v1(v.delivered_at,v.order_id) else null end from visible v order by v.delivered_at,v.order_id limit 1)) into v_result;
  return v_result;
end $$;

grant create on schema public,private to hungrie_api_owner;
alter function private.earnings_summary_v2(text,date,date) owner to hungrie_api_owner;
alter function public.restaurant_get_earnings_summary_v2(date,date) owner to hungrie_api_owner;
alter function public.restaurant_get_earnings_series_v2(date,date,text) owner to hungrie_api_owner;
alter function public.restaurant_get_earnings_orders_page_v2(date,date,text,integer) owner to hungrie_api_owner;
revoke create on schema public,private from hungrie_api_owner;
revoke all on function private.earnings_summary_v2(text,date,date),
  public.restaurant_get_earnings_summary_v2(date,date),public.restaurant_get_earnings_series_v2(date,date,text),
  public.restaurant_get_earnings_orders_page_v2(date,date,text,integer) from public,anon,authenticated,service_role;
grant execute on function private.earnings_summary_v2(text,date,date) to hungrie_api_owner;
grant execute on function public.restaurant_get_earnings_summary_v2(date,date),
  public.restaurant_get_earnings_series_v2(date,date,text),public.restaurant_get_earnings_orders_page_v2(date,date,text,integer) to authenticated;

create function private.virtual_pos_details_contain_sensitive_key_v1(p_value jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare v_key text;v_child jsonb;
begin
  if jsonb_typeof(p_value)='object' then
    for v_key,v_child in select key,value from jsonb_each(p_value) loop
      if lower(v_key) in('pan','card_number','cardnumber','cvv','cvc','expiry','expiration',
        'three_ds_password','3ds_password','challenge_content','raw_payload','raw_body')
        or private.virtual_pos_details_contain_sensitive_key_v1(v_child) then return true; end if;
    end loop;
  elsif jsonb_typeof(p_value)='array' then
    for v_child in select value from jsonb_array_elements(p_value) loop
      if private.virtual_pos_details_contain_sensitive_key_v1(v_child) then return true; end if;
    end loop;
  end if;
  return false;
end $$;
alter table private.virtual_pos_payment_events add constraint virtual_pos_event_no_sensitive_nested_keys
  check(not private.virtual_pos_details_contain_sensitive_key_v1(sanitized_details));
grant create on schema private to hungrie_api_owner;
alter function private.virtual_pos_details_contain_sensitive_key_v1(jsonb) owner to hungrie_api_owner;
revoke create on schema private from hungrie_api_owner;
revoke all on function private.virtual_pos_details_contain_sensitive_key_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.virtual_pos_details_contain_sensitive_key_v1(jsonb) to hungrie_api_owner;
