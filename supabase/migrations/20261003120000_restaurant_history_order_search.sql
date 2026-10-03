create function public.restaurant_list_orders_v2(
  p_queue text default 'active',
  p_cursor text default null,
  p_limit integer default 25,
  p_search text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_restaurant text:=private.current_restaurant_id();
  v_statuses public.order_status[];
  v_limit integer:=least(greatest(coalesce(p_limit,25),1),50);
  v_search text:=upper(regexp_replace(btrim(coalesce(p_search,'')),'[#[:space:]-]','','g'));
  v_created_at timestamptz;
  v_id text;
  v_ids text[];
begin
  perform private.require_active_restaurant();
  if p_queue='active' then
    v_statuses:=array['pending','preparing','ready','out_for_delivery']::public.order_status[];
  elsif p_queue='history' then
    v_statuses:=array['delivered','canceled']::public.order_status[];
  else
    raise exception 'Unsupported order queue' using errcode='22023';
  end if;
  if length(v_search)>64 or v_search !~ '^[0-9A-Z]*$' then
    raise exception 'Invalid order search' using errcode='22023';
  end if;
  if p_cursor is not null then
    select d.created_at,d.id into v_created_at,v_id from private.decode_order_cursor(p_cursor)d;
  end if;
  select array_agg(x.id order by x.created_at desc,x.id desc) into v_ids from(
    select o.id,o.created_at from public.orders o
    where o.restaurant_id=v_restaurant
      and o.status=any(v_statuses)
      and (v_search='' or upper(replace(o.id,'-','')) like '%'||v_search||'%')
      and (p_cursor is null or(o.created_at,o.id)<(v_created_at,v_id))
    order by o.created_at desc,o.id desc limit v_limit+1
  )x;
  return private.order_page_result(v_ids,v_limit);
end $$;

alter function public.restaurant_list_orders_v2(text,text,integer,text) owner to hungrie_api_owner;
revoke all on function public.restaurant_list_orders_v2(text,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.restaurant_list_orders_v2(text,text,integer,text) to authenticated;
