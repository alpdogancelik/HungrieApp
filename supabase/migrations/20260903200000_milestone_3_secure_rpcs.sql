-- Milestone 3: secured, audited mutation interfaces.

grant select, insert, update on public.profiles, public.restaurants,
  public.categories, public.menu_items, public.addresses, public.favorites,
  public.orders, public.order_items, public.product_reviews, public.order_reviews
  to hungrie_api_owner;
grant delete on public.favorites to hungrie_api_owner;
grant select, insert, update, delete on private.user_roles,
  private.restaurant_members, private.restaurant_couriers to hungrie_api_owner;
grant select, insert, update on private.order_contacts to hungrie_api_owner;
grant select, insert on private.order_status_history, private.audit_log
  to hungrie_api_owner;

create or replace function private.require_profile()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result text := private.current_profile_id();
begin
  if result is null then
    raise exception 'No application profile is mapped to this authenticated identity'
      using errcode = '42501';
  end if;
  return result;
end
$$;

create or replace function private.write_audit(
  p_actor text,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.audit_log (
    actor_profile_id, action, target_type, target_id, metadata
  ) values (
    p_actor, p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb)
  )
$$;

create or replace function private.valid_customizations(p_value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_typeof(coalesce(p_value, '[]'::jsonb)) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_value, '[]'::jsonb)) item
      where jsonb_typeof(item) <> 'object'
        or btrim(coalesce(item ->> 'id', '')) = ''
        or btrim(coalesce(item ->> 'name', '')) = ''
        or coalesce(item ->> 'price_kurus', '') !~ '^[0-9]+$'
    )
    and (
      select count(*) = count(distinct item ->> 'id')
      from jsonb_array_elements(coalesce(p_value, '[]'::jsonb)) item
    )
$$;

create or replace function private.build_order_quote(
  p_restaurant_id text,
  p_items jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_restaurant public.restaurants%rowtype;
  v_line jsonb;
  v_menu public.menu_items%rowtype;
  v_custom_ids jsonb;
  v_custom_id text;
  v_custom jsonb;
  v_custom_total bigint;
  v_quantity integer;
  v_subtotal bigint := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 50 then
    raise exception 'Order items must be an array containing 1 to 50 lines'
      using errcode = '22023';
  end if;

  select * into v_restaurant
  from public.restaurants r
  where r.id = p_restaurant_id and r.is_active;
  if not found then
    raise exception 'Restaurant is unavailable' using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_line) <> 'object'
       or btrim(coalesce(v_line ->> 'menu_item_id', '')) = ''
       or coalesce(v_line ->> 'quantity', '') !~ '^[0-9]+$' then
      raise exception 'Each order line requires a menu_item_id and integer quantity'
        using errcode = '22023';
    end if;
    v_quantity := (v_line ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'Order item quantity must be between 1 and 99'
        using errcode = '22023';
    end if;

    v_custom_ids := coalesce(v_line -> 'customization_ids', '[]'::jsonb);
    if jsonb_typeof(v_custom_ids) <> 'array'
       or exists (
         select 1 from jsonb_array_elements(v_custom_ids) x
         where jsonb_typeof(x) <> 'string'
       )
       or (select count(*) <> count(distinct value #>> '{}') from jsonb_array_elements(v_custom_ids)) then
      raise exception 'customization_ids must be an array of unique strings'
        using errcode = '22023';
    end if;

    select m.* into v_menu
    from public.menu_items m
    join public.categories c
      on c.id = m.category_id and c.restaurant_id = m.restaurant_id
    where m.id = v_line ->> 'menu_item_id'
      and m.restaurant_id = p_restaurant_id
      and m.is_active and c.is_active;
    if not found then
      raise exception 'Menu item is unavailable for this restaurant'
        using errcode = '22023';
    end if;
    if not private.valid_customizations(v_menu.customizations) then
      raise exception 'Menu item has an invalid customization definition'
        using errcode = '22023';
    end if;

    v_custom_total := 0;
    v_custom := '[]'::jsonb;
    for v_custom_id in
      select value #>> '{}' from jsonb_array_elements(v_custom_ids)
    loop
      select option into v_line
      from jsonb_array_elements(v_menu.customizations) option
      where option ->> 'id' = v_custom_id;
      if not found then
        raise exception 'Unknown customization for menu item'
          using errcode = '22023';
      end if;
      v_custom_total := v_custom_total + (v_line ->> 'price_kurus')::bigint;
      v_custom := v_custom || jsonb_build_array(v_line);
    end loop;

    v_subtotal := v_subtotal + ((v_menu.price_kurus + v_custom_total) * v_quantity);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'menu_item_id', v_menu.id,
      'name', v_menu.name,
      'image_url', v_menu.image_url,
      'unit_price_kurus', v_menu.price_kurus,
      'customization_total_kurus', v_custom_total,
      'quantity', v_quantity,
      'customizations', v_custom
    ));
  end loop;

  if v_subtotal < v_restaurant.minimum_order_kurus then
    raise exception 'Order does not meet the restaurant minimum'
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'restaurant_id', v_restaurant.id,
    'items', v_items,
    'subtotal_kurus', v_subtotal,
    'delivery_fee_kurus', v_restaurant.delivery_fee_kurus,
    'service_fee_kurus', 0,
    'discount_kurus', 0,
    'tip_kurus', 0,
    'total_kurus', v_subtotal + v_restaurant.delivery_fee_kurus
  );
end
$$;

alter function private.require_profile() owner to hungrie_api_owner;
alter function private.write_audit(text, text, text, text, jsonb) owner to hungrie_api_owner;
alter function private.build_order_quote(text, jsonb) owner to hungrie_api_owner;
grant execute on function private.current_profile_id(), private.request_jwt(),
  private.jwt_is_authenticated(), private.firebase_subject(), private.is_admin(),
  private.has_platform_role(public.platform_role),
  private.is_restaurant_member(text), private.is_restaurant_owner(text),
  private.is_restaurant_courier(text), private.can_access_order(text),
  private.valid_customizations(jsonb)
  to hungrie_api_owner;

create or replace function public.ensure_my_profile(
  p_name text,
  p_avatar_url text default null,
  p_whatsapp_number text default null,
  p_preferred_language text default 'en'
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := private.request_jwt();
  v_firebase_uid text := private.firebase_subject();
  v_supabase_uid uuid;
  v_subject text := v_claims ->> 'sub';
  v_email text := lower(btrim(coalesce(v_claims ->> 'email', '')));
  v_profile_id text;
begin
  if not private.jwt_is_authenticated() or btrim(coalesce(v_subject, '')) = '' then
    raise exception 'Authenticated identity required' using errcode = '42501';
  end if;
  if v_email = '' or btrim(coalesce(p_name, '')) = ''
     or p_preferred_language not in ('en', 'tr') then
    raise exception 'A valid name, email claim, and language are required'
      using errcode = '22023';
  end if;
  if length(btrim(p_name)) > 120
     or length(coalesce(p_whatsapp_number, '')) > 40
     or length(coalesce(p_avatar_url, '')) > 2048 then
    raise exception 'Profile input exceeds its allowed length' using errcode = '22023';
  end if;

  if v_firebase_uid is not null then
    select id into v_profile_id from public.profiles where firebase_uid = v_firebase_uid;
  elsif v_subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_supabase_uid := v_subject::uuid;
    select id into v_profile_id from public.profiles where supabase_user_id = v_supabase_uid;
  else
    raise exception 'Untrusted identity issuer or subject' using errcode = '42501';
  end if;

  if v_profile_id is null then
    v_profile_id := v_subject;
    insert into public.profiles (
      id, firebase_uid, supabase_user_id, name, email, avatar_url,
      whatsapp_number, preferred_language
    ) values (
      v_profile_id, v_firebase_uid, v_supabase_uid, btrim(p_name), v_email,
      nullif(btrim(coalesce(p_avatar_url, '')), ''),
      nullif(btrim(coalesce(p_whatsapp_number, '')), ''), p_preferred_language
    );
    perform private.write_audit(v_profile_id, 'profile.created', 'profile', v_profile_id);
  else
    update public.profiles
    set name = btrim(p_name), email = v_email,
        avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), ''),
        whatsapp_number = nullif(btrim(coalesce(p_whatsapp_number, '')), ''),
        preferred_language = p_preferred_language
    where id = v_profile_id;
  end if;
  return v_profile_id;
end
$$;

create or replace function public.set_default_address(p_address_id text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
begin
  perform 1 from public.addresses
    where id = p_address_id and profile_id = v_actor for update;
  if not found then
    raise exception 'Address not found' using errcode = '42501';
  end if;
  update public.addresses set is_default = false
    where profile_id = v_actor and is_default and id <> p_address_id;
  update public.addresses set is_default = true where id = p_address_id;
  perform private.write_audit(v_actor, 'address.default_changed', 'address', p_address_id);
end
$$;

create or replace function public.quote_order(p_restaurant_id text, p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_profile();
  return private.build_order_quote(p_restaurant_id, p_items);
end
$$;

create or replace function public.create_order(
  p_restaurant_id text,
  p_address_id text,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_notes text default ''
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_profile public.profiles%rowtype;
  v_address public.addresses%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_quote jsonb;
  v_item jsonb;
  v_order_id text := gen_random_uuid()::text;
begin
  if length(btrim(coalesce(p_notes, ''))) > 500 then
    raise exception 'Order notes cannot exceed 500 characters' using errcode = '22023';
  end if;
  select * into strict v_profile from public.profiles where id = v_actor;
  select * into v_address from public.addresses
    where id = p_address_id and profile_id = v_actor;
  if not found then
    raise exception 'Delivery address not found' using errcode = '42501';
  end if;
  select * into strict v_restaurant from public.restaurants where id = p_restaurant_id;
  v_quote := private.build_order_quote(p_restaurant_id, p_items);

  insert into public.orders (
    id, profile_id, restaurant_id, status, payment_method, notes,
    subtotal_kurus, delivery_fee_kurus, service_fee_kurus,
    discount_kurus, tip_kurus, total_kurus, eta_minutes,
    approval_deadline_at
  ) values (
    v_order_id, v_actor, p_restaurant_id, 'pending', p_payment_method,
    btrim(coalesce(p_notes, '')),
    (v_quote ->> 'subtotal_kurus')::bigint,
    (v_quote ->> 'delivery_fee_kurus')::bigint, 0, 0, 0,
    (v_quote ->> 'total_kurus')::bigint,
    v_restaurant.delivery_eta_max_minutes,
    statement_timestamp() + interval '5 minutes'
  );

  insert into private.order_contacts (
    order_id, customer_name, customer_email, customer_whatsapp,
    delivery_address_snapshot
  ) values (
    v_order_id, v_profile.name, v_profile.email, v_profile.whatsapp_number,
    jsonb_strip_nulls(jsonb_build_object(
      'id', v_address.id, 'label', v_address.label, 'line1', v_address.line1,
      'block', v_address.block, 'room', v_address.room, 'city', v_address.city,
      'country', v_address.country
    ))
  );

  for v_item in select value from jsonb_array_elements(v_quote -> 'items')
  loop
    insert into public.order_items (
      id, order_id, menu_item_id, name_snapshot, image_url_snapshot,
      unit_price_kurus, customization_total_kurus, quantity,
      customizations_snapshot
    ) values (
      gen_random_uuid()::text, v_order_id, v_item ->> 'menu_item_id',
      v_item ->> 'name', v_item ->> 'image_url',
      (v_item ->> 'unit_price_kurus')::bigint,
      (v_item ->> 'customization_total_kurus')::bigint,
      (v_item ->> 'quantity')::integer, v_item -> 'customizations'
    );
  end loop;

  insert into private.order_status_history (
    order_id, previous_status, new_status, changed_by_profile_id, source
  ) values (v_order_id, null, 'pending', v_actor, 'customer');
  perform private.write_audit(v_actor, 'order.created', 'order', v_order_id,
    jsonb_build_object('restaurant_id', p_restaurant_id));
  return v_order_id;
end
$$;

create or replace function public.request_order_reminder(p_order_id text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.profile_id <> v_actor or v_order.status <> 'pending' then
    raise exception 'Reminder is not allowed for this order' using errcode = '42501';
  end if;
  if v_order.reminder_requested_at is not null
     and v_order.reminder_requested_at > statement_timestamp() - interval '60 seconds' then
    raise exception 'Please wait before requesting another reminder' using errcode = '22023';
  end if;
  update public.orders set
    reminder_pending = true,
    reminder_requested_at = statement_timestamp(),
    reminder_requested_by = v_actor,
    reminder_source = 'customer'
  where id = p_order_id;
  perform private.write_audit(v_actor, 'order.reminder_requested', 'order', p_order_id);
end
$$;

create or replace function public.transition_order(
  p_order_id text,
  p_new_status public.order_status,
  p_reason text default null
)
returns public.order_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_order public.orders%rowtype;
  v_allowed boolean := false;
  v_source text;
begin
  if length(coalesce(p_reason, '')) > 500 then
    raise exception 'Transition reason is too long' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status in ('delivered', 'canceled') or v_order.status = p_new_status then
    raise exception 'Invalid order transition' using errcode = '22023';
  end if;

  if private.is_admin() then
    v_source := 'admin';
    v_allowed := (v_order.status, p_new_status) in (
      ('pending', 'preparing'), ('pending', 'canceled'),
      ('preparing', 'ready'), ('preparing', 'canceled'),
      ('ready', 'out_for_delivery'), ('ready', 'canceled'),
      ('out_for_delivery', 'delivered'), ('out_for_delivery', 'canceled')
    );
    if v_order.status = 'ready' and p_new_status = 'out_for_delivery'
       and v_order.courier_profile_id is null then
      v_allowed := false;
    end if;
  elsif v_order.profile_id = v_actor then
    v_source := 'customer';
    v_allowed := v_order.status = 'pending' and p_new_status = 'canceled';
  elsif private.is_restaurant_member(v_order.restaurant_id) then
    v_source := 'restaurant';
    v_allowed := (v_order.status, p_new_status) in (
      ('pending', 'preparing'), ('pending', 'canceled'),
      ('preparing', 'ready'), ('preparing', 'canceled'),
      ('ready', 'canceled')
    );
  elsif v_order.courier_profile_id = v_actor
        and private.is_restaurant_courier(v_order.restaurant_id) then
    v_source := 'courier';
    v_allowed := v_order.status = 'out_for_delivery' and p_new_status = 'delivered';
  end if;

  if not v_allowed then
    raise exception 'Caller is not allowed to perform this transition'
      using errcode = '42501';
  end if;

  update public.orders set
    status = p_new_status,
    reminder_pending = false,
    preparing_at = case when p_new_status = 'preparing' and preparing_at is null
      then statement_timestamp() else preparing_at end,
    ready_at = case when p_new_status = 'ready' and ready_at is null
      then statement_timestamp() else ready_at end,
    out_for_delivery_at = case when p_new_status = 'out_for_delivery' and out_for_delivery_at is null
      then statement_timestamp() else out_for_delivery_at end,
    delivered_at = case when p_new_status = 'delivered' and delivered_at is null
      then statement_timestamp() else delivered_at end,
    canceled_at = case when p_new_status = 'canceled' and canceled_at is null
      then statement_timestamp() else canceled_at end
  where id = p_order_id;

  insert into private.order_status_history (
    order_id, previous_status, new_status, changed_by_profile_id, source, reason
  ) values (p_order_id, v_order.status, p_new_status, v_actor, v_source,
    nullif(btrim(coalesce(p_reason, '')), ''));
  perform private.write_audit(v_actor, 'order.transitioned', 'order', p_order_id,
    jsonb_build_object('from', v_order.status, 'to', p_new_status, 'source', v_source));
  return p_new_status;
end
$$;

create or replace function public.claim_delivery(p_order_id text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status <> 'ready' or v_order.courier_profile_id is not null
     or not private.is_restaurant_courier(v_order.restaurant_id) then
    raise exception 'Delivery is unavailable to this courier' using errcode = '42501';
  end if;
  update public.orders set courier_profile_id = v_actor,
    status = 'out_for_delivery', out_for_delivery_at = statement_timestamp(),
    reminder_pending = false
  where id = p_order_id;
  insert into private.order_status_history (
    order_id, previous_status, new_status, changed_by_profile_id, source
  ) values (p_order_id, 'ready', 'out_for_delivery', v_actor, 'courier');
  perform private.write_audit(v_actor, 'delivery.claimed', 'order', p_order_id,
    jsonb_build_object('restaurant_id', v_order.restaurant_id));
  return p_order_id;
end
$$;

create or replace function public.submit_product_review(
  p_order_id text,
  p_menu_item_id text,
  p_rating smallint,
  p_comment text default ''
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
  v_item public.order_items%rowtype;
  v_id text := gen_random_uuid()::text;
begin
  if p_rating not between 1 and 5 or length(btrim(coalesce(p_comment, ''))) > 500 then
    raise exception 'Invalid review rating or comment' using errcode = '22023';
  end if;
  select * into v_order from public.orders
    where id = p_order_id and profile_id = v_actor and status = 'delivered';
  if not found then
    raise exception 'A delivered customer order is required' using errcode = '42501';
  end if;
  select * into v_item from public.order_items
    where order_id = p_order_id and menu_item_id = p_menu_item_id limit 1;
  if not found then
    raise exception 'Menu item is not part of this order' using errcode = '22023';
  end if;
  select * into strict v_profile from public.profiles where id = v_actor;
  insert into public.product_reviews (
    id, review_key, order_id, restaurant_id, menu_item_id, profile_id,
    user_name_snapshot, menu_item_name_snapshot, rating, comment
  ) values (
    v_id, p_order_id || '__' || p_menu_item_id || '__' || v_actor,
    p_order_id, v_order.restaurant_id, p_menu_item_id, v_actor,
    v_profile.name, v_item.name_snapshot, p_rating, btrim(coalesce(p_comment, ''))
  );
  perform private.write_audit(v_actor, 'product_review.submitted', 'product_review', v_id,
    jsonb_build_object('restaurant_id', v_order.restaurant_id));
  return v_id;
end
$$;

create or replace function public.submit_order_review(
  p_order_id text,
  p_speed_rating smallint,
  p_taste_rating smallint,
  p_value_rating smallint,
  p_price_performance_rating smallint default null,
  p_comment text default ''
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_items jsonb;
  v_id text := gen_random_uuid()::text;
begin
  if p_speed_rating not between 1 and 5 or p_taste_rating not between 1 and 5
     or p_value_rating not between 1 and 5
     or (p_price_performance_rating is not null and p_price_performance_rating not between 1 and 5)
     or length(btrim(coalesce(p_comment, ''))) > 500 then
    raise exception 'Invalid review ratings or comment' using errcode = '22023';
  end if;
  select * into v_order from public.orders
    where id = p_order_id and profile_id = v_actor and status = 'delivered';
  if not found then
    raise exception 'A delivered customer order is required' using errcode = '42501';
  end if;
  select * into strict v_profile from public.profiles where id = v_actor;
  select * into strict v_restaurant from public.restaurants where id = v_order.restaurant_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'menu_item_id', oi.menu_item_id, 'name', oi.name_snapshot,
    'quantity', oi.quantity, 'unit_price_kurus', oi.unit_price_kurus,
    'customizations', oi.customizations_snapshot
  ) order by oi.created_at, oi.id), '[]'::jsonb)
  into v_items from public.order_items oi where oi.order_id = p_order_id;
  insert into public.order_reviews (
    id, review_key, order_id, restaurant_id, profile_id,
    user_name_snapshot, restaurant_name_snapshot, speed_rating, taste_rating,
    value_rating, price_performance_rating, comment, items_snapshot
  ) values (
    v_id, p_order_id || '__' || v_actor, p_order_id, v_order.restaurant_id,
    v_actor, v_profile.name, v_restaurant.name, p_speed_rating, p_taste_rating,
    p_value_rating, p_price_performance_rating, btrim(coalesce(p_comment, '')), v_items
  );
  perform private.write_audit(v_actor, 'order_review.submitted', 'order_review', v_id,
    jsonb_build_object('restaurant_id', v_order.restaurant_id));
  return v_id;
end
$$;

create or replace function public.moderate_review(
  p_review_type text,
  p_review_id text,
  p_status public.review_status,
  p_reply text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_restaurant_id text;
begin
  if length(coalesce(p_reply, '')) > 500 then
    raise exception 'Review reply cannot exceed 500 characters' using errcode = '22023';
  end if;
  if p_review_type = 'product' then
    select restaurant_id into v_restaurant_id from public.product_reviews where id = p_review_id;
  elsif p_review_type = 'order' then
    if p_reply is not null then
      raise exception 'Order reviews do not support replies' using errcode = '22023';
    end if;
    select restaurant_id into v_restaurant_id from public.order_reviews where id = p_review_id;
  else
    raise exception 'Unknown review type' using errcode = '22023';
  end if;
  if v_restaurant_id is null
     or (not private.is_restaurant_member(v_restaurant_id) and not private.is_admin()) then
    raise exception 'Review moderation is not allowed' using errcode = '42501';
  end if;
  if p_review_type = 'product' then
    update public.product_reviews set status = p_status,
      reply = nullif(btrim(coalesce(p_reply, '')), ''),
      replied_at = case when nullif(btrim(coalesce(p_reply, '')), '') is null
        then null else statement_timestamp() end
    where id = p_review_id;
  else
    update public.order_reviews set status = p_status where id = p_review_id;
  end if;
  perform private.write_audit(v_actor, 'review.moderated', p_review_type || '_review', p_review_id,
    jsonb_build_object('status', p_status, 'restaurant_id', v_restaurant_id));
end
$$;

create or replace function public.set_restaurant_member(
  p_restaurant_id text,
  p_profile_id text,
  p_role public.restaurant_role default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_super boolean := private.has_platform_role('super_admin');
  v_existing public.restaurant_role;
begin
  perform 1 from public.restaurants where id = p_restaurant_id;
  if not found then raise exception 'Restaurant not found' using errcode = '22023'; end if;
  perform 1 from public.profiles where id = p_profile_id;
  if not found then raise exception 'Profile not found' using errcode = '22023'; end if;
  select role into v_existing from private.restaurant_members
    where restaurant_id = p_restaurant_id and profile_id = p_profile_id for update;

  if not v_super then
    if not private.is_restaurant_owner(p_restaurant_id)
       or p_role = 'owner' or v_existing = 'owner' or p_profile_id = v_actor then
      raise exception 'Only super-admins may manage owners; owners may manage other managers'
        using errcode = '42501';
    end if;
  end if;
  if p_role is null then
    if v_existing = 'owner' and (
      select count(*) from private.restaurant_members
      where restaurant_id = p_restaurant_id and role = 'owner'
    ) <= 1 then
      raise exception 'The last restaurant owner cannot be removed' using errcode = '22023';
    end if;
    delete from private.restaurant_members
      where restaurant_id = p_restaurant_id and profile_id = p_profile_id;
  else
    insert into private.restaurant_members (restaurant_id, profile_id, role)
    values (p_restaurant_id, p_profile_id, p_role)
    on conflict (restaurant_id, profile_id) do update set role = excluded.role;
  end if;
  perform private.write_audit(v_actor, 'restaurant.member_changed', 'restaurant', p_restaurant_id,
    jsonb_build_object('member_profile_id', p_profile_id, 'role', p_role));
end
$$;

create or replace function public.set_restaurant_courier(
  p_restaurant_id text,
  p_profile_id text,
  p_enabled boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
begin
  if not private.is_restaurant_owner(p_restaurant_id)
     and not private.has_platform_role('super_admin') then
    raise exception 'Courier scope management is not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from private.user_roles
    where profile_id = p_profile_id and role = 'courier'
  ) then
    raise exception 'Profile does not have the courier platform role' using errcode = '22023';
  end if;
  if p_enabled then
    insert into private.restaurant_couriers (restaurant_id, profile_id)
    values (p_restaurant_id, p_profile_id) on conflict do nothing;
  else
    delete from private.restaurant_couriers
      where restaurant_id = p_restaurant_id and profile_id = p_profile_id;
  end if;
  perform private.write_audit(v_actor, 'restaurant.courier_scope_changed', 'restaurant', p_restaurant_id,
    jsonb_build_object('courier_profile_id', p_profile_id, 'enabled', p_enabled));
end
$$;

create or replace function public.set_platform_role(
  p_profile_id text,
  p_role public.platform_role,
  p_enabled boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
begin
  if not private.has_platform_role('super_admin') then
    raise exception 'Super-admin role required' using errcode = '42501';
  end if;
  if p_enabled then
    insert into private.user_roles(profile_id, role)
    values (p_profile_id, p_role) on conflict do nothing;
  else
    if p_role = 'super_admin' and (
      select count(*) from private.user_roles where role = 'super_admin'
    ) <= 1 then
      raise exception 'The last super-admin cannot be removed' using errcode = '22023';
    end if;
    delete from private.user_roles where profile_id = p_profile_id and role = p_role;
    if p_role = 'courier' then
      delete from private.restaurant_couriers where profile_id = p_profile_id;
    end if;
  end if;
  perform private.write_audit(v_actor, 'platform.role_changed', 'profile', p_profile_id,
    jsonb_build_object('role', p_role, 'enabled', p_enabled));
end
$$;

create or replace function public.update_restaurant_details(
  p_restaurant_id text,
  p_changes jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_unknown text[];
begin
  if not private.is_restaurant_member(p_restaurant_id) and not private.is_admin() then
    raise exception 'Restaurant access required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Restaurant changes must be an object' using errcode = '22023';
  end if;
  select array_agg(key) into v_unknown from jsonb_object_keys(p_changes) key
    where key not in (
      'name', 'description', 'cuisine', 'address', 'phone', 'image_url',
      'is_active', 'delivery_eta_min_minutes', 'delivery_eta_max_minutes',
      'delivery_fee_kurus', 'minimum_order_kurus', 'opening_hours', 'preferred_language'
    );
  if v_unknown is not null then
    raise exception 'Restaurant changes contain unsupported fields' using errcode = '22023';
  end if;
  update public.restaurants r set
    name = case when p_changes ? 'name' then btrim(p_changes ->> 'name') else r.name end,
    description = case when p_changes ? 'description' then coalesce(p_changes ->> 'description', '') else r.description end,
    cuisine = case when p_changes ? 'cuisine' then coalesce(p_changes ->> 'cuisine', '') else r.cuisine end,
    address = case when p_changes ? 'address' then coalesce(p_changes ->> 'address', '') else r.address end,
    phone = case when p_changes ? 'phone' then nullif(btrim(coalesce(p_changes ->> 'phone', '')), '') else r.phone end,
    image_url = case when p_changes ? 'image_url' then nullif(btrim(coalesce(p_changes ->> 'image_url', '')), '') else r.image_url end,
    is_active = case when p_changes ? 'is_active' then (p_changes ->> 'is_active')::boolean else r.is_active end,
    delivery_eta_min_minutes = case when p_changes ? 'delivery_eta_min_minutes' then (p_changes ->> 'delivery_eta_min_minutes')::integer else r.delivery_eta_min_minutes end,
    delivery_eta_max_minutes = case when p_changes ? 'delivery_eta_max_minutes' then (p_changes ->> 'delivery_eta_max_minutes')::integer else r.delivery_eta_max_minutes end,
    delivery_fee_kurus = case when p_changes ? 'delivery_fee_kurus' then (p_changes ->> 'delivery_fee_kurus')::bigint else r.delivery_fee_kurus end,
    minimum_order_kurus = case when p_changes ? 'minimum_order_kurus' then (p_changes ->> 'minimum_order_kurus')::bigint else r.minimum_order_kurus end,
    opening_hours = case when p_changes ? 'opening_hours' then p_changes -> 'opening_hours' else r.opening_hours end,
    preferred_language = case when p_changes ? 'preferred_language' then p_changes ->> 'preferred_language' else r.preferred_language end
  where r.id = p_restaurant_id;
  if not found then raise exception 'Restaurant not found' using errcode = '22023'; end if;
  perform private.write_audit(v_actor, 'restaurant.updated', 'restaurant', p_restaurant_id,
    jsonb_build_object('fields', (select jsonb_agg(key) from jsonb_object_keys(p_changes) key)));
end
$$;

create or replace function public.upsert_category(
  p_restaurant_id text,
  p_category_id text,
  p_name text,
  p_description text default '',
  p_icon text default null,
  p_sort_order integer default 0,
  p_is_active boolean default true
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_id text := coalesce(nullif(btrim(coalesce(p_category_id, '')), ''), gen_random_uuid()::text);
begin
  if not private.is_restaurant_member(p_restaurant_id) and not private.is_admin() then
    raise exception 'Restaurant access required' using errcode = '42501';
  end if;
  if btrim(coalesce(p_name, '')) = '' or length(p_name) > 120
     or length(coalesce(p_description, '')) > 1000 or p_sort_order < 0 then
    raise exception 'Invalid category input' using errcode = '22023';
  end if;
  insert into public.categories (
    id, restaurant_id, name, description, icon, sort_order, is_active
  ) values (
    v_id, p_restaurant_id, btrim(p_name), btrim(coalesce(p_description, '')),
    p_icon, p_sort_order, p_is_active
  ) on conflict (id) do update set
    name = excluded.name, description = excluded.description, icon = excluded.icon,
    sort_order = excluded.sort_order, is_active = excluded.is_active
  where categories.restaurant_id = excluded.restaurant_id;
  if not found then raise exception 'Category belongs to another restaurant' using errcode = '42501'; end if;
  perform private.write_audit(v_actor, 'category.saved', 'category', v_id,
    jsonb_build_object('restaurant_id', p_restaurant_id));
  return v_id;
end
$$;

create or replace function public.set_category_active(p_category_id text, p_is_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_restaurant_id text;
begin
  select restaurant_id into v_restaurant_id from public.categories where id = p_category_id;
  if v_restaurant_id is null or
     (not private.is_restaurant_member(v_restaurant_id) and not private.is_admin()) then
    raise exception 'Category access denied' using errcode = '42501';
  end if;
  update public.categories set is_active = p_is_active where id = p_category_id;
  if not p_is_active then
    update public.menu_items set is_active = false where category_id = p_category_id;
  end if;
  perform private.write_audit(v_actor, 'category.active_changed', 'category', p_category_id,
    jsonb_build_object('active', p_is_active, 'restaurant_id', v_restaurant_id));
end
$$;

create or replace function public.upsert_menu_item(
  p_restaurant_id text,
  p_menu_item_id text,
  p_category_id text,
  p_name text,
  p_price_kurus bigint,
  p_description text default '',
  p_image_url text default null,
  p_cost_kurus bigint default null,
  p_sort_order integer default 0,
  p_eta_minutes integer default null,
  p_calories integer default null,
  p_protein_grams numeric default null,
  p_customizations jsonb default '[]'::jsonb,
  p_is_active boolean default true
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_id text := coalesce(nullif(btrim(coalesce(p_menu_item_id, '')), ''), gen_random_uuid()::text);
begin
  if not private.is_restaurant_member(p_restaurant_id) and not private.is_admin() then
    raise exception 'Restaurant access required' using errcode = '42501';
  end if;
  if btrim(coalesce(p_name, '')) = '' or length(p_name) > 160
     or length(coalesce(p_description, '')) > 2000
     or p_price_kurus < 0 or (p_cost_kurus is not null and p_cost_kurus < 0)
     or p_sort_order < 0 or (p_eta_minutes is not null and p_eta_minutes < 0)
     or (p_calories is not null and p_calories < 0)
     or (p_protein_grams is not null and p_protein_grams < 0)
     or not private.valid_customizations(p_customizations) then
    raise exception 'Invalid menu-item input' using errcode = '22023';
  end if;
  perform 1 from public.categories
    where id = p_category_id and restaurant_id = p_restaurant_id;
  if not found then raise exception 'Category does not belong to restaurant' using errcode = '22023'; end if;
  insert into public.menu_items (
    id, restaurant_id, category_id, name, description, image_url,
    price_kurus, cost_kurus, is_active, sort_order, eta_minutes,
    calories, protein_grams, customizations
  ) values (
    v_id, p_restaurant_id, p_category_id, btrim(p_name),
    btrim(coalesce(p_description, '')), p_image_url, p_price_kurus,
    p_cost_kurus, p_is_active, p_sort_order, p_eta_minutes,
    p_calories, p_protein_grams, p_customizations
  ) on conflict (id) do update set
    category_id = excluded.category_id, name = excluded.name,
    description = excluded.description, image_url = excluded.image_url,
    price_kurus = excluded.price_kurus, cost_kurus = excluded.cost_kurus,
    is_active = excluded.is_active, sort_order = excluded.sort_order,
    eta_minutes = excluded.eta_minutes, calories = excluded.calories,
    protein_grams = excluded.protein_grams, customizations = excluded.customizations
  where menu_items.restaurant_id = excluded.restaurant_id;
  if not found then raise exception 'Menu item belongs to another restaurant' using errcode = '42501'; end if;
  perform private.write_audit(v_actor, 'menu_item.saved', 'menu_item', v_id,
    jsonb_build_object('restaurant_id', p_restaurant_id));
  return v_id;
end
$$;

create or replace function public.set_menu_item_active(p_menu_item_id text, p_is_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
  v_restaurant_id text;
begin
  select restaurant_id into v_restaurant_id from public.menu_items where id = p_menu_item_id;
  if v_restaurant_id is null or
     (not private.is_restaurant_member(v_restaurant_id) and not private.is_admin()) then
    raise exception 'Menu-item access denied' using errcode = '42501';
  end if;
  update public.menu_items set is_active = p_is_active where id = p_menu_item_id;
  perform private.write_audit(v_actor, 'menu_item.active_changed', 'menu_item', p_menu_item_id,
    jsonb_build_object('active', p_is_active, 'restaurant_id', v_restaurant_id));
end
$$;

-- Lock down every public RPC, then grant only the authenticated application role.
revoke all on function public.ensure_my_profile(text, text, text, text) from public, anon;
revoke all on function public.set_default_address(text) from public, anon;
revoke all on function public.quote_order(text, jsonb) from public, anon;
revoke all on function public.create_order(text, text, public.payment_method, jsonb, text) from public, anon;
revoke all on function public.request_order_reminder(text) from public, anon;
revoke all on function public.transition_order(text, public.order_status, text) from public, anon;
revoke all on function public.claim_delivery(text) from public, anon;
revoke all on function public.submit_product_review(text, text, smallint, text) from public, anon;
revoke all on function public.submit_order_review(text, smallint, smallint, smallint, smallint, text) from public, anon;
revoke all on function public.moderate_review(text, text, public.review_status, text) from public, anon;
revoke all on function public.set_restaurant_member(text, text, public.restaurant_role) from public, anon;
revoke all on function public.set_restaurant_courier(text, text, boolean) from public, anon;
revoke all on function public.set_platform_role(text, public.platform_role, boolean) from public, anon;
revoke all on function public.update_restaurant_details(text, jsonb) from public, anon;
revoke all on function public.upsert_category(text, text, text, text, text, integer, boolean) from public, anon;
revoke all on function public.set_category_active(text, boolean) from public, anon;
revoke all on function public.upsert_menu_item(text, text, text, text, bigint, text, text, bigint, integer, integer, integer, numeric, jsonb, boolean) from public, anon;
revoke all on function public.set_menu_item_active(text, boolean) from public, anon;

grant execute on function public.ensure_my_profile(text, text, text, text),
  public.set_default_address(text), public.quote_order(text, jsonb),
  public.create_order(text, text, public.payment_method, jsonb, text),
  public.request_order_reminder(text),
  public.transition_order(text, public.order_status, text),
  public.claim_delivery(text),
  public.submit_product_review(text, text, smallint, text),
  public.submit_order_review(text, smallint, smallint, smallint, smallint, text),
  public.moderate_review(text, text, public.review_status, text),
  public.set_restaurant_member(text, text, public.restaurant_role),
  public.set_restaurant_courier(text, text, boolean),
  public.set_platform_role(text, public.platform_role, boolean),
  public.update_restaurant_details(text, jsonb),
  public.upsert_category(text, text, text, text, text, integer, boolean),
  public.set_category_active(text, boolean),
  public.upsert_menu_item(text, text, text, text, bigint, text, text, bigint, integer, integer, integer, numeric, jsonb, boolean),
  public.set_menu_item_active(text, boolean)
to authenticated;

alter function public.ensure_my_profile(text, text, text, text) owner to hungrie_api_owner;
alter function public.set_default_address(text) owner to hungrie_api_owner;
alter function public.quote_order(text, jsonb) owner to hungrie_api_owner;
alter function public.create_order(text, text, public.payment_method, jsonb, text) owner to hungrie_api_owner;
alter function public.request_order_reminder(text) owner to hungrie_api_owner;
alter function public.transition_order(text, public.order_status, text) owner to hungrie_api_owner;
alter function public.claim_delivery(text) owner to hungrie_api_owner;
alter function public.submit_product_review(text, text, smallint, text) owner to hungrie_api_owner;
alter function public.submit_order_review(text, smallint, smallint, smallint, smallint, text) owner to hungrie_api_owner;
alter function public.moderate_review(text, text, public.review_status, text) owner to hungrie_api_owner;
alter function public.set_restaurant_member(text, text, public.restaurant_role) owner to hungrie_api_owner;
alter function public.set_restaurant_courier(text, text, boolean) owner to hungrie_api_owner;
alter function public.set_platform_role(text, public.platform_role, boolean) owner to hungrie_api_owner;
alter function public.update_restaurant_details(text, jsonb) owner to hungrie_api_owner;
alter function public.upsert_category(text, text, text, text, text, integer, boolean) owner to hungrie_api_owner;
alter function public.set_category_active(text, boolean) owner to hungrie_api_owner;
alter function public.upsert_menu_item(text, text, text, text, bigint, text, text, bigint, integer, integer, integer, numeric, jsonb, boolean) owner to hungrie_api_owner;
alter function public.set_menu_item_active(text, boolean) owner to hungrie_api_owner;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all tables in schema migration from public, anon, authenticated;

drop function if exists public.migration_auth_probe();

revoke create on schema public, private from hungrie_api_owner;
