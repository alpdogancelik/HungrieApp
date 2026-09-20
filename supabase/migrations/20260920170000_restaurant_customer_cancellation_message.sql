begin;

-- Legacy restaurant_transition_order_v1.p_note is an internal staff note.
-- Only messages explicitly submitted through v2 may be shown to Customers.
create table private.restaurant_customer_cancellation_messages (
  order_id text primary key references public.orders(id) on delete restrict,
  operation_id uuid not null unique,
  profile_id text not null references public.profiles(id) on delete restrict,
  message text not null check (message = btrim(message) and length(message) <= 500),
  created_at timestamptz not null default statement_timestamp()
);
alter table private.restaurant_customer_cancellation_messages enable row level security;
grant create on schema private to hungrie_api_owner;
alter table private.restaurant_customer_cancellation_messages owner to hungrie_api_owner;
revoke create on schema private from hungrie_api_owner;
revoke all on private.restaurant_customer_cancellation_messages from public, anon, authenticated, service_role;

create function public.restaurant_cancel_order_v2(
  p_order_id text,
  p_expected_version timestamptz,
  p_reason_code text,
  p_customer_message text,
  p_operation_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor text := private.require_active_restaurant();
  v_message text := btrim(coalesce(p_customer_message, ''));
  v_result jsonb;
  v_saved private.restaurant_customer_cancellation_messages%rowtype;
begin
  if p_operation_id is null or length(v_message) > 500
    or translate(v_message, E'\n\r\t', '') ~ '[[:cntrl:]]' then
    raise exception 'Invalid customer message' using errcode = '22023';
  end if;

  -- v1 still owns the Restaurant scope, state transition, status event, audit,
  -- order lock and operation replay. Its internal note is deliberately null.
  v_result := public.restaurant_transition_order_v1(
    p_order_id, p_expected_version, 'canceled', p_reason_code, null, p_operation_id);
  if v_result->>'reasonCode' = 'approval_deadline_expired' then return v_result; end if;

  insert into private.restaurant_customer_cancellation_messages(order_id, operation_id, profile_id, message)
    values(p_order_id, p_operation_id, v_actor, v_message)
    on conflict(order_id) do nothing;
  select * into v_saved from private.restaurant_customer_cancellation_messages where order_id = p_order_id;
  if v_saved.operation_id <> p_operation_id or v_saved.profile_id <> v_actor or v_saved.message <> v_message then
    raise exception 'Operation ID was already used for another request' using errcode = '22023';
  end if;
  return v_result;
end $$;

create function public.get_my_customer_order_v2(p_order_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_order jsonb;
  v_message text;
begin
  perform private.require_active_customer();
  v_order := public.get_my_customer_order_v1(p_order_id);
  if v_order is null or v_order->>'status' <> 'canceled' then return v_order; end if;
  select nullif(m.message, '') into v_message
    from private.restaurant_customer_cancellation_messages m where m.order_id = p_order_id;
  if v_message is null then return v_order; end if;
  return v_order || jsonb_build_object('restaurant_cancellation_note', v_message);
end $$;

grant create on schema public to hungrie_api_owner;
alter function public.restaurant_cancel_order_v2(text,timestamptz,text,text,uuid) owner to hungrie_api_owner;
alter function public.get_my_customer_order_v2(text) owner to hungrie_api_owner;
revoke create on schema public from hungrie_api_owner;
revoke all on function public.restaurant_cancel_order_v2(text,timestamptz,text,text,uuid),
  public.get_my_customer_order_v2(text) from public, anon, authenticated, service_role;
grant execute on function public.restaurant_cancel_order_v2(text,timestamptz,text,text,uuid),
  public.get_my_customer_order_v2(text) to authenticated;

commit;
