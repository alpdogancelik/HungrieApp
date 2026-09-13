-- Complete Phase 5 management, pricing, media, review, and push contracts.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('restaurant-media','restaurant-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy restaurant_media_public_read on storage.objects for select to public
using(bucket_id='restaurant-media');
create policy restaurant_media_canonical_insert on storage.objects for insert to authenticated
with check(bucket_id='restaurant-media' and (storage.foldername(name))[1]=private.current_restaurant_id());
create policy restaurant_media_canonical_update on storage.objects for update to authenticated
using(bucket_id='restaurant-media' and (storage.foldername(name))[1]=private.current_restaurant_id())
with check(bucket_id='restaurant-media' and (storage.foldername(name))[1]=private.current_restaurant_id());
create policy restaurant_media_canonical_delete on storage.objects for delete to authenticated
using(bucket_id='restaurant-media' and (storage.foldername(name))[1]=private.current_restaurant_id());

create function public.restaurant_save_category_v1(
  p_category_id text,p_name text,p_description text default '',p_icon text default null,
  p_active boolean default true,p_operation_id uuid default gen_random_uuid())
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant();v_restaurant text:=private.current_restaurant_id();
  v_id text:=coalesce(nullif(btrim(p_category_id),''),gen_random_uuid()::text);v_digest text;v_result jsonb;
begin
  if btrim(coalesce(p_name,''))='' or length(p_name)>120 or length(coalesce(p_description,''))>1000 then
    raise exception 'Invalid category' using errcode='22023';end if;
  v_digest:=encode(extensions.digest(concat_ws(':',v_id,p_name,p_description,p_icon,p_active),'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'category_save',v_digest);if v_result is not null then return v_result;end if;
  insert into public.categories(id,restaurant_id,name,description,icon,is_active,sort_order)
  values(v_id,v_restaurant,btrim(p_name),btrim(coalesce(p_description,'')),p_icon,p_active,
    coalesce((select max(sort_order)+1 from public.categories where restaurant_id=v_restaurant),0))
  on conflict(id) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,is_active=excluded.is_active
    where categories.restaurant_id=excluded.restaurant_id;
  if not found then raise exception 'Category outside Restaurant scope' using errcode='42501';end if;
  perform private.write_audit(v_actor,'restaurant.category_saved','category',v_id,jsonb_build_object('operation_id',p_operation_id));
  v_result:=jsonb_build_object('categoryId',v_id);perform private.phase5_operation(p_operation_id,'category_save',v_digest,v_result);return v_result;
end $$;

create function public.restaurant_reorder_categories_v1(p_category_ids text[],p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant();v_restaurant text:=private.current_restaurant_id();v_digest text;v_result jsonb;
begin
  if cardinality(p_category_ids)<>(select count(*) from public.categories where restaurant_id=v_restaurant)
    or cardinality(p_category_ids)<>(select count(distinct x) from unnest(p_category_ids)x)
    or exists(select 1 from unnest(p_category_ids)x left join public.categories c on c.id=x and c.restaurant_id=v_restaurant where c.id is null)
    then raise exception 'Complete unique category order required' using errcode='22023';end if;
  v_digest:=encode(extensions.digest(array_to_string(p_category_ids,','),'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'category_reorder',v_digest);if v_result is not null then return v_result;end if;
  update public.categories c set sort_order=x.ordinality-1 from unnest(p_category_ids)with ordinality x(id,ordinality)
    where c.id=x.id and c.restaurant_id=v_restaurant;
  v_result:=jsonb_build_object('reordered',cardinality(p_category_ids));
  perform private.write_audit(v_actor,'restaurant.categories_reordered','restaurant',v_restaurant,jsonb_build_object('operation_id',p_operation_id));
  perform private.phase5_operation(p_operation_id,'category_reorder',v_digest,v_result);return v_result;
end $$;

create function public.restaurant_save_menu_item_v2(p_definition jsonb,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant();v_restaurant text:=private.current_restaurant_id();
  v_id text:=coalesce(nullif(btrim(p_definition->>'id'),''),gen_random_uuid()::text);v_category text:=p_definition->>'categoryId';
  v_digest text;v_result jsonb;v_group jsonb;v_group_id text;v_option jsonb;v_ingredient jsonb;
begin
  if jsonb_typeof(p_definition)<>'object' or btrim(coalesce(p_definition->>'name',''))=''
    or coalesce(p_definition->>'priceKurus','')!~'^[0-9]+$'
    or not exists(select 1 from public.categories where id=v_category and restaurant_id=v_restaurant)
    or jsonb_typeof(coalesce(p_definition->'ingredients','[]'))<>'array'
    or jsonb_typeof(coalesce(p_definition->'groups','[]'))<>'array' then
    raise exception 'Invalid menu definition' using errcode='22023';end if;
  v_digest:=encode(extensions.digest(p_definition::text,'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'menu_item_save',v_digest);if v_result is not null then return v_result;end if;
  insert into public.menu_items(id,restaurant_id,category_id,name,description,image_url,price_kurus,is_active,sort_order,customizations)
  values(v_id,v_restaurant,v_category,btrim(p_definition->>'name'),btrim(coalesce(p_definition->>'description','')),
    nullif(btrim(p_definition->>'imageUrl'),''),(p_definition->>'priceKurus')::bigint,coalesce((p_definition->>'active')::boolean,true),
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

create function public.restaurant_reorder_menu_items_v1(p_category_id text,p_item_ids text[],p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant();v_restaurant text:=private.current_restaurant_id();v_digest text;v_result jsonb;
begin
  if not exists(select 1 from public.categories where id=p_category_id and restaurant_id=v_restaurant)
    or cardinality(p_item_ids)<>(select count(*) from public.menu_items where category_id=p_category_id and restaurant_id=v_restaurant)
    or cardinality(p_item_ids)<>(select count(distinct x) from unnest(p_item_ids)x)
    then raise exception 'Complete unique item order required' using errcode='22023';end if;
  v_digest:=encode(extensions.digest(p_category_id||':'||array_to_string(p_item_ids,','),'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'menu_item_reorder',v_digest);if v_result is not null then return v_result;end if;
  update public.menu_items m set sort_order=x.ordinality-1 from unnest(p_item_ids)with ordinality x(id,ordinality)
    where m.id=x.id and m.category_id=p_category_id and m.restaurant_id=v_restaurant;
  if not found and cardinality(p_item_ids)>0 then raise exception 'Item outside Restaurant scope' using errcode='42501';end if;
  v_result:=jsonb_build_object('reordered',cardinality(p_item_ids));perform private.phase5_operation(p_operation_id,'menu_item_reorder',v_digest,v_result);return v_result;
end $$;

create function public.restaurant_moderate_review_v1(
  p_review_type text,p_review_id text,p_status text,p_reply text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant();v_restaurant text:=private.current_restaurant_id();v_digest text;v_result jsonb;
begin
  if p_review_type not in('product','order') or p_status not in('published','hidden') or length(coalesce(p_reply,''))>1000 then
    raise exception 'Invalid review moderation' using errcode='22023';end if;
  v_digest:=encode(extensions.digest(concat_ws(':',p_review_type,p_review_id,p_status,p_reply),'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'review_moderation',v_digest);if v_result is not null then return v_result;end if;
  if p_review_type='product' then update public.product_reviews set status=p_status::public.review_status,reply=nullif(btrim(p_reply),''),replied_at=case when nullif(btrim(p_reply),'')is null then null else statement_timestamp()end where id=p_review_id and restaurant_id=v_restaurant;
  else update public.order_reviews set status=p_status::public.review_status where id=p_review_id and restaurant_id=v_restaurant;end if;
  if not found then raise exception 'Review unavailable' using errcode='42501';end if;
  perform private.write_audit(v_actor,'restaurant.review_moderated',p_review_type||'_review',p_review_id,jsonb_build_object('operation_id',p_operation_id,'status',p_status));
  v_result:=jsonb_build_object('reviewId',p_review_id,'status',p_status);perform private.phase5_operation(p_operation_id,'review_moderation',v_digest,v_result);return v_result;
end $$;

create function public.restaurant_unregister_web_push_v1(p_device_id text,p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant();v_restaurant text:=private.current_restaurant_id();v_digest text;v_result jsonb;
begin
  v_digest:=encode(extensions.digest(p_device_id,'sha256'),'hex');v_result:=private.phase5_operation(p_operation_id,'push_unregister',v_digest);if v_result is not null then return v_result;end if;
  update private.push_tokens set is_active=false,revoked_at=statement_timestamp() where restaurant_id=v_restaurant and registered_by_profile_id=v_actor and app='restaurant' and device_id=p_device_id;
  v_result:=jsonb_build_object('unregistered',true);perform private.phase5_operation(p_operation_id,'push_unregister',v_digest,v_result);return v_result;
end $$;

create function public.server_claim_restaurant_web_push_v1(p_limit integer default 100)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_ids uuid[];
begin
  if coalesce(private.request_jwt()->>'role','')<>'service_role' then raise exception 'Trusted service required' using errcode='42501';end if;
  select array_agg(d.id) into v_ids from(select d.id from private.notification_deliveries d
    join private.push_tokens t on t.id=d.token_id where t.provider='fcm' and t.platform='web' and t.app='restaurant'
    and t.is_active and t.revoked_at is null and d.state in('pending','processing') and d.next_attempt_at<=statement_timestamp()
    and(d.claim_until is null or d.claim_until<statement_timestamp()) order by d.created_at limit least(greatest(p_limit,1),500) for update of d skip locked)d;
  update private.notification_deliveries set state='processing',attempts=attempts+1,claim_until=statement_timestamp()+interval'2 minutes'
    where id=any(coalesce(v_ids,array[]::uuid[]));
  return coalesce((select jsonb_agg(jsonb_build_object('deliveryId',d.id,'eventId',e.id,'eventType',e.event_type,
    'orderId',e.order_id,'token',t.token,'language',coalesce(t.preferred_language,'en')) order by d.created_at)
    from private.notification_deliveries d join private.notification_events e on e.id=d.event_id join private.push_tokens t on t.id=d.token_id
    where d.id=any(coalesce(v_ids,array[]::uuid[]))),'[]');
end $$;

create function public.server_complete_restaurant_web_push_v1(
  p_delivery_id uuid,p_success boolean,p_error_code text default null,p_retryable boolean default false)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_token text;v_attempts integer;
begin
  if coalesce(private.request_jwt()->>'role','')<>'service_role' then raise exception 'Trusted service required' using errcode='42501';end if;
  select token_id,attempts into v_token,v_attempts from private.notification_deliveries where id=p_delivery_id for update;
  if not found then raise exception 'Delivery unavailable' using errcode='22023';end if;
  update private.notification_deliveries set state=case when p_success then'delivered' when p_retryable and v_attempts<6 then'pending'else'dead_letter'end,
    next_attempt_at=case when not p_success and p_retryable and v_attempts<6 then statement_timestamp()+make_interval(secs=>least(300,5*(2^v_attempts)))else next_attempt_at end,
    claim_until=null,error_code=left(p_error_code,120),last_error=left(p_error_code,300) where id=p_delivery_id;
  if not p_success and p_error_code in('messaging/registration-token-not-registered','messaging/invalid-registration-token') then
    update private.push_tokens set is_active=false,revoked_at=statement_timestamp() where id=v_token;
  end if;
end $$;

-- Add canonical Restaurant web deliveries without changing legacy Expo recipients.
create or replace function private.materialize_notification_deliveries()
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_event private.notification_events%rowtype;
begin
  for v_event in select * from private.notification_events where state='pending' order by created_at for update skip locked loop
    if not private.notification_event_is_current(v_event) then
      update private.notification_events set state='obsolete' where id=v_event.id;continue;
    end if;
    if v_event.event_type='order_status' then
      insert into private.notification_deliveries(event_id,token_id)
      select v_event.id,t.id from public.orders o join public.profiles pr on pr.id=o.profile_id and pr.deleted_at is null and pr.deletion_pending_at is null
      join private.push_tokens t on t.profile_id=o.profile_id and t.is_active and t.revoked_at is null and t.provider='expo'
      left join private.notification_preferences p on p.profile_id=o.profile_id where o.id=v_event.order_id and coalesce(p.order_status_enabled,true) on conflict do nothing;
    elsif v_event.event_type in('restaurant_new_order','restaurant_reminder') then
      insert into private.notification_deliveries(event_id,token_id)
      select v_event.id,t.id from public.orders o join private.restaurant_members m on m.restaurant_id=o.restaurant_id
      join public.profiles pr on pr.id=m.profile_id and pr.deleted_at is null and pr.deletion_pending_at is null
      join private.push_tokens t on t.profile_id=m.profile_id and t.is_active and t.revoked_at is null and t.provider='expo'
      left join private.notification_preferences p on p.profile_id=m.profile_id
      where o.id=v_event.order_id and coalesce(p.restaurant_orders_enabled,true) on conflict do nothing;
      insert into private.notification_deliveries(event_id,token_id)
      select v_event.id,t.id from public.orders o join private.push_tokens t on t.restaurant_id=o.restaurant_id
        and t.is_active and t.revoked_at is null and t.provider='fcm' and t.platform='web' and t.app='restaurant'
      where o.id=v_event.order_id and exists(select 1 from private.account_access a join public.restaurants r on r.id=a.restaurant_id
        where a.profile_id=t.registered_by_profile_id and a.account_type='restaurant' and a.status='active'
          and a.restaurant_id=o.restaurant_id and r.lifecycle_status='active') on conflict do nothing;
    elsif v_event.event_type='review_reply' then
      insert into private.notification_deliveries(event_id,token_id)
      select v_event.id,t.id from public.product_reviews r join public.profiles pr on pr.id=r.profile_id and pr.deleted_at is null and pr.deletion_pending_at is null
      join private.push_tokens t on t.profile_id=r.profile_id and t.is_active and t.revoked_at is null and t.provider='expo'
      left join private.notification_preferences p on p.profile_id=r.profile_id where r.id=v_event.review_id and coalesce(p.review_replies_enabled,true) on conflict do nothing;
    end if;
    update private.notification_events set state=case when exists(select 1 from private.notification_deliveries d where d.event_id=v_event.id)then'processing'else'completed'end where id=v_event.id;
  end loop;
end $$;

grant create on schema public,private to hungrie_api_owner;
alter function public.restaurant_save_category_v1(text,text,text,text,boolean,uuid) owner to hungrie_api_owner;
alter function public.restaurant_reorder_categories_v1(text[],uuid) owner to hungrie_api_owner;
alter function public.restaurant_save_menu_item_v2(jsonb,uuid) owner to hungrie_api_owner;
alter function public.restaurant_reorder_menu_items_v1(text,text[],uuid) owner to hungrie_api_owner;
alter function public.restaurant_moderate_review_v1(text,text,text,text,uuid) owner to hungrie_api_owner;
alter function public.restaurant_unregister_web_push_v1(text,uuid) owner to hungrie_api_owner;
alter function public.server_claim_restaurant_web_push_v1(integer) owner to hungrie_api_owner;
alter function public.server_complete_restaurant_web_push_v1(uuid,boolean,text,boolean) owner to hungrie_api_owner;
alter function private.materialize_notification_deliveries() owner to hungrie_api_owner;
revoke create on schema public,private from hungrie_api_owner;
revoke all on function public.restaurant_save_category_v1(text,text,text,text,boolean,uuid),
 public.restaurant_reorder_categories_v1(text[],uuid),public.restaurant_save_menu_item_v2(jsonb,uuid),
 public.restaurant_reorder_menu_items_v1(text,text[],uuid),public.restaurant_moderate_review_v1(text,text,text,text,uuid),
 public.restaurant_unregister_web_push_v1(text,uuid) from public,anon;
grant execute on function public.restaurant_save_category_v1(text,text,text,text,boolean,uuid),
 public.restaurant_reorder_categories_v1(text[],uuid),public.restaurant_save_menu_item_v2(jsonb,uuid),
 public.restaurant_reorder_menu_items_v1(text,text[],uuid),public.restaurant_moderate_review_v1(text,text,text,text,uuid),
 public.restaurant_unregister_web_push_v1(text,uuid) to authenticated;
revoke all on function public.server_claim_restaurant_web_push_v1(integer),
 public.server_complete_restaurant_web_push_v1(uuid,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.server_claim_restaurant_web_push_v1(integer),
 public.server_complete_restaurant_web_push_v1(uuid,boolean,text,boolean) to service_role;
