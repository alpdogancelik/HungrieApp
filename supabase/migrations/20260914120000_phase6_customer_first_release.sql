-- Phase 6 additive Customer contracts. Legacy functions remain available until
-- the enforcement/retirement phases; the Customer first release uses only the
-- guarded surface below.

create function public.get_my_customer_profile_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_customer();v_result jsonb;
begin
  select jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'avatar_url',p.avatar_url,
    'whatsapp_number',p.whatsapp_number,'preferred_language',p.preferred_language)
  into v_result from public.profiles p where p.id=v_actor;
  return v_result;
end $$;

create function public.update_my_customer_profile_v1(p_name text,p_avatar_url text default null,
  p_whatsapp_number text default null,p_preferred_language text default null)
returns text language plpgsql volatile security definer set search_path='' as $$
begin perform private.require_active_customer();return public.update_my_profile(p_name,p_avatar_url,p_whatsapp_number,p_preferred_language);end $$;

create function public.list_my_customer_addresses_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_customer();begin
 return coalesce((select jsonb_agg(to_jsonb(a) order by a.is_default desc,a.created_at,a.id)
   from public.addresses a where a.profile_id=v_actor),'[]'::jsonb);end $$;
create function public.create_my_customer_address_v1(p_id text,p_label text,p_line1 text,p_block text,
  p_room text,p_city text,p_country text,p_is_default boolean default false)
returns text language plpgsql volatile security definer set search_path='' as $$
begin perform private.require_active_customer();return public.create_my_address(p_id,p_label,p_line1,p_block,p_room,p_city,p_country,p_is_default);end $$;
create function public.update_my_customer_address_v1(p_id text,p_label text,p_line1 text,p_block text,
  p_room text,p_city text,p_country text,p_is_default boolean default false)
returns text language plpgsql volatile security definer set search_path='' as $$
begin perform private.require_active_customer();return public.update_my_address(p_id,p_label,p_line1,p_block,p_room,p_city,p_country,p_is_default);end $$;
create function public.delete_my_customer_address_v1(p_id text)
returns void language plpgsql volatile security definer set search_path='' as $$
begin perform private.require_active_customer();perform public.delete_my_address(p_id);end $$;
create function public.set_my_customer_default_address_v1(p_address_id text)
returns void language plpgsql volatile security definer set search_path='' as $$
begin perform private.require_active_customer();perform public.set_default_address(p_address_id);end $$;

create function public.list_my_customer_favorites_v1()
returns text[] language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_customer();begin
 return coalesce((select array_agg(f.restaurant_id order by f.restaurant_id) from public.favorites f where f.profile_id=v_actor),array[]::text[]);end $$;
create function public.replace_my_customer_favorites_v1(p_restaurant_ids text[])
returns integer language plpgsql volatile security definer set search_path='' as $$
begin perform private.require_active_customer();return public.replace_my_favorites(p_restaurant_ids);end $$;

create function public.get_my_customer_orders_page_v1(p_cursor text default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_active_customer();return public.get_my_orders_page(p_cursor,p_limit);end $$;
create function public.get_my_customer_order_v1(p_order_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_active_customer();return public.get_authorized_order(p_order_id);end $$;
create function public.get_my_customer_active_order_summary_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_active_customer();return public.get_my_active_order_summary();end $$;
create function public.get_my_customer_latest_order_summary_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_active_customer();return public.get_my_latest_order_summary();end $$;
create function public.request_my_customer_order_reminder_v1(p_order_id text)
returns void language plpgsql volatile security definer set search_path='' as $$
begin perform private.require_active_customer();perform public.request_order_reminder(p_order_id);end $$;
create function public.my_customer_order_realtime_topics_v1()
returns table(topic text,topic_kind text,resource_id text) language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_customer();begin
 return query select 'orders:profile:'||v_actor,'profile',v_actor;end $$;

create function public.list_my_customer_product_reviews_v1(p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_active_customer();return public.list_my_product_reviews(p_limit);end $$;
create function public.list_my_customer_order_reviews_v1(p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_active_customer();return public.list_my_order_reviews(p_limit);end $$;
create function public.get_my_customer_order_review_by_order_v1(p_order_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_active_customer();return public.get_my_order_review_by_order(p_order_id);end $$;
create function public.get_my_customer_product_review_v1(p_review_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_active_customer();return public.get_my_product_review(p_review_id);end $$;
create function public.get_my_customer_order_review_v1(p_review_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_active_customer();return public.get_my_order_review(p_review_id);end $$;
create function public.submit_my_customer_product_review_v1(p_order_id text,p_menu_item_id text,p_rating smallint,p_comment text default '')
returns text language plpgsql volatile security definer set search_path='' as $$
begin perform private.require_active_customer();return public.submit_product_review(p_order_id,p_menu_item_id,p_rating,p_comment);end $$;
create function public.submit_my_customer_order_review_v1(p_order_id text,p_speed_rating smallint,p_taste_rating smallint,
 p_value_rating smallint,p_price_performance_rating smallint,p_comment text default '')
returns text language plpgsql volatile security definer set search_path='' as $$
begin perform private.require_active_customer();return public.submit_order_review(p_order_id,p_speed_rating,p_taste_rating,p_value_rating,p_price_performance_rating,p_comment);end $$;

create function public.get_my_customer_notification_preferences_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;begin perform private.require_active_customer();v_result:=public.get_my_notification_preferences();
 return v_result||jsonb_build_object('restaurantOrders',false);end $$;
create function public.update_my_customer_notification_preferences_v1(p_order_status boolean,p_review_replies boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin perform private.require_active_customer();return public.update_my_notification_preferences(p_order_status,false,p_review_replies);end $$;
create function public.register_my_customer_push_token_v1(p_token text,p_platform public.notification_platform)
returns text language plpgsql volatile security definer set search_path='' as $$
begin perform private.require_active_customer();return public.register_my_push_token(p_token,p_platform);end $$;
create function public.unregister_my_customer_push_token_v1(p_token text)
returns void language plpgsql volatile security definer set search_path='' as $$
begin perform private.require_active_customer();perform public.unregister_my_push_token(p_token);end $$;

create function public.get_active_restaurant_bundle_v2(p_restaurant_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_restaurant jsonb;begin
 select to_jsonb(r) into v_restaurant from public.active_restaurants r where r.id=p_restaurant_id;
 if v_restaurant is null then return null;end if;
 return jsonb_build_object('restaurant',v_restaurant,
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.id)
    from public.active_categories c where c.restaurant_id=p_restaurant_id),'[]'::jsonb),
  'items',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object(
   'menu_definition_revision',(select source.definition_revision from public.menu_items source where source.id=m.id),
   'ingredients',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'removable',i.removable) order by i.sort_order,i.id)
     from public.menu_item_ingredients i where i.menu_item_id=m.id and i.is_active),'[]'::jsonb),
   'option_groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'kind',g.kind,
     'minimum_selections',g.minimum_selections,'maximum_selections',g.maximum_selections,
     'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'price_delta_kurus',o.price_delta_kurus) order by o.sort_order,o.id)
       from public.menu_option_values o where o.group_id=g.id and o.is_active),'[]'::jsonb)) order by g.sort_order,g.id)
     from public.menu_option_groups g where g.menu_item_id=m.id and g.is_active),'[]'::jsonb))
     order by m.sort_order,m.id)
   from public.active_menu_items m where m.restaurant_id=p_restaurant_id),'[]'::jsonb));
end $$;

grant create on schema public to hungrie_api_owner;
alter function public.get_my_customer_profile_v1() owner to hungrie_api_owner;
alter function public.update_my_customer_profile_v1(text,text,text,text) owner to hungrie_api_owner;
alter function public.list_my_customer_addresses_v1() owner to hungrie_api_owner;
alter function public.create_my_customer_address_v1(text,text,text,text,text,text,text,boolean) owner to hungrie_api_owner;
alter function public.update_my_customer_address_v1(text,text,text,text,text,text,text,boolean) owner to hungrie_api_owner;
alter function public.delete_my_customer_address_v1(text) owner to hungrie_api_owner;
alter function public.set_my_customer_default_address_v1(text) owner to hungrie_api_owner;
alter function public.list_my_customer_favorites_v1() owner to hungrie_api_owner;
alter function public.replace_my_customer_favorites_v1(text[]) owner to hungrie_api_owner;
alter function public.get_my_customer_orders_page_v1(text,integer) owner to hungrie_api_owner;
alter function public.get_my_customer_order_v1(text) owner to hungrie_api_owner;
alter function public.get_my_customer_active_order_summary_v1() owner to hungrie_api_owner;
alter function public.get_my_customer_latest_order_summary_v1() owner to hungrie_api_owner;
alter function public.request_my_customer_order_reminder_v1(text) owner to hungrie_api_owner;
alter function public.my_customer_order_realtime_topics_v1() owner to hungrie_api_owner;
alter function public.list_my_customer_product_reviews_v1(integer) owner to hungrie_api_owner;
alter function public.list_my_customer_order_reviews_v1(integer) owner to hungrie_api_owner;
alter function public.get_my_customer_order_review_by_order_v1(text) owner to hungrie_api_owner;
alter function public.get_my_customer_product_review_v1(text) owner to hungrie_api_owner;
alter function public.get_my_customer_order_review_v1(text) owner to hungrie_api_owner;
alter function public.submit_my_customer_product_review_v1(text,text,smallint,text) owner to hungrie_api_owner;
alter function public.submit_my_customer_order_review_v1(text,smallint,smallint,smallint,smallint,text) owner to hungrie_api_owner;
alter function public.get_my_customer_notification_preferences_v1() owner to hungrie_api_owner;
alter function public.update_my_customer_notification_preferences_v1(boolean,boolean) owner to hungrie_api_owner;
alter function public.register_my_customer_push_token_v1(text,public.notification_platform) owner to hungrie_api_owner;
alter function public.unregister_my_customer_push_token_v1(text) owner to hungrie_api_owner;
alter function public.get_active_restaurant_bundle_v2(text) owner to hungrie_api_owner;
grant select on public.active_restaurants,public.active_categories,public.active_menu_items,
 public.restaurants,public.categories,public.menu_items,public.menu_item_ingredients,
 public.menu_option_groups,public.menu_option_values to hungrie_api_owner;
revoke create on schema public from hungrie_api_owner;

revoke all on function public.get_my_customer_profile_v1(),public.update_my_customer_profile_v1(text,text,text,text),
 public.list_my_customer_addresses_v1(),public.create_my_customer_address_v1(text,text,text,text,text,text,text,boolean),
 public.update_my_customer_address_v1(text,text,text,text,text,text,text,boolean),public.delete_my_customer_address_v1(text),
 public.set_my_customer_default_address_v1(text),public.list_my_customer_favorites_v1(),public.replace_my_customer_favorites_v1(text[]),
 public.get_my_customer_orders_page_v1(text,integer),public.get_my_customer_order_v1(text),
 public.get_my_customer_active_order_summary_v1(),public.get_my_customer_latest_order_summary_v1(),
 public.request_my_customer_order_reminder_v1(text),public.my_customer_order_realtime_topics_v1(),
 public.list_my_customer_product_reviews_v1(integer),public.list_my_customer_order_reviews_v1(integer),
 public.get_my_customer_order_review_by_order_v1(text),public.submit_my_customer_product_review_v1(text,text,smallint,text),
 public.get_my_customer_product_review_v1(text),public.get_my_customer_order_review_v1(text),
 public.submit_my_customer_order_review_v1(text,smallint,smallint,smallint,smallint,text),
 public.get_my_customer_notification_preferences_v1(),public.update_my_customer_notification_preferences_v1(boolean,boolean),
 public.register_my_customer_push_token_v1(text,public.notification_platform),public.unregister_my_customer_push_token_v1(text)
 from public,anon;
grant execute on function public.get_my_customer_profile_v1(),public.update_my_customer_profile_v1(text,text,text,text),
 public.list_my_customer_addresses_v1(),public.create_my_customer_address_v1(text,text,text,text,text,text,text,boolean),
 public.update_my_customer_address_v1(text,text,text,text,text,text,text,boolean),public.delete_my_customer_address_v1(text),
 public.set_my_customer_default_address_v1(text),public.list_my_customer_favorites_v1(),public.replace_my_customer_favorites_v1(text[]),
 public.get_my_customer_orders_page_v1(text,integer),public.get_my_customer_order_v1(text),
 public.get_my_customer_active_order_summary_v1(),public.get_my_customer_latest_order_summary_v1(),
 public.request_my_customer_order_reminder_v1(text),public.my_customer_order_realtime_topics_v1(),
 public.list_my_customer_product_reviews_v1(integer),public.list_my_customer_order_reviews_v1(integer),
 public.get_my_customer_order_review_by_order_v1(text),public.submit_my_customer_product_review_v1(text,text,smallint,text),
 public.get_my_customer_product_review_v1(text),public.get_my_customer_order_review_v1(text),
 public.submit_my_customer_order_review_v1(text,smallint,smallint,smallint,smallint,text),
 public.get_my_customer_notification_preferences_v1(),public.update_my_customer_notification_preferences_v1(boolean,boolean),
 public.register_my_customer_push_token_v1(text,public.notification_platform),public.unregister_my_customer_push_token_v1(text)
 to authenticated;
revoke all on function public.get_active_restaurant_bundle_v2(text) from public;
grant execute on function public.get_active_restaurant_bundle_v2(text) to anon,authenticated;
