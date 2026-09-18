-- Customer review system v2. Additive local contract; hosted rollout is a later phase.

set check_function_bodies = off;

grant create on schema public, private to hungrie_api_owner;

create type public.review_report_reason as enum (
  'spam', 'abusive_content', 'personal_information',
  'not_related_to_order', 'suspected_fraud', 'other'
);
create type public.review_report_status as enum ('open', 'resolved', 'dismissed');
create type private.meal_reaction as enum ('liked', 'disliked');

create or replace function private.review_v2_safe_items(p_items jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'menuItemId',coalesce(x->>'menuItemId',x->>'menu_item_id'),
    'name',x->>'name','quantity',case when coalesce(x->>'quantity','')~'^[0-9]+$'
      then (x->>'quantity')::integer else null end)) order by n),'[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items)='array' then p_items else '[]'::jsonb end)
    with ordinality as t(x,n)
$$;

-- Capture all legacy values before the catalog-only compatibility alteration.
create temporary table review_v2_legacy_baseline on commit drop as
select count(*)::bigint as row_count,
  encode(extensions.digest(coalesce(string_agg(
    jsonb_build_array(id,review_key,order_id,restaurant_id,profile_id,
      user_name_snapshot,restaurant_name_snapshot,speed_rating,taste_rating,
      value_rating,price_performance_rating,average_rating,comment,items_snapshot,
      status,created_at,updated_at)::text, '' order by id),''),'sha256'),'hex') as row_digest
from public.order_reviews;

alter table public.order_reviews
  add column contract_version smallint not null default 1,
  alter column value_rating drop not null,
  alter column user_name_snapshot drop not null;

alter table public.order_reviews add constraint order_reviews_contract_version_fields_check
check (
  (contract_version = 1 and value_rating is not null and user_name_snapshot is not null)
  or
  (contract_version = 2 and value_rating is null and price_performance_rating is null
    and user_name_snapshot is null)
);

-- Required to bind reaction scope to the exact review/order/Restaurant/Customer tuple.
alter table public.order_reviews add constraint order_reviews_v2_scope_unique
  unique (id, order_id, restaurant_id, profile_id);

do $$
declare v_count bigint; v_digest text; v_before review_v2_legacy_baseline%rowtype;
begin
  select * into strict v_before from review_v2_legacy_baseline;
  select count(*)::bigint,
    encode(extensions.digest(coalesce(string_agg(
      jsonb_build_array(id,review_key,order_id,restaurant_id,profile_id,
        user_name_snapshot,restaurant_name_snapshot,speed_rating,taste_rating,
        value_rating,price_performance_rating,average_rating,comment,items_snapshot,
        status,created_at,updated_at)::text, '' order by id),''),'sha256'),'hex')
    into v_count,v_digest from public.order_reviews;
  if v_count <> v_before.row_count or v_digest <> v_before.row_digest then
    raise exception 'Legacy order-review reconciliation failed';
  end if;
end $$;

create or replace function public.get_my_customer_order_review_state_v2(p_order_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_customer(); v_order public.orders%rowtype; v_review public.order_reviews%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id and profile_id=v_actor;
  if not found then raise exception 'Order not found' using errcode='42501'; end if;
  select * into v_review from public.order_reviews where order_id=p_order_id and profile_id=v_actor;
  return jsonb_build_object('orderId',v_order.id,'reviewed',found,
    'eligible',not found and v_order.status='delivered' and v_order.delivered_at is not null
      and transaction_timestamp()<v_order.delivered_at+interval '30 days',
    'expiresAt',case when v_order.delivered_at is null then null else v_order.delivered_at+interval '30 days' end,
    'review',case when v_review.id is null then null else jsonb_build_object(
      'reviewId',v_review.id,'tasteRating',v_review.taste_rating,'speedRating',v_review.speed_rating,
      'overallRating',round((v_review.taste_rating+v_review.speed_rating)::numeric/2,2),
      'comment',v_review.comment,'items',v_review.items_snapshot,'status',v_review.status,
      'createdAt',v_review.created_at) end);
end $$;

create or replace function public.get_my_customer_review_prompt_v2()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_customer(); v_result jsonb;
begin
  select jsonb_build_object('orderId',o.id,'restaurantId',o.restaurant_id,
    'restaurantName',r.name,'deliveredAt',o.delivered_at,
    'expiresAt',o.delivered_at+interval '30 days',
    'items',coalesce((select jsonb_agg(jsonb_build_object('menuItemId',x.menu_item_id,
      'name',x.item_name,'quantity',x.quantity) order by x.menu_item_id)
      from (select coalesce(oi.menu_item_id,oi.source_menu_item_id) menu_item_id,
        (array_agg(oi.name_snapshot order by oi.created_at,oi.id))[1] item_name,
        sum(oi.quantity)::integer quantity from public.order_items oi where oi.order_id=o.id
        group by coalesce(oi.menu_item_id,oi.source_menu_item_id)) x),'[]'::jsonb))
    into v_result from public.orders o join public.restaurants r on r.id=o.restaurant_id
    where o.profile_id=v_actor and o.status='delivered' and o.delivered_at is not null
      and transaction_timestamp()<o.delivered_at+interval '30 days'
      and not exists(select 1 from public.order_reviews rv where rv.order_id=o.id and rv.profile_id=v_actor)
    order by o.delivered_at desc,o.id desc limit 1;
  return v_result;
end $$;

create or replace function public.get_restaurant_review_summary_v2(p_restaurant_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_build_object('restaurantId',m.restaurant_id,
    'overallRating',m.overall_rating,'tasteRating',m.taste_rating,
    'speedRating',m.speed_rating,'reviewCount',m.review_count)
    from public.restaurant_order_review_metrics_v2 m where m.restaurant_id=p_restaurant_id),
    jsonb_build_object('restaurantId',p_restaurant_id,'overallRating',null,
      'tasteRating',null,'speedRating',null,'reviewCount',0))
$$;

create or replace function public.list_published_restaurant_reviews_v2(
  p_restaurant_id text,p_cursor text default null,p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_created timestamptz; v_id text; v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
  v_items jsonb; v_next text;
begin
  if p_cursor is not null then select d.created_at,d.id into v_created,v_id from private.review_v2_cursor_decode(p_cursor)d; end if;
  with page as (
    select r.* from public.order_reviews r where r.restaurant_id=p_restaurant_id and r.status='published'
      and (p_cursor is null or (r.created_at,r.id)<(v_created,v_id))
    order by r.created_at desc,r.id desc limit v_limit+1
  ), shown as (select * from page order by created_at desc,id desc limit v_limit)
  select coalesce(jsonb_agg(jsonb_build_object('reviewId',s.id,
      'overallRating',round((s.taste_rating+s.speed_rating)::numeric/2,2),
      'tasteRating',s.taste_rating,'speedRating',s.speed_rating,'comment',s.comment,
      'items',private.review_v2_safe_items(s.items_snapshot),
      'date',to_char(s.created_at at time zone 'UTC','YYYY-MM-DD'))
      order by s.created_at desc,s.id desc),'[]'::jsonb),
    case when (select count(*) from page)>v_limit then
      (select private.review_v2_cursor_encode(s2.created_at,s2.id) from shown s2 order by s2.created_at,s2.id limit 1)
      else null end into v_items,v_next from shown s;
  return jsonb_build_object('items',v_items,'nextCursor',v_next,'limit',v_limit);
end $$;

create or replace function public.restaurant_list_order_reviews_v2(
  p_status public.review_status default null,p_report_status public.review_report_status default null,
  p_cursor text default null,p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant(); v_restaurant text:=private.current_restaurant_id();
  v_created timestamptz; v_id text; v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
  v_items jsonb; v_next text;
begin
  if p_cursor is not null then select d.created_at,d.id into v_created,v_id from private.review_v2_cursor_decode(p_cursor)d; end if;
  with page as (
    select r.*,rp.id report_id,rp.reason report_reason,rp.status report_status,rp.created_at report_created_at
    from public.order_reviews r left join private.order_review_reports rp
      on rp.review_id=r.id and rp.restaurant_id=r.restaurant_id
    where r.restaurant_id=v_restaurant and (p_status is null or r.status=p_status)
      and (p_report_status is null or rp.status=p_report_status)
      and (p_cursor is null or (r.created_at,r.id)<(v_created,v_id))
    order by r.created_at desc,r.id desc limit v_limit+1
  ), shown as (select * from page order by created_at desc,id desc limit v_limit)
  select coalesce(jsonb_agg(jsonb_build_object('reviewId',s.id,
      'overallRating',round((s.taste_rating+s.speed_rating)::numeric/2,2),
      'tasteRating',s.taste_rating,'speedRating',s.speed_rating,'comment',s.comment,
      'items',private.review_v2_safe_items(s.items_snapshot),'status',s.status,'createdAt',s.created_at,
      'report',case when s.report_id is null then null else jsonb_build_object(
        'reportId',s.report_id,'reason',s.report_reason,'status',s.report_status,
        'createdAt',s.report_created_at) end) order by s.created_at desc,s.id desc),'[]'::jsonb),
    case when (select count(*) from page)>v_limit then
      (select private.review_v2_cursor_encode(s2.created_at,s2.id) from shown s2 order by s2.created_at,s2.id limit 1)
      else null end into v_items,v_next from shown s;
  return jsonb_build_object('items',v_items,'nextCursor',v_next,'limit',v_limit);
end $$;

create or replace function public.restaurant_report_order_review_v2(
  p_review_id text,p_reason public.review_report_reason,p_internal_note text,p_operation_id uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant(); v_restaurant text:=private.current_restaurant_id();
  v_note text:=nullif(btrim(coalesce(p_internal_note,'')),''); v_hash text; v_result jsonb; v_report uuid;
begin
  if char_length(coalesce(v_note,''))>500 or regexp_replace(coalesce(v_note,''),E'[\\t\\n\\r]','','g') ~ '[[:cntrl:]]' then
    raise exception 'Invalid report note' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('reviewId',p_review_id,
    'reason',p_reason,'note',v_note)::text,'UTF8'),'sha256'),'hex');
  v_result:=private.review_v2_action_replay(v_actor,p_operation_id,'restaurant_report',v_hash);
  if v_result is not null then return v_result; end if;
  if not exists(select 1 from public.order_reviews where id=p_review_id and restaurant_id=v_restaurant) then
    raise exception 'Review unavailable' using errcode='42501'; end if;
  begin
    insert into private.order_review_reports(review_id,restaurant_id,created_by_profile_id,reason,internal_note)
    values(p_review_id,v_restaurant,v_actor,p_reason,v_note) returning id into v_report;
  exception when unique_violation then
    raise exception 'Review has already been reported' using errcode='23505';
  end;
  perform private.write_audit(v_actor,'order_review.reported_v2','order_review_report',v_report::text,
    jsonb_build_object('contract_version',2,'restaurant_id',v_restaurant,
      'operation_id',p_operation_id,'review_id',p_review_id,'report_reason',p_reason));
  return private.review_v2_action_complete(v_actor,p_operation_id,'restaurant_report',v_hash,
    jsonb_build_object('reportId',v_report,'reviewId',p_review_id,'status','open'));
end $$;

create or replace function private.review_v2_reaction_aggregates(p_restaurant_id text,p_after text,p_limit integer)
returns table(menu_item_id text,menu_item_name text,liked_count bigint,disliked_count bigint,positive_percentage numeric)
language sql stable security definer set search_path='' as $$
  select x.menu_item_id,min(x.menu_item_name_snapshot),
    count(*) filter(where x.reaction='liked'),count(*) filter(where x.reaction='disliked'),
    round(100.0*count(*) filter(where x.reaction='liked')/nullif(count(*),0),1)
  from private.order_review_meal_reactions x join public.order_reviews r on r.id=x.review_id
  where x.restaurant_id=p_restaurant_id and r.status='published'
    and (p_after is null or x.menu_item_id>p_after)
  group by x.menu_item_id order by x.menu_item_id limit p_limit
$$;

create or replace function public.restaurant_list_menu_item_reaction_aggregates_v2(
  p_cursor text default null,p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant(); v_restaurant text:=private.current_restaurant_id();
  v_after text:=private.review_v2_item_cursor_decode(p_cursor); v_limit integer:=least(greatest(coalesce(p_limit,50),1),50);
  v_items jsonb; v_next text;
begin
  with page as (select * from private.review_v2_reaction_aggregates(v_restaurant,v_after,v_limit+1)),
  shown as (select * from page limit v_limit)
  select coalesce(jsonb_agg(jsonb_build_object('menuItemId',s.menu_item_id,'menuItemName',s.menu_item_name,
      'likedCount',s.liked_count,'dislikedCount',s.disliked_count,
      'positivePercentage',s.positive_percentage) order by s.menu_item_id),'[]'::jsonb),
    case when (select count(*) from page)>v_limit then
      (select private.review_v2_item_cursor_encode(menu_item_id) from shown order by menu_item_id desc limit 1)
      else null end into v_items,v_next from shown s;
  return jsonb_build_object('items',v_items,'nextCursor',v_next,'limit',v_limit);
end $$;

create table private.order_review_meal_reactions (
  review_id text not null,
  order_id text not null,
  restaurant_id text not null,
  profile_id text not null,
  menu_item_id text not null check (btrim(menu_item_id) <> ''),
  reaction private.meal_reaction not null,
  menu_item_name_snapshot text not null check (btrim(menu_item_name_snapshot) <> ''),
  created_at timestamptz not null default transaction_timestamp(),
  primary key (review_id, menu_item_id),
  unique (order_id, profile_id, menu_item_id),
  foreign key (review_id,order_id,restaurant_id,profile_id)
    references public.order_reviews(id,order_id,restaurant_id,profile_id) on delete restrict
);

create table private.customer_review_operations (
  profile_id text not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  review_id text not null references public.order_reviews(id) on delete restrict,
  created_at timestamptz not null default transaction_timestamp(),
  primary key (profile_id, operation_id)
);

create table private.order_review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id text not null references public.order_reviews(id) on delete restrict,
  restaurant_id text not null references public.restaurants(id) on delete restrict,
  created_by_profile_id text not null references public.profiles(id) on delete restrict,
  reason public.review_report_reason not null,
  internal_note text check (internal_note is null or length(internal_note) <= 500),
  status public.review_report_status not null default 'open',
  status_changed_by_profile_id text references public.profiles(id) on delete restrict,
  status_changed_at timestamptz,
  resolution_note text check (resolution_note is null or length(resolution_note) <= 500),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  unique (restaurant_id, review_id)
);

create table private.review_action_operations (
  actor_profile_id text not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  action text not null check (action in ('restaurant_report','admin_report_status','admin_visibility')),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default transaction_timestamp(),
  primary key (actor_profile_id, operation_id)
);

alter table private.order_review_meal_reactions enable row level security;
alter table private.order_review_meal_reactions force row level security;
alter table private.customer_review_operations enable row level security;
alter table private.customer_review_operations force row level security;
alter table private.order_review_reports enable row level security;
alter table private.order_review_reports force row level security;
alter table private.review_action_operations enable row level security;
alter table private.review_action_operations force row level security;

create policy order_review_meal_reactions_owner on private.order_review_meal_reactions
  for all to hungrie_api_owner using (true) with check (true);
create policy customer_review_operations_owner on private.customer_review_operations
  for all to hungrie_api_owner using (true) with check (true);
create policy order_review_reports_owner on private.order_review_reports
  for all to hungrie_api_owner using (true) with check (true);
create policy review_action_operations_owner on private.review_action_operations
  for all to hungrie_api_owner using (true) with check (true);

revoke all on private.order_review_meal_reactions, private.customer_review_operations,
  private.order_review_reports, private.review_action_operations
  from public, anon, authenticated, service_role;
grant select,insert,update on private.order_review_meal_reactions,
  private.customer_review_operations,private.order_review_reports,
  private.review_action_operations to hungrie_api_owner;

drop index public.order_reviews_restaurant_status_created_idx;
create index order_reviews_restaurant_status_created_id_idx
  on public.order_reviews(restaurant_id,status,created_at desc,id desc);
create index order_reviews_published_feed_idx
  on public.order_reviews(restaurant_id,created_at desc,id desc) where status='published';
create index order_review_reports_restaurant_status_created_id_idx
  on private.order_review_reports(restaurant_id,status,created_at desc,id desc);
create index order_review_reports_status_created_id_idx
  on private.order_review_reports(status,created_at desc,id desc);
create index order_review_reactions_restaurant_item_reaction_idx
  on private.order_review_meal_reactions(restaurant_id,menu_item_id,reaction);

create or replace function private.review_v2_cursor_encode(p_created_at timestamptz,p_id text)
returns text language sql immutable security invoker set search_path='' as $$
  select encode(convert_to(to_char(p_created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||chr(31)||p_id,'UTF8'),'base64')
$$;
create or replace function private.review_v2_cursor_decode(p_cursor text)
returns table(created_at timestamptz,id text) language plpgsql immutable security invoker set search_path='' as $$
declare v text; v_parts text[];
begin
  if p_cursor is null then return; end if;
  begin v:=convert_from(decode(p_cursor,'base64'),'UTF8'); exception when others then
    raise exception 'Invalid review cursor' using errcode='22023'; end;
  v_parts:=string_to_array(v,chr(31));
  if cardinality(v_parts)<>2 or btrim(v_parts[2])='' then
    raise exception 'Invalid review cursor' using errcode='22023';
  end if;
  begin created_at:=(v_parts[1]||'Z')::timestamptz; exception when others then
    raise exception 'Invalid review cursor' using errcode='22023'; end;
  id:=v_parts[2]; return next;
end $$;

create or replace function private.review_v2_item_cursor_encode(p_menu_item_id text)
returns text language sql immutable security invoker set search_path='' as $$
  select encode(convert_to(p_menu_item_id,'UTF8'),'base64')
$$;
create or replace function private.review_v2_item_cursor_decode(p_cursor text)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare v text;
begin
  if p_cursor is null then return null; end if;
  begin v:=convert_from(decode(p_cursor,'base64'),'UTF8'); exception when others then
    raise exception 'Invalid reaction cursor' using errcode='22023'; end;
  if btrim(v)='' then raise exception 'Invalid reaction cursor' using errcode='22023'; end if;
  return v;
end $$;

create or replace function private.review_v2_action_replay(
  p_actor text,p_operation_id uuid,p_action text,p_hash text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v private.review_action_operations%rowtype;
begin
  if p_operation_id is null then raise exception 'Operation ID is required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('review-v2:'||p_actor||':'||p_operation_id::text,0));
  select * into v from private.review_action_operations
    where actor_profile_id=p_actor and operation_id=p_operation_id;
  if found and (v.action<>p_action or v.request_sha256<>p_hash) then
    raise exception 'Operation ID was reused with different input' using errcode='22023';
  end if;
  if found then return v.result||jsonb_build_object('replayed',true); end if;
  return null;
end $$;

create or replace function private.review_v2_action_complete(
  p_actor text,p_operation_id uuid,p_action text,p_hash text,p_result jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  insert into private.review_action_operations(actor_profile_id,operation_id,action,request_sha256,result)
  values(p_actor,p_operation_id,p_action,p_hash,p_result);
  return p_result||jsonb_build_object('replayed',false);
end $$;

create or replace view public.restaurant_order_review_metrics_v2
with (security_invoker=true,security_barrier=true) as
select restaurant_id,count(*)::integer as review_count,
  round(avg((taste_rating+speed_rating)::numeric/2),2) as overall_rating,
  round(avg(taste_rating)::numeric,2) as taste_rating,
  round(avg(speed_rating)::numeric,2) as speed_rating
from public.order_reviews where status='published' group by restaurant_id;
revoke all on public.restaurant_order_review_metrics_v2 from public,anon,authenticated,service_role;
grant select on public.restaurant_order_review_metrics_v2 to hungrie_api_owner;

create or replace function public.submit_my_customer_order_review_v2(
  p_order_id text,p_taste_rating smallint,p_speed_rating smallint,p_comment text,
  p_meal_reactions_json jsonb,p_operation_id uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor text:=private.require_active_customer(); v_order public.orders%rowtype;
  v_restaurant_name text; v_comment text; v_canonical_reactions jsonb; v_hash text;
  v_existing private.customer_review_operations%rowtype; v_review_id text:=gen_random_uuid()::text;
  v_items jsonb; v_count integer; v_matched integer;
begin
  if p_operation_id is null or btrim(coalesce(p_order_id,''))='' then
    raise exception 'Order and operation IDs are required' using errcode='22023';
  end if;
  if p_taste_rating not between 1 and 5 or p_speed_rating not between 1 and 5 then
    raise exception 'Taste and speed must be between 1 and 5' using errcode='22023';
  end if;
  v_comment:=normalize(btrim(coalesce(p_comment,'')),NFC);
  if char_length(v_comment)>500 or regexp_replace(v_comment,E'[\\t\\n\\r]','','g') ~ '[[:cntrl:]]' then
    raise exception 'Invalid review comment' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_meal_reactions_json,'null'::jsonb))<>'array' then
    raise exception 'Meal reactions must be an array' using errcode='22023';
  end if;
  v_count:=jsonb_array_length(p_meal_reactions_json);
  if v_count>100 then raise exception 'At most 100 meal reactions are allowed' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_meal_reactions_json) e
    where jsonb_typeof(e)<>'object' or case when jsonb_typeof(e)='object' then
      (select count(*) from jsonb_object_keys(e))<>2
      or not (e ? 'menuItemId' and e ? 'reaction')
      or exists(select 1 from jsonb_object_keys(e) k where k not in ('menuItemId','reaction'))
      or btrim(coalesce(e->>'menuItemId',''))=''
      or coalesce(e->>'reaction','') not in ('liked','disliked') else false end) then
    raise exception 'Invalid meal reaction object' using errcode='22023';
  end if;
  if (select count(*)<>count(distinct btrim(e->>'menuItemId')) from jsonb_array_elements(p_meal_reactions_json) e) then
    raise exception 'Duplicate meal reaction menu item' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('menuItemId',btrim(e->>'menuItemId'),
      'reaction',e->>'reaction') order by btrim(e->>'menuItemId')),'[]'::jsonb)
    into v_canonical_reactions from jsonb_array_elements(p_meal_reactions_json) e;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('orderId',p_order_id,
    'tasteRating',p_taste_rating,'speedRating',p_speed_rating,'comment',v_comment,
    'mealReactions',v_canonical_reactions)::text,'UTF8'),'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtextextended('customer-review-op:'||v_actor||':'||p_operation_id::text,0));
  select * into v_existing from private.customer_review_operations
    where profile_id=v_actor and operation_id=p_operation_id;
  if found then
    if v_existing.request_sha256<>v_hash then
      raise exception 'Operation ID was reused with different input' using errcode='22023';
    end if;
    return jsonb_build_object('reviewId',v_existing.review_id,'replayed',true);
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.profile_id<>v_actor then
    raise exception 'Owned delivered order required' using errcode='42501';
  end if;
  if v_order.status<>'delivered' or v_order.delivered_at is null then
    raise exception 'Owned delivered order required' using errcode='42501';
  end if;
  if transaction_timestamp()>=v_order.delivered_at+interval '30 days' then
    raise exception 'Review window has expired' using errcode='22023';
  end if;
  if exists(select 1 from public.order_reviews where order_id=p_order_id and profile_id=v_actor) then
    raise exception 'Order already reviewed' using errcode='23505';
  end if;
  select count(distinct btrim(e->>'menuItemId')) into v_matched
  from jsonb_array_elements(p_meal_reactions_json) e
  where exists(select 1 from public.order_items oi where oi.order_id=p_order_id
    and coalesce(oi.menu_item_id,oi.source_menu_item_id)=btrim(e->>'menuItemId'));
  if v_matched<>v_count then raise exception 'Reaction item is not part of the order' using errcode='22023'; end if;

  select name into strict v_restaurant_name from public.restaurants where id=v_order.restaurant_id;
  select coalesce(jsonb_agg(jsonb_build_object('menuItemId',x.menu_item_id,'name',x.item_name,
    'quantity',x.quantity) order by x.menu_item_id),'[]'::jsonb) into v_items
  from (select coalesce(oi.menu_item_id,oi.source_menu_item_id) menu_item_id,
      (array_agg(oi.name_snapshot order by oi.created_at,oi.id))[1] item_name,
      sum(oi.quantity)::integer quantity from public.order_items oi where oi.order_id=p_order_id
      group by coalesce(oi.menu_item_id,oi.source_menu_item_id)) x;

  insert into public.order_reviews(id,review_key,order_id,restaurant_id,profile_id,
    user_name_snapshot,restaurant_name_snapshot,speed_rating,taste_rating,value_rating,
    price_performance_rating,comment,items_snapshot,status,contract_version)
  values(v_review_id,p_order_id||'__'||v_actor,p_order_id,v_order.restaurant_id,v_actor,
    null,v_restaurant_name,p_speed_rating,p_taste_rating,null,null,v_comment,v_items,'published',2);

  insert into private.order_review_meal_reactions(review_id,order_id,restaurant_id,profile_id,
    menu_item_id,reaction,menu_item_name_snapshot)
  select v_review_id,p_order_id,v_order.restaurant_id,v_actor,btrim(e->>'menuItemId'),
    (e->>'reaction')::private.meal_reaction,
    (select (array_agg(oi.name_snapshot order by oi.created_at,oi.id))[1]
      from public.order_items oi where oi.order_id=p_order_id
       and coalesce(oi.menu_item_id,oi.source_menu_item_id)=btrim(e->>'menuItemId'))
  from jsonb_array_elements(p_meal_reactions_json) e;
  insert into private.customer_review_operations(profile_id,operation_id,request_sha256,review_id)
    values(v_actor,p_operation_id,v_hash,v_review_id);
  perform private.write_audit(v_actor,'order_review.submitted_v2','order_review',v_review_id,
    jsonb_build_object('contract_version',2,'restaurant_id',v_order.restaurant_id,
      'operation_id',p_operation_id,'reaction_count',v_count));
  return jsonb_build_object('reviewId',v_review_id,'replayed',false);
end $$;

create or replace function public.admin_list_order_review_reports_v2(
  p_status public.review_report_status default null,p_restaurant_id text default null,
  p_cursor text default null,p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_admin('admin'); v_created timestamptz; v_id text;
  v_limit integer:=least(greatest(coalesce(p_limit,20),1),50); v_items jsonb; v_next text;
begin
  if p_cursor is not null then select d.created_at,d.id into v_created,v_id from private.review_v2_cursor_decode(p_cursor)d; end if;
  with page as (
    select rp.*,r.taste_rating,r.speed_rating,r.comment,r.items_snapshot,r.status review_status,r.created_at review_created_at
    from private.order_review_reports rp join public.order_reviews r on r.id=rp.review_id
    where (p_status is null or rp.status=p_status)
      and (p_restaurant_id is null or rp.restaurant_id=p_restaurant_id)
      and (p_cursor is null or (rp.created_at,rp.id::text)<(v_created,v_id))
    order by rp.created_at desc,rp.id desc limit v_limit+1
  ), shown as (select * from page order by created_at desc,id desc limit v_limit)
  select coalesce(jsonb_agg(jsonb_build_object('reportId',s.id,'reviewId',s.review_id,
      'restaurantId',s.restaurant_id,'reason',s.reason,'internalNote',s.internal_note,
      'reportStatus',s.status,'resolutionNote',s.resolution_note,'reportCreatedAt',s.created_at,
      'review',jsonb_build_object('overallRating',round((s.taste_rating+s.speed_rating)::numeric/2,2),
        'tasteRating',s.taste_rating,'speedRating',s.speed_rating,'comment',s.comment,
        'items',private.review_v2_safe_items(s.items_snapshot),
        'status',s.review_status,'createdAt',s.review_created_at))
      order by s.created_at desc,s.id desc),'[]'::jsonb),
    case when (select count(*) from page)>v_limit then
      (select private.review_v2_cursor_encode(s2.created_at,s2.id::text) from shown s2 order by s2.created_at,s2.id limit 1)
      else null end into v_items,v_next from shown s;
  return jsonb_build_object('items',v_items,'nextCursor',v_next,'limit',v_limit);
end $$;

create or replace function public.admin_set_order_review_report_status_v2(
  p_report_id uuid,p_status public.review_report_status,p_resolution_note text,p_operation_id uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_admin('admin'); v_note text:=nullif(btrim(coalesce(p_resolution_note,'')),'');
  v_report private.order_review_reports%rowtype; v_hash text; v_result jsonb;
begin
  if char_length(coalesce(v_note,''))>500 or regexp_replace(coalesce(v_note,''),E'[\\t\\n\\r]','','g') ~ '[[:cntrl:]]' then
    raise exception 'Invalid resolution note' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('reportId',p_report_id,
    'status',p_status,'note',v_note)::text,'UTF8'),'sha256'),'hex');
  v_result:=private.review_v2_action_replay(v_actor,p_operation_id,'admin_report_status',v_hash);
  if v_result is not null then return v_result; end if;
  select * into v_report from private.order_review_reports where id=p_report_id for update;
  if not found then raise exception 'Report not found' using errcode='22023'; end if;
  if v_report.status=p_status then raise exception 'Report status is unchanged' using errcode='22023'; end if;
  if v_report.status<>'open' and p_status<>'open' then
    raise exception 'Direct terminal report transition is not allowed' using errcode='22023'; end if;
  update private.order_review_reports set status=p_status,resolution_note=v_note,
    status_changed_by_profile_id=v_actor,status_changed_at=transaction_timestamp(),
    updated_at=transaction_timestamp() where id=p_report_id;
  perform private.write_audit(v_actor,'order_review.report_status_changed_v2','order_review_report',p_report_id::text,
    jsonb_build_object('contract_version',2,'restaurant_id',v_report.restaurant_id,
      'operation_id',p_operation_id,'review_id',v_report.review_id,'report_reason',v_report.reason,
      'prior_state',v_report.status,'new_state',p_status));
  return private.review_v2_action_complete(v_actor,p_operation_id,'admin_report_status',v_hash,
    jsonb_build_object('reportId',p_report_id,'status',p_status));
end $$;

create or replace function public.admin_set_order_review_visibility_v2(
  p_review_id text,p_status public.review_status,p_reason text,p_operation_id uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_admin('admin'); v_reason text:=btrim(coalesce(p_reason,''));
  v_review public.order_reviews%rowtype; v_hash text; v_result jsonb;
begin
  perform private.require_recent_admin_auth(interval '5 minutes');
  if p_status not in ('published','hidden') or char_length(v_reason) not between 1 and 500
    or regexp_replace(v_reason,E'[\\t\\n\\r]','','g') ~ '[[:cntrl:]]' then
    raise exception 'Invalid moderation input' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('reviewId',p_review_id,
    'status',p_status,'reason',v_reason)::text,'UTF8'),'sha256'),'hex');
  v_result:=private.review_v2_action_replay(v_actor,p_operation_id,'admin_visibility',v_hash);
  if v_result is not null then return v_result; end if;
  select * into v_review from public.order_reviews where id=p_review_id for update;
  if not found then raise exception 'Review not found' using errcode='22023'; end if;
  if v_review.status=p_status then raise exception 'Review visibility is unchanged' using errcode='22023'; end if;
  update public.order_reviews set status=p_status where id=p_review_id;
  perform private.write_audit(v_actor,'order_review.visibility_changed_v2','order_review',p_review_id,
    jsonb_build_object('contract_version',2,'restaurant_id',v_review.restaurant_id,
      'operation_id',p_operation_id,'prior_state',v_review.status,'new_state',p_status,
      'moderation_reason',v_reason));
  return private.review_v2_action_complete(v_actor,p_operation_id,'admin_visibility',v_hash,
    jsonb_build_object('reviewId',p_review_id,'status',p_status));
end $$;

create or replace function public.admin_list_menu_item_reaction_aggregates_v2(
  p_restaurant_id text,p_cursor text default null,p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_admin('admin');
  v_after text:=private.review_v2_item_cursor_decode(p_cursor); v_limit integer:=least(greatest(coalesce(p_limit,50),1),50);
  v_items jsonb; v_next text;
begin
  with page as (select * from private.review_v2_reaction_aggregates(p_restaurant_id,v_after,v_limit+1)),
  shown as (select * from page limit v_limit)
  select coalesce(jsonb_agg(jsonb_build_object('menuItemId',s.menu_item_id,'menuItemName',s.menu_item_name,
      'likedCount',s.liked_count,'dislikedCount',s.disliked_count,
      'positivePercentage',s.positive_percentage) order by s.menu_item_id),'[]'::jsonb),
    case when (select count(*) from page)>v_limit then
      (select private.review_v2_item_cursor_encode(menu_item_id) from shown order by menu_item_id desc limit 1)
      else null end into v_items,v_next from shown s;
  return jsonb_build_object('items',v_items,'nextCursor',v_next,'limit',v_limit);
end $$;

-- Reconcile the two Development-drifted helpers to their checked-in/Staging projections.
create or replace function public.list_my_product_reviews(p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_profile();
begin
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select r.id,r.restaurant_id,r.menu_item_id,r.user_name_snapshot,
      r.menu_item_name_snapshot,r.rating,r.comment,r.status,r.reply,
      r.replied_at,r.created_at,r.updated_at from public.product_reviews r
    where r.profile_id=v_actor order by r.created_at desc
    limit least(greatest(coalesce(p_limit,30),1),100))x),'[]'::jsonb);
end $$;

create or replace function public.list_my_order_reviews(p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_profile();
begin
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select r.id,r.restaurant_id,r.user_name_snapshot,r.restaurant_name_snapshot,
      r.speed_rating,r.taste_rating,r.value_rating,r.price_performance_rating,
      r.average_rating,r.comment,r.items_snapshot,r.status,r.created_at,r.updated_at
    from public.order_reviews r where r.profile_id=v_actor order by r.created_at desc
    limit least(greatest(coalesce(p_limit,30),1),100))x),'[]'::jsonb);
end $$;

-- Legacy moderation remains available for legacy rows only. No legacy Restaurant
-- path may mutate a v2 order review; v2 visibility is exclusively Admin-controlled.
create or replace function public.moderate_review(
  p_review_type text,p_review_id text,p_status public.review_status,p_reply text default null
) returns void language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_profile(); v_restaurant_id text;
begin
  if length(coalesce(p_reply,''))>500 then
    raise exception 'Review reply cannot exceed 500 characters' using errcode='22023'; end if;
  if p_review_type='product' then
    select restaurant_id into v_restaurant_id from public.product_reviews where id=p_review_id;
  elsif p_review_type='order' then
    if p_reply is not null then raise exception 'Order reviews do not support replies' using errcode='22023'; end if;
    select restaurant_id into v_restaurant_id from public.order_reviews
      where id=p_review_id and contract_version=1;
  else raise exception 'Unknown review type' using errcode='22023'; end if;
  if v_restaurant_id is null
    or (not private.is_restaurant_member(v_restaurant_id) and not private.is_admin()) then
    raise exception 'Review moderation is not allowed' using errcode='42501'; end if;
  if p_review_type='product' then
    update public.product_reviews set status=p_status,reply=nullif(btrim(coalesce(p_reply,'')),''),
      replied_at=case when nullif(btrim(coalesce(p_reply,'')),'') is null then null else statement_timestamp() end
      where id=p_review_id;
  else update public.order_reviews set status=p_status where id=p_review_id and contract_version=1; end if;
  perform private.write_audit(v_actor,'review.moderated',p_review_type||'_review',p_review_id,
    jsonb_build_object('status',p_status,'restaurant_id',v_restaurant_id));
end $$;

create or replace function public.restaurant_moderate_review_v1(
  p_review_type text,p_review_id text,p_status text,p_reply text,p_operation_id uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=private.require_active_restaurant();v_restaurant text:=private.current_restaurant_id();
  v_digest text;v_result jsonb;
begin
  if p_review_type not in('product','order') or p_status not in('published','hidden')
    or length(coalesce(p_reply,''))>1000 then
    raise exception 'Invalid review moderation' using errcode='22023';end if;
  v_digest:=encode(extensions.digest(concat_ws(':',p_review_type,p_review_id,p_status,p_reply),'sha256'),'hex');
  v_result:=private.phase5_operation(p_operation_id,'review_moderation',v_digest);
  if v_result is not null then return v_result;end if;
  if p_review_type='product' then
    update public.product_reviews set status=p_status::public.review_status,
      reply=nullif(btrim(p_reply),''),replied_at=case when nullif(btrim(p_reply),'')is null
        then null else statement_timestamp()end where id=p_review_id and restaurant_id=v_restaurant;
  else
    update public.order_reviews set status=p_status::public.review_status
      where id=p_review_id and restaurant_id=v_restaurant and contract_version=1;
  end if;
  if not found then raise exception 'Review unavailable' using errcode='42501';end if;
  perform private.write_audit(v_actor,'restaurant.review_moderated',p_review_type||'_review',p_review_id,
    jsonb_build_object('operation_id',p_operation_id,'status',p_status));
  v_result:=jsonb_build_object('reviewId',p_review_id,'status',p_status);
  perform private.phase5_operation(p_operation_id,'review_moderation',v_digest,v_result);
  return v_result;
end $$;

alter table private.order_review_meal_reactions owner to hungrie_api_owner;
alter table private.customer_review_operations owner to hungrie_api_owner;
alter table private.order_review_reports owner to hungrie_api_owner;
alter table private.review_action_operations owner to hungrie_api_owner;
alter view public.restaurant_order_review_metrics_v2 owner to hungrie_api_owner;

alter function private.review_v2_cursor_encode(timestamptz,text) owner to hungrie_api_owner;
alter function private.review_v2_safe_items(jsonb) owner to hungrie_api_owner;
alter function private.review_v2_cursor_decode(text) owner to hungrie_api_owner;
alter function private.review_v2_item_cursor_encode(text) owner to hungrie_api_owner;
alter function private.review_v2_item_cursor_decode(text) owner to hungrie_api_owner;
alter function private.review_v2_action_replay(text,uuid,text,text) owner to hungrie_api_owner;
alter function private.review_v2_action_complete(text,uuid,text,text,jsonb) owner to hungrie_api_owner;
alter function private.review_v2_reaction_aggregates(text,text,integer) owner to hungrie_api_owner;
alter function public.submit_my_customer_order_review_v2(text,smallint,smallint,text,jsonb,uuid) owner to hungrie_api_owner;
alter function public.get_my_customer_order_review_state_v2(text) owner to hungrie_api_owner;
alter function public.get_my_customer_review_prompt_v2() owner to hungrie_api_owner;
alter function public.get_restaurant_review_summary_v2(text) owner to hungrie_api_owner;
alter function public.list_published_restaurant_reviews_v2(text,text,integer) owner to hungrie_api_owner;
alter function public.restaurant_list_order_reviews_v2(public.review_status,public.review_report_status,text,integer) owner to hungrie_api_owner;
alter function public.restaurant_report_order_review_v2(text,public.review_report_reason,text,uuid) owner to hungrie_api_owner;
alter function public.restaurant_list_menu_item_reaction_aggregates_v2(text,integer) owner to hungrie_api_owner;
alter function public.admin_list_order_review_reports_v2(public.review_report_status,text,text,integer) owner to hungrie_api_owner;
alter function public.admin_set_order_review_report_status_v2(uuid,public.review_report_status,text,uuid) owner to hungrie_api_owner;
alter function public.admin_set_order_review_visibility_v2(text,public.review_status,text,uuid) owner to hungrie_api_owner;
alter function public.admin_list_menu_item_reaction_aggregates_v2(text,text,integer) owner to hungrie_api_owner;
alter function public.list_my_product_reviews(integer) owner to hungrie_api_owner;
alter function public.list_my_order_reviews(integer) owner to hungrie_api_owner;
alter function public.moderate_review(text,text,public.review_status,text) owner to hungrie_api_owner;
alter function public.restaurant_moderate_review_v1(text,text,text,text,uuid) owner to hungrie_api_owner;

revoke all on function private.review_v2_safe_items(jsonb),private.review_v2_cursor_encode(timestamptz,text),
  private.review_v2_cursor_decode(text),private.review_v2_item_cursor_encode(text),
  private.review_v2_item_cursor_decode(text),private.review_v2_action_replay(text,uuid,text,text),
  private.review_v2_action_complete(text,uuid,text,text,jsonb),
  private.review_v2_reaction_aggregates(text,text,integer) from public,anon,authenticated,service_role;
grant execute on function private.review_v2_safe_items(jsonb),private.review_v2_cursor_encode(timestamptz,text),
  private.review_v2_cursor_decode(text),private.review_v2_item_cursor_encode(text),
  private.review_v2_item_cursor_decode(text),private.review_v2_action_replay(text,uuid,text,text),
  private.review_v2_action_complete(text,uuid,text,text,jsonb),
  private.review_v2_reaction_aggregates(text,text,integer) to hungrie_api_owner;

revoke all on function public.submit_my_customer_order_review_v2(text,smallint,smallint,text,jsonb,uuid),
  public.get_my_customer_order_review_state_v2(text),public.get_my_customer_review_prompt_v2(),
  public.get_restaurant_review_summary_v2(text),public.list_published_restaurant_reviews_v2(text,text,integer),
  public.restaurant_list_order_reviews_v2(public.review_status,public.review_report_status,text,integer),
  public.restaurant_report_order_review_v2(text,public.review_report_reason,text,uuid),
  public.restaurant_list_menu_item_reaction_aggregates_v2(text,integer),
  public.admin_list_order_review_reports_v2(public.review_report_status,text,text,integer),
  public.admin_set_order_review_report_status_v2(uuid,public.review_report_status,text,uuid),
  public.admin_set_order_review_visibility_v2(text,public.review_status,text,uuid),
  public.admin_list_menu_item_reaction_aggregates_v2(text,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_restaurant_review_summary_v2(text),
  public.list_published_restaurant_reviews_v2(text,text,integer) to anon,authenticated;
grant execute on function public.submit_my_customer_order_review_v2(text,smallint,smallint,text,jsonb,uuid),
  public.get_my_customer_order_review_state_v2(text),public.get_my_customer_review_prompt_v2(),
  public.restaurant_list_order_reviews_v2(public.review_status,public.review_report_status,text,integer),
  public.restaurant_report_order_review_v2(text,public.review_report_reason,text,uuid),
  public.restaurant_list_menu_item_reaction_aggregates_v2(text,integer),
  public.admin_list_order_review_reports_v2(public.review_report_status,text,text,integer),
  public.admin_set_order_review_report_status_v2(uuid,public.review_report_status,text,uuid),
  public.admin_set_order_review_visibility_v2(text,public.review_status,text,uuid),
  public.admin_list_menu_item_reaction_aggregates_v2(text,text,integer) to authenticated;

revoke create on schema public, private from hungrie_api_owner;
set check_function_bodies = on;
