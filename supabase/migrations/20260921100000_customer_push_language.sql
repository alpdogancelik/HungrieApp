-- A Customer's push language follows the language selected on that device.
-- Existing tokens without a language retain the profile-language fallback.
create function public.register_my_customer_push_token_v2(
  p_token text,
  p_platform public.notification_platform,
  p_preferred_language text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_active_customer();
  v_token_id text;
begin
  if p_preferred_language is null or p_preferred_language not in ('en', 'tr') then
    raise exception 'Invalid push language' using errcode = '22023';
  end if;

  v_token_id := public.register_my_push_token(p_token, p_platform);
  update private.push_tokens
  set preferred_language = p_preferred_language
  where id = v_token_id and profile_id = v_actor and restaurant_id is null;
  if not found then
    raise exception 'Push registration failed' using errcode = '42501';
  end if;
  return v_token_id;
end $$;

grant create on schema public to hungrie_api_owner;
alter function public.register_my_customer_push_token_v2(text, public.notification_platform, text)
  owner to hungrie_api_owner;
revoke create on schema public from hungrie_api_owner;
revoke all on function public.register_my_customer_push_token_v2(text, public.notification_platform, text)
  from public, anon, authenticated, service_role;
grant execute on function public.register_my_customer_push_token_v2(text, public.notification_platform, text)
  to authenticated;

create or replace function public.claim_notification_deliveries(p_limit integer default 100)
returns table(
  delivery_id uuid,event_id uuid,event_type text,order_id text,review_id text,
  expected_status public.order_status,token text,platform public.notification_platform,
  preferred_language text,restaurant_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.materialize_notification_deliveries();
  return query
  with candidates as (
    select d.id from private.notification_deliveries d
    join private.notification_events e on e.id=d.event_id
    join private.push_tokens t on t.id=d.token_id
      and t.is_active and t.revoked_at is null and t.provider='expo'
    join public.profiles p on p.id=t.profile_id
      and p.deleted_at is null and p.deletion_pending_at is null
    where d.state in ('pending','processing') and d.next_attempt_at<=statement_timestamp()
      and (d.claim_until is null or d.claim_until<statement_timestamp())
      and private.notification_event_is_current(e)
    order by d.next_attempt_at,d.created_at
    for update of d skip locked limit least(greatest(p_limit,1),100)
  ), claimed as (
    update private.notification_deliveries d set state='processing',attempts=attempts+1,
      claim_until=statement_timestamp()+interval '90 seconds'
    from candidates c where d.id=c.id returning d.*
  )
  select d.id,e.id,e.event_type,e.order_id,e.review_id,e.expected_status,t.token,t.platform,
    coalesce(t.preferred_language,p.preferred_language,'en'),r.name
  from claimed d join private.notification_events e on e.id=d.event_id
  join private.push_tokens t on t.id=d.token_id and t.is_active and t.revoked_at is null
  left join public.orders o on o.id=e.order_id
  left join public.restaurants r on r.id=o.restaurant_id
  left join public.product_reviews pr on pr.id=e.review_id
  left join public.profiles p on p.id=t.profile_id;
end $$;
