-- Restaurant media becomes publishable only after trusted decoding and
-- sanitizing in the Firebase callable tier. Storage RLS still governs reads
-- and tenant-scoped cleanup, but no untrusted client may create or overwrite
-- a public object directly.

create table private.restaurant_media_upload_reservations (
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  operation_id uuid not null,
  profile_id text not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (restaurant_id, operation_id)
);

create table private.validated_restaurant_media (
  object_path text primary key,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  uploaded_by_profile_id text not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  public_url text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  extension text not null check (extension in ('jpg', 'png', 'webp')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  width integer not null check (width between 1 and 8192),
  height integer not null check (height between 1 and 8192),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  validated_at timestamptz not null default statement_timestamp(),
  unique (restaurant_id, operation_id),
  check (width::bigint * height::bigint <= 40000000),
  check (object_path = restaurant_id || '/' || operation_id::text || '-' || content_sha256 || '.' || extension)
);

revoke all on private.restaurant_media_upload_reservations from public, anon, authenticated, service_role;
revoke all on private.validated_restaurant_media from public, anon, authenticated, service_role;

create function private.is_validated_restaurant_media_url(p_url text, p_restaurant_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_url is not null and exists (
    select 1 from private.validated_restaurant_media media
    where media.restaurant_id = p_restaurant_id and media.public_url = p_url
  )
$$;

create function public.restaurant_begin_media_upload_v1(p_operation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_active_restaurant();
  v_restaurant text := private.current_restaurant_id();
  v_existing private.validated_restaurant_media%rowtype;
  v_storage_count bigint;
  v_reservation_count bigint;
begin
  select * into v_existing from private.validated_restaurant_media
  where restaurant_id = v_restaurant and operation_id = p_operation_id;
  if found then
    return jsonb_build_object(
      'restaurantId', v_restaurant,
      'replayed', true,
      'path', v_existing.object_path,
      'publicUrl', v_existing.public_url,
      'mime', v_existing.mime_type,
      'width', v_existing.width,
      'height', v_existing.height
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('restaurant-media:' || v_restaurant, 0));
  delete from private.restaurant_media_upload_reservations where expires_at <= statement_timestamp();
  select count(*) into v_storage_count from storage.objects
  where bucket_id = 'restaurant-media' and split_part(name, '/', 1) = v_restaurant;
  select count(*) into v_reservation_count from private.restaurant_media_upload_reservations
  where restaurant_id = v_restaurant and operation_id <> p_operation_id;
  if v_storage_count + v_reservation_count >= 500 then
    raise exception 'RESTAURANT_MEDIA_QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  if not private.consume_abuse_quota(v_actor, 'restaurant-media-upload', 30, 3600) then
    raise exception 'RESTAURANT_MEDIA_RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into private.restaurant_media_upload_reservations(restaurant_id, operation_id, profile_id, expires_at)
  values(v_restaurant, p_operation_id, v_actor, statement_timestamp() + interval '15 minutes')
  on conflict(restaurant_id, operation_id) do update set
    expires_at = excluded.expires_at
  where private.restaurant_media_upload_reservations.profile_id = excluded.profile_id;
  if not found then raise exception 'MEDIA_OPERATION_CONFLICT' using errcode = '22023'; end if;

  return jsonb_build_object('restaurantId', v_restaurant, 'replayed', false);
end
$$;

create function public.server_record_validated_restaurant_media_v1(
  p_firebase_uid text,
  p_restaurant_id text,
  p_operation_id uuid,
  p_object_path text,
  p_public_url text,
  p_mime_type text,
  p_extension text,
  p_byte_size integer,
  p_width integer,
  p_height integer,
  p_content_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_profile text; v_row private.validated_restaurant_media%rowtype;
begin
  if coalesce(private.request_jwt()->>'role', '') <> 'service_role' then
    raise exception 'Trusted service required' using errcode = '42501';
  end if;
  select a.profile_id into v_profile
  from public.profiles p
  join private.account_access a on a.profile_id = p.id
  join public.restaurants r on r.id = a.restaurant_id
  where p.firebase_uid = p_firebase_uid
    and a.account_type = 'restaurant'::public.account_type
    and a.status = 'active'::private.account_status
    and a.restaurant_id = p_restaurant_id
    and a.restaurant_role in ('owner'::public.restaurant_role, 'manager'::public.restaurant_role)
    and r.lifecycle_status = 'active'::public.restaurant_lifecycle_status;
  if v_profile is null then raise exception 'Active Restaurant account required' using errcode = '42501'; end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
     or (p_mime_type, p_extension) not in (('image/jpeg', 'jpg'), ('image/png', 'png'), ('image/webp', 'webp'))
     or p_object_path <> p_restaurant_id || '/' || p_operation_id::text || '-' || p_content_sha256 || '.' || p_extension
     or p_public_url not like '%/storage/v1/object/public/restaurant-media/' || p_object_path
     or p_byte_size not between 1 and 5242880
     or p_width not between 1 and 8192 or p_height not between 1 and 8192
     or p_width::bigint * p_height::bigint > 40000000
     or p_content_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid validated media metadata' using errcode = '22023';
  end if;
  if not exists (
    select 1 from private.restaurant_media_upload_reservations reservation
    where reservation.restaurant_id = p_restaurant_id
      and reservation.operation_id = p_operation_id
      and reservation.profile_id = v_profile
      and reservation.expires_at > statement_timestamp()
  ) then raise exception 'Media upload reservation unavailable' using errcode = '42501'; end if;

  insert into private.validated_restaurant_media(
    object_path, restaurant_id, uploaded_by_profile_id, operation_id, public_url,
    mime_type, extension, byte_size, width, height, content_sha256
  ) values (
    p_object_path, p_restaurant_id, v_profile, p_operation_id, p_public_url,
    p_mime_type, p_extension, p_byte_size, p_width, p_height, p_content_sha256
  )
  on conflict(restaurant_id, operation_id) do update set
    object_path = excluded.object_path,
    public_url = excluded.public_url,
    mime_type = excluded.mime_type,
    extension = excluded.extension,
    byte_size = excluded.byte_size,
    width = excluded.width,
    height = excluded.height,
    content_sha256 = excluded.content_sha256
  where private.validated_restaurant_media.uploaded_by_profile_id = excluded.uploaded_by_profile_id
    and private.validated_restaurant_media.object_path = excluded.object_path
  returning * into v_row;
  if not found then raise exception 'Media operation conflict' using errcode = '22023'; end if;
  delete from private.restaurant_media_upload_reservations
  where restaurant_id = p_restaurant_id and operation_id = p_operation_id;
  perform private.write_audit(v_profile, 'restaurant.media_validated', 'restaurant_media', p_object_path,
    jsonb_build_object('operation_id', p_operation_id, 'mime', p_mime_type, 'width', p_width, 'height', p_height));
  return jsonb_build_object('path', v_row.object_path, 'publicUrl', v_row.public_url,
    'mime', v_row.mime_type, 'width', v_row.width, 'height', v_row.height);
end
$$;

create function public.server_release_restaurant_media_upload_v1(
  p_firebase_uid text, p_restaurant_id text, p_operation_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(private.request_jwt()->>'role', '') <> 'service_role' then
    raise exception 'Trusted service required' using errcode = '42501';
  end if;
  delete from private.restaurant_media_upload_reservations reservation
  using public.profiles profile
  where reservation.restaurant_id = p_restaurant_id
    and reservation.operation_id = p_operation_id
    and profile.id = reservation.profile_id
    and profile.firebase_uid = p_firebase_uid;
end
$$;

-- Direct uploads and overwrites would make bytes public before validation.
drop policy if exists restaurant_media_canonical_insert on storage.objects;
drop policy if exists restaurant_media_canonical_update on storage.objects;

create or replace function public.restaurant_save_menu_item_v2(p_definition jsonb,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant();v_restaurant text:=private.current_restaurant_id();
  v_id text:=coalesce(nullif(btrim(p_definition->>'id'),''),gen_random_uuid()::text);v_category text:=p_definition->>'categoryId';
  v_digest text;v_result jsonb;v_group jsonb;v_group_id text;v_option jsonb;v_ingredient jsonb;
  v_image_url text:=nullif(btrim(p_definition->>'imageUrl'),'');v_existing_image_url text;
begin
  if jsonb_typeof(p_definition)<>'object' or btrim(coalesce(p_definition->>'name',''))=''
    or coalesce(p_definition->>'priceKurus','')!~'^[0-9]+$'
    or not exists(select 1 from public.categories where id=v_category and restaurant_id=v_restaurant)
    or jsonb_typeof(coalesce(p_definition->'ingredients','[]'))<>'array'
    or jsonb_typeof(coalesce(p_definition->'groups','[]'))<>'array' then
    raise exception 'Invalid menu definition' using errcode='22023';end if;
  select image_url into v_existing_image_url from public.menu_items where id=v_id and restaurant_id=v_restaurant;
  if v_image_url is not null and v_image_url is distinct from v_existing_image_url
     and not private.is_validated_restaurant_media_url(v_image_url,v_restaurant) then
    raise exception 'UNVALIDATED_MEDIA_REFERENCE' using errcode='22023';
  end if;
  v_digest:=encode(extensions.digest(p_definition::text,'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'menu_item_save',v_digest);if v_result is not null then return v_result;end if;
  insert into public.menu_items(id,restaurant_id,category_id,name,description,image_url,price_kurus,is_active,sort_order,customizations)
  values(v_id,v_restaurant,v_category,btrim(p_definition->>'name'),btrim(coalesce(p_definition->>'description','')),
    v_image_url,(p_definition->>'priceKurus')::bigint,coalesce((p_definition->>'active')::boolean,true),
    coalesce((p_definition->>'sortOrder')::integer,0),'[]')
  on conflict(id) do update set category_id=excluded.category_id,name=excluded.name,description=excluded.description,
    image_url=excluded.image_url,price_kurus=excluded.price_kurus,is_active=excluded.is_active,
    sort_order=excluded.sort_order,definition_revision=menu_items.definition_revision+1
    where menu_items.restaurant_id=excluded.restaurant_id;
  if not found then raise exception 'Menu item outside Restaurant scope' using errcode='42501';end if;
  delete from public.menu_item_ingredients where menu_item_id=v_id;
  for v_ingredient in select value from jsonb_array_elements(coalesce(p_definition->'ingredients','[]')) loop
    insert into public.menu_item_ingredients(id,restaurant_id,menu_item_id,name,removable,sort_order,is_active)
    values(coalesce(nullif(v_ingredient->>'id',''),gen_random_uuid()::text),v_restaurant,v_id,btrim(v_ingredient->>'name'),
      coalesce((v_ingredient->>'removable')::boolean,false),coalesce((v_ingredient->>'sortOrder')::integer,0),true);
  end loop;
  delete from public.menu_option_groups where menu_item_id=v_id;
  for v_group in select value from jsonb_array_elements(coalesce(p_definition->'groups','[]')) loop
    v_group_id:=coalesce(nullif(v_group->>'id',''),gen_random_uuid()::text);
    if (v_group->>'kind') not in('size','modifier','extra') or coalesce(v_group->>'minimumSelections','')!~'^[0-9]+$'
      or coalesce(v_group->>'maximumSelections','')!~'^[0-9]+$' or jsonb_typeof(coalesce(v_group->'options','[]'))<>'array' then
      raise exception 'Invalid option group' using errcode='22023';end if;
    insert into public.menu_option_groups(id,restaurant_id,menu_item_id,name,kind,minimum_selections,maximum_selections,sort_order,is_active)
    values(v_group_id,v_restaurant,v_id,btrim(v_group->>'name'),(v_group->>'kind')::public.menu_option_group_kind,
      (v_group->>'minimumSelections')::integer,(v_group->>'maximumSelections')::integer,coalesce((v_group->>'sortOrder')::integer,0),true);
    for v_option in select value from jsonb_array_elements(coalesce(v_group->'options','[]')) loop
      insert into public.menu_option_values(id,restaurant_id,group_id,name,price_delta_kurus,sort_order,is_active)
      values(coalesce(nullif(v_option->>'id',''),gen_random_uuid()::text),v_restaurant,v_group_id,btrim(v_option->>'name'),
        coalesce((v_option->>'priceDeltaKurus')::bigint,0),coalesce((v_option->>'sortOrder')::integer,0),true);
    end loop;
  end loop;
  perform private.write_audit(v_actor,'restaurant.menu_item_saved','menu_item',v_id,jsonb_build_object('operation_id',p_operation_id));
  v_result:=jsonb_build_object('menuItemId',v_id,'definitionRevision',(select definition_revision from public.menu_items where id=v_id));
  perform private.phase5_operation(p_operation_id,'menu_item_save',v_digest,v_result);return v_result;
end $$;

create or replace function public.restaurant_update_settings_v1(p_changes jsonb,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant(); v_restaurant text:=private.current_restaurant_id();
  v_digest text; v_result jsonb; v_unknown text[]; v_image_url text; v_existing_image_url text;
begin
  if jsonb_typeof(p_changes)<>'object' then raise exception 'Changes must be an object' using errcode='22023'; end if;
  select array_agg(key) into v_unknown from jsonb_object_keys(p_changes) key where key not in
    ('name','description','cuisine','address','phone','image_url','delivery_eta_min_minutes',
     'delivery_eta_max_minutes','minimum_order_kurus','opening_hours','preferred_language');
  if v_unknown is not null then raise exception 'Unsupported Restaurant setting' using errcode='22023'; end if;
  if p_changes?'image_url' then
    v_image_url:=nullif(btrim(p_changes->>'image_url'),'');
    select image_url into v_existing_image_url from public.restaurants where id=v_restaurant;
    if v_image_url is not null and v_image_url is distinct from v_existing_image_url
       and not private.is_validated_restaurant_media_url(v_image_url,v_restaurant) then
      raise exception 'UNVALIDATED_MEDIA_REFERENCE' using errcode='22023';
    end if;
  end if;
  v_digest:=encode(extensions.digest(p_changes::text,'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'restaurant_update',v_digest); if v_result is not null then return v_result; end if;
  update public.restaurants r set
    name=case when p_changes?'name' then btrim(p_changes->>'name') else r.name end,
    description=case when p_changes?'description' then btrim(p_changes->>'description') else r.description end,
    cuisine=case when p_changes?'cuisine' then btrim(p_changes->>'cuisine') else r.cuisine end,
    address=case when p_changes?'address' then btrim(p_changes->>'address') else r.address end,
    phone=case when p_changes?'phone' then btrim(p_changes->>'phone') else r.phone end,
    image_url=case when p_changes?'image_url' then v_image_url else r.image_url end,
    delivery_eta_min_minutes=case when p_changes?'delivery_eta_min_minutes' then (p_changes->>'delivery_eta_min_minutes')::integer else r.delivery_eta_min_minutes end,
    delivery_eta_max_minutes=case when p_changes?'delivery_eta_max_minutes' then (p_changes->>'delivery_eta_max_minutes')::integer else r.delivery_eta_max_minutes end,
    minimum_order_kurus=case when p_changes?'minimum_order_kurus' then (p_changes->>'minimum_order_kurus')::bigint else r.minimum_order_kurus end,
    opening_hours=case when p_changes?'opening_hours' then p_changes->'opening_hours' else r.opening_hours end,
    preferred_language=case when p_changes?'preferred_language' then p_changes->>'preferred_language' else r.preferred_language end
  where r.id=v_restaurant;
  if btrim(coalesce((select name from public.restaurants where id=v_restaurant),''))='' then
    raise exception 'Restaurant name is required' using errcode='22023';end if;
  perform private.write_audit(v_actor,'restaurant.details_updated','restaurant',v_restaurant,
    jsonb_build_object('operation_id',p_operation_id,'fields',(select jsonb_agg(key) from jsonb_object_keys(p_changes)key)));
  v_result:=public.restaurant_get_settings_v1();
  perform private.phase5_operation(p_operation_id,'restaurant_update',v_digest,v_result); return v_result;
end $$;

-- Legacy management RPCs remain reachable by older Restaurant/Admin clients.
-- They share the same publication authority so they cannot bypass v2.
create or replace function public.update_restaurant_details(p_restaurant_id text,p_changes jsonb)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_profile();v_unknown text[];v_image_url text;v_existing_image_url text;
begin
  if not private.is_restaurant_member(p_restaurant_id) and not private.is_admin() then
    raise exception 'Restaurant access required' using errcode='42501';end if;
  if jsonb_typeof(p_changes)<>'object' then raise exception 'Restaurant changes must be an object' using errcode='22023';end if;
  select array_agg(key) into v_unknown from jsonb_object_keys(p_changes) key where key not in
    ('name','description','cuisine','address','phone','image_url','is_active','delivery_eta_min_minutes',
     'delivery_eta_max_minutes','delivery_fee_kurus','minimum_order_kurus','opening_hours','preferred_language');
  if v_unknown is not null then raise exception 'Restaurant changes contain unsupported fields' using errcode='22023';end if;
  if p_changes?'image_url' then
    v_image_url:=nullif(btrim(coalesce(p_changes->>'image_url','')),'');
    select image_url into v_existing_image_url from public.restaurants where id=p_restaurant_id;
    if v_image_url is not null and v_image_url is distinct from v_existing_image_url
       and not private.is_validated_restaurant_media_url(v_image_url,p_restaurant_id) then
      raise exception 'UNVALIDATED_MEDIA_REFERENCE' using errcode='22023';end if;
  end if;
  update public.restaurants r set
    name=case when p_changes?'name' then btrim(p_changes->>'name') else r.name end,
    description=case when p_changes?'description' then coalesce(p_changes->>'description','') else r.description end,
    cuisine=case when p_changes?'cuisine' then coalesce(p_changes->>'cuisine','') else r.cuisine end,
    address=case when p_changes?'address' then coalesce(p_changes->>'address','') else r.address end,
    phone=case when p_changes?'phone' then nullif(btrim(coalesce(p_changes->>'phone','')),'') else r.phone end,
    image_url=case when p_changes?'image_url' then v_image_url else r.image_url end,
    is_active=case when p_changes?'is_active' then (p_changes->>'is_active')::boolean else r.is_active end,
    delivery_eta_min_minutes=case when p_changes?'delivery_eta_min_minutes' then (p_changes->>'delivery_eta_min_minutes')::integer else r.delivery_eta_min_minutes end,
    delivery_eta_max_minutes=case when p_changes?'delivery_eta_max_minutes' then (p_changes->>'delivery_eta_max_minutes')::integer else r.delivery_eta_max_minutes end,
    delivery_fee_kurus=case when p_changes?'delivery_fee_kurus' then (p_changes->>'delivery_fee_kurus')::bigint else r.delivery_fee_kurus end,
    minimum_order_kurus=case when p_changes?'minimum_order_kurus' then (p_changes->>'minimum_order_kurus')::bigint else r.minimum_order_kurus end,
    opening_hours=case when p_changes?'opening_hours' then p_changes->'opening_hours' else r.opening_hours end,
    preferred_language=case when p_changes?'preferred_language' then p_changes->>'preferred_language' else r.preferred_language end
  where r.id=p_restaurant_id;
  if not found then raise exception 'Restaurant not found' using errcode='22023';end if;
  perform private.write_audit(v_actor,'restaurant.updated','restaurant',p_restaurant_id,
    jsonb_build_object('fields',(select jsonb_agg(key) from jsonb_object_keys(p_changes)key)));
end $$;

create or replace function public.upsert_menu_item(
  p_restaurant_id text,p_menu_item_id text,p_category_id text,p_name text,p_price_kurus bigint,
  p_description text default '',p_image_url text default null,p_cost_kurus bigint default null,
  p_sort_order integer default 0,p_eta_minutes integer default null,p_calories integer default null,
  p_protein_grams numeric default null,p_customizations jsonb default '[]'::jsonb,p_is_active boolean default true
)
returns text language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_profile();v_id text:=coalesce(nullif(btrim(coalesce(p_menu_item_id,'')),''),gen_random_uuid()::text);
  v_image_url text:=nullif(btrim(coalesce(p_image_url,'')),'');v_existing_image_url text;
begin
  if not private.is_restaurant_member(p_restaurant_id) and not private.is_admin() then
    raise exception 'Restaurant access required' using errcode='42501';end if;
  if btrim(coalesce(p_name,''))='' or length(p_name)>160 or length(coalesce(p_description,''))>2000
     or p_price_kurus<0 or(p_cost_kurus is not null and p_cost_kurus<0)or p_sort_order<0
     or(p_eta_minutes is not null and p_eta_minutes<0)or(p_calories is not null and p_calories<0)
     or(p_protein_grams is not null and p_protein_grams<0)or not private.valid_customizations(p_customizations) then
    raise exception 'Invalid menu-item input' using errcode='22023';end if;
  perform 1 from public.categories where id=p_category_id and restaurant_id=p_restaurant_id;
  if not found then raise exception 'Category does not belong to restaurant' using errcode='22023';end if;
  select image_url into v_existing_image_url from public.menu_items where id=v_id and restaurant_id=p_restaurant_id;
  if v_image_url is not null and v_image_url is distinct from v_existing_image_url
     and not private.is_validated_restaurant_media_url(v_image_url,p_restaurant_id) then
    raise exception 'UNVALIDATED_MEDIA_REFERENCE' using errcode='22023';end if;
  insert into public.menu_items(id,restaurant_id,category_id,name,description,image_url,price_kurus,cost_kurus,
    is_active,sort_order,eta_minutes,calories,protein_grams,customizations)
  values(v_id,p_restaurant_id,p_category_id,btrim(p_name),btrim(coalesce(p_description,'')),v_image_url,
    p_price_kurus,p_cost_kurus,p_is_active,p_sort_order,p_eta_minutes,p_calories,p_protein_grams,p_customizations)
  on conflict(id)do update set category_id=excluded.category_id,name=excluded.name,description=excluded.description,
    image_url=excluded.image_url,price_kurus=excluded.price_kurus,cost_kurus=excluded.cost_kurus,
    is_active=excluded.is_active,sort_order=excluded.sort_order,eta_minutes=excluded.eta_minutes,
    calories=excluded.calories,protein_grams=excluded.protein_grams,customizations=excluded.customizations
  where menu_items.restaurant_id=excluded.restaurant_id;
  if not found then raise exception 'Menu item belongs to another restaurant' using errcode='42501';end if;
  perform private.write_audit(v_actor,'menu_item.saved','menu_item',v_id,jsonb_build_object('restaurant_id',p_restaurant_id));
  return v_id;
end $$;

create or replace function public.create_restaurant(p_payload jsonb)
returns text language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_profile();v_id text:=gen_random_uuid()::text;v_name text;
begin
  if not private.has_platform_role('super_admin') then raise exception 'Super-admin role required' using errcode='42501';end if;
  if jsonb_typeof(p_payload)<>'object' then raise exception 'Restaurant payload must be an object' using errcode='22023';end if;
  v_name:=btrim(coalesce(p_payload->>'name',''));
  if v_name='' or length(v_name)>160 then raise exception 'Invalid restaurant name' using errcode='22023';end if;
  if nullif(btrim(coalesce(p_payload->>'image_url','')),'') is not null then
    raise exception 'UNVALIDATED_MEDIA_REFERENCE' using errcode='22023';end if;
  insert into public.restaurants(id,name,description,cuisine,address,phone,image_url,is_active,
    delivery_eta_min_minutes,delivery_eta_max_minutes,delivery_fee_kurus,minimum_order_kurus,opening_hours,preferred_language)
  values(v_id,v_name,btrim(coalesce(p_payload->>'description','')),btrim(coalesce(p_payload->>'cuisine','')),
    btrim(coalesce(p_payload->>'address','')),nullif(btrim(coalesce(p_payload->>'phone','')),''),null,
    coalesce((p_payload->>'is_active')::boolean,false),nullif(p_payload->>'delivery_eta_min_minutes','')::integer,
    nullif(p_payload->>'delivery_eta_max_minutes','')::integer,coalesce(nullif(p_payload->>'delivery_fee_kurus','')::bigint,0),
    coalesce(nullif(p_payload->>'minimum_order_kurus','')::bigint,0),coalesce(p_payload->'opening_hours','{}'::jsonb),
    coalesce(nullif(p_payload->>'preferred_language',''),'tr'));
  perform private.write_audit(v_actor,'restaurant.created','restaurant',v_id);return v_id;
end $$;

grant create on schema public, private to hungrie_api_owner;
alter table private.restaurant_media_upload_reservations owner to hungrie_api_owner;
alter table private.validated_restaurant_media owner to hungrie_api_owner;
alter function private.is_validated_restaurant_media_url(text,text) owner to hungrie_api_owner;
alter function public.restaurant_begin_media_upload_v1(uuid) owner to hungrie_api_owner;
alter function public.server_record_validated_restaurant_media_v1(text,text,uuid,text,text,text,text,integer,integer,integer,text) owner to hungrie_api_owner;
alter function public.server_release_restaurant_media_upload_v1(text,text,uuid) owner to hungrie_api_owner;
revoke create on schema public, private from hungrie_api_owner;

revoke all on function private.is_validated_restaurant_media_url(text,text) from public, anon, authenticated, service_role;
revoke all on function public.restaurant_begin_media_upload_v1(uuid) from public, anon, authenticated, service_role;
grant execute on function public.restaurant_begin_media_upload_v1(uuid) to authenticated;
revoke all on function public.server_record_validated_restaurant_media_v1(text,text,uuid,text,text,text,text,integer,integer,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.server_record_validated_restaurant_media_v1(text,text,uuid,text,text,text,text,integer,integer,integer,text) to service_role;
revoke all on function public.server_release_restaurant_media_upload_v1(text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.server_release_restaurant_media_upload_v1(text,text,uuid) to service_role;

notify pgrst, 'reload schema';
