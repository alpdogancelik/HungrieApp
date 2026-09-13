-- Customer-facing v2 pricing contract for Phase 5 menu definitions. Legacy
-- quote/create functions remain untouched until the Customer app adopts v2.

create table private.customer_order_operations(
  operation_id uuid primary key,
  profile_id text not null references public.profiles(id) on delete restrict,
  request_digest text not null,
  order_id text not null references public.orders(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp()
);
alter table private.customer_order_operations enable row level security;
revoke all on private.customer_order_operations from public,anon,authenticated;

create function private.build_order_quote_v2(p_restaurant_id text,p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_restaurant public.restaurants%rowtype;v_request jsonb;v_menu public.menu_items%rowtype;
  v_quantity integer;v_option_ids text[];v_removed_ids text[];v_unknown text[];v_group record;
  v_selected integer;v_delta bigint;v_subtotal bigint:=0;v_lines jsonb:='[]';v_snapshot jsonb;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then
    raise exception 'One to 100 order items are required' using errcode='22023';end if;
  select * into v_restaurant from public.restaurants where id=p_restaurant_id and lifecycle_status='active' and accepting_orders;
  if not found then raise exception 'Restaurant is not accepting orders' using errcode='22023';end if;
  if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'menuItemId')from jsonb_array_elements(p_items))then
    raise exception 'Duplicate menu items are not allowed' using errcode='22023';end if;
  for v_request in select value from jsonb_array_elements(p_items)loop
    select array_agg(key)into v_unknown from jsonb_object_keys(v_request)key
      where key not in('menuItemId','quantity','optionValueIds','removedIngredientIds');
    if v_unknown is not null or jsonb_typeof(v_request)<>'object' or coalesce(v_request->>'quantity','')!~'^[1-9][0-9]*$'
      or jsonb_typeof(coalesce(v_request->'optionValueIds','[]'))<>'array'
      or jsonb_typeof(coalesce(v_request->'removedIngredientIds','[]'))<>'array' then
      raise exception 'Order items accept IDs and quantities only' using errcode='22023';end if;
    v_quantity:=(v_request->>'quantity')::integer;if v_quantity>99 then raise exception 'Invalid item quantity' using errcode='22023';end if;
    select * into v_menu from public.menu_items where id=v_request->>'menuItemId' and restaurant_id=p_restaurant_id and is_active;
    if not found then raise exception 'Menu item unavailable' using errcode='22023';end if;
    select coalesce(array_agg(value),array[]::text[])into v_option_ids from jsonb_array_elements_text(coalesce(v_request->'optionValueIds','[]'));
    select coalesce(array_agg(value),array[]::text[])into v_removed_ids from jsonb_array_elements_text(coalesce(v_request->'removedIngredientIds','[]'));
    if cardinality(v_option_ids)<>(select count(distinct x)from unnest(v_option_ids)x)
      or cardinality(v_removed_ids)<>(select count(distinct x)from unnest(v_removed_ids)x)then
      raise exception 'Duplicate selections are not allowed' using errcode='22023';end if;
    if exists(select 1 from unnest(v_option_ids)x left join public.menu_option_values o on o.id=x and o.restaurant_id=p_restaurant_id and o.is_active
      left join public.menu_option_groups g on g.id=o.group_id and g.menu_item_id=v_menu.id and g.is_active where g.id is null)then
      raise exception 'Invalid menu option selection' using errcode='22023';end if;
    if exists(select 1 from unnest(v_removed_ids)x left join public.menu_item_ingredients i on i.id=x and i.menu_item_id=v_menu.id and i.restaurant_id=p_restaurant_id and i.is_active and i.removable where i.id is null)then
      raise exception 'Ingredient cannot be removed' using errcode='22023';end if;
    for v_group in select id,name,kind,minimum_selections,maximum_selections from public.menu_option_groups
      where menu_item_id=v_menu.id and restaurant_id=p_restaurant_id and is_active loop
      select count(*)into v_selected from public.menu_option_values where group_id=v_group.id and id=any(v_option_ids)and is_active;
      if v_selected<v_group.minimum_selections or v_selected>v_group.maximum_selections then
        raise exception 'Menu option selection count is invalid' using errcode='22023';end if;
    end loop;
    select coalesce(sum(price_delta_kurus),0)into v_delta from public.menu_option_values where id=any(v_option_ids);
    v_snapshot:=jsonb_build_object('menuDefinitionRevision',v_menu.definition_revision,
      'ingredients',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'removed',i.id=any(v_removed_ids))order by i.sort_order,i.id)
        from public.menu_item_ingredients i where i.menu_item_id=v_menu.id and i.is_active),'[]'),
      'optionGroups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'kind',g.kind,
        'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'priceDeltaKurus',o.price_delta_kurus)order by o.sort_order,o.id)
          from public.menu_option_values o where o.group_id=g.id and o.id=any(v_option_ids)),'[]'))order by g.sort_order,g.id)
        from public.menu_option_groups g where g.menu_item_id=v_menu.id and g.is_active),'[]'));
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('menu_item_id',v_menu.id,'name',v_menu.name,'image_url',v_menu.image_url,
      'unit_price_kurus',v_menu.price_kurus,'customization_total_kurus',v_delta,'quantity',v_quantity,'customizations',jsonb_build_array(v_snapshot)));
    v_subtotal:=v_subtotal+((v_menu.price_kurus+v_delta)*v_quantity);
  end loop;
  if v_subtotal<v_restaurant.minimum_order_kurus then raise exception 'Minimum order amount not reached' using errcode='22023';end if;
  return jsonb_build_object('restaurant_id',p_restaurant_id,'items',v_lines,'subtotal_kurus',v_subtotal,
    'delivery_fee_kurus',v_restaurant.delivery_fee_kurus,'service_fee_kurus',0,'discount_kurus',0,'tip_kurus',0,
    'total_kurus',v_subtotal+v_restaurant.delivery_fee_kurus);
end $$;

create function public.quote_order_v2(p_restaurant_id text,p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_active_customer();return private.build_order_quote_v2(p_restaurant_id,p_items);end $$;

create function public.create_order_v2(p_restaurant_id text,p_address_id text,p_payment_method public.payment_method,
  p_items jsonb,p_notes text default '',p_operation_id uuid default gen_random_uuid())
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_customer();v_profile public.profiles%rowtype;v_address public.addresses%rowtype;
 v_restaurant public.restaurants%rowtype;v_quote jsonb;v_item jsonb;v_order text:=gen_random_uuid()::text;v_digest text;v_existing text;
begin
  if p_operation_id is null or length(btrim(coalesce(p_notes,'')))>500 then raise exception 'Invalid order request' using errcode='22023';end if;
  v_digest:=encode(extensions.digest(concat_ws(':',p_restaurant_id,p_address_id,p_payment_method,p_items::text,btrim(coalesce(p_notes,''))),'sha256'),'hex');
  select order_id into v_existing from private.customer_order_operations where operation_id=p_operation_id and profile_id=v_actor and request_digest=v_digest;
  if found then return jsonb_build_object('orderId',v_existing,'replayed',true);end if;
  if exists(select 1 from private.customer_order_operations where operation_id=p_operation_id)then raise exception 'Operation ID reused' using errcode='22023';end if;
  select * into strict v_profile from public.profiles where id=v_actor;
  select * into v_address from public.addresses where id=p_address_id and profile_id=v_actor;if not found then raise exception 'Delivery address not found'using errcode='42501';end if;
  select * into strict v_restaurant from public.restaurants where id=p_restaurant_id;
  v_quote:=private.build_order_quote_v2(p_restaurant_id,p_items);
  insert into public.orders(id,profile_id,restaurant_id,status,payment_method,notes,subtotal_kurus,delivery_fee_kurus,
    service_fee_kurus,discount_kurus,tip_kurus,total_kurus,eta_minutes,approval_deadline_at)
  values(v_order,v_actor,p_restaurant_id,'pending',p_payment_method,btrim(coalesce(p_notes,'')),
    (v_quote->>'subtotal_kurus')::bigint,(v_quote->>'delivery_fee_kurus')::bigint,0,0,0,(v_quote->>'total_kurus')::bigint,
    v_restaurant.delivery_eta_max_minutes,statement_timestamp()+interval'5 minutes');
  insert into private.order_contacts(order_id,customer_name,customer_email,customer_whatsapp,delivery_address_snapshot)
  values(v_order,v_profile.name,v_profile.email,v_profile.whatsapp_number,jsonb_strip_nulls(jsonb_build_object('id',v_address.id,'label',v_address.label,
    'line1',v_address.line1,'block',v_address.block,'room',v_address.room,'city',v_address.city,'country',v_address.country)));
  for v_item in select value from jsonb_array_elements(v_quote->'items')loop
    insert into public.order_items(id,order_id,menu_item_id,name_snapshot,image_url_snapshot,unit_price_kurus,customization_total_kurus,quantity,customizations_snapshot)
    values(gen_random_uuid()::text,v_order,v_item->>'menu_item_id',v_item->>'name',v_item->>'image_url',(v_item->>'unit_price_kurus')::bigint,
      (v_item->>'customization_total_kurus')::bigint,(v_item->>'quantity')::integer,v_item->'customizations');
  end loop;
  insert into private.order_status_history(order_id,previous_status,new_status,changed_by_profile_id,source)values(v_order,null,'pending',v_actor,'customer');
  insert into private.customer_order_operations(operation_id,profile_id,request_digest,order_id)values(p_operation_id,v_actor,v_digest,v_order);
  perform private.write_audit(v_actor,'order.created_v2','order',v_order,jsonb_build_object('restaurant_id',p_restaurant_id,'operation_id',p_operation_id));
  return jsonb_build_object('orderId',v_order,'replayed',false);
end $$;

grant create on schema public,private to hungrie_api_owner;
alter table private.customer_order_operations owner to hungrie_api_owner;
alter function private.build_order_quote_v2(text,jsonb) owner to hungrie_api_owner;
alter function public.quote_order_v2(text,jsonb) owner to hungrie_api_owner;
alter function public.create_order_v2(text,text,public.payment_method,jsonb,text,uuid) owner to hungrie_api_owner;
revoke create on schema public,private from hungrie_api_owner;
revoke all on function private.build_order_quote_v2(text,jsonb) from public,anon,authenticated;
revoke all on function public.quote_order_v2(text,jsonb),public.create_order_v2(text,text,public.payment_method,jsonb,text,uuid) from public,anon;
grant execute on function public.quote_order_v2(text,jsonb),public.create_order_v2(text,text,public.payment_method,jsonb,text,uuid) to authenticated;
