-- Milestone 7: protected review staging/quarantine and database-owned metrics.
-- Review runtime remains Firebase-backed until imported orders exist.

create table migration.product_reviews_stage (
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  id text not null check (btrim(id) <> ''),
  review_key text not null check (btrim(review_key) <> ''),
  order_id text not null check (btrim(order_id) <> ''),
  restaurant_id text not null check (btrim(restaurant_id) <> ''),
  menu_item_id text not null check (btrim(menu_item_id) <> ''),
  source_user_id text not null check (btrim(source_user_id) <> ''),
  profile_id text,
  user_name_snapshot text not null check (btrim(user_name_snapshot) <> ''),
  menu_item_name_snapshot text not null check (btrim(menu_item_name_snapshot) <> ''),
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (length(comment) <= 500),
  status public.review_status not null,
  reply text check (reply is null or length(reply) <= 500),
  replied_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  document_checksum text not null check (document_checksum ~ '^[0-9a-f]{64}$'),
  primary key (run_id, id),
  unique (run_id, review_key)
);

create table migration.order_reviews_stage (
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  id text not null check (btrim(id) <> ''),
  review_key text not null check (btrim(review_key) <> ''),
  order_id text not null check (btrim(order_id) <> ''),
  restaurant_id text not null check (btrim(restaurant_id) <> ''),
  source_user_id text not null check (btrim(source_user_id) <> ''),
  profile_id text,
  user_name_snapshot text not null check (btrim(user_name_snapshot) <> ''),
  restaurant_name_snapshot text not null check (btrim(restaurant_name_snapshot) <> ''),
  speed_rating smallint not null check (speed_rating between 1 and 5),
  taste_rating smallint not null check (taste_rating between 1 and 5),
  value_rating smallint not null check (value_rating between 1 and 5),
  price_performance_rating smallint check (price_performance_rating is null or price_performance_rating between 1 and 5),
  comment text not null default '' check (length(comment) <= 500),
  items_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(items_snapshot) = 'array'),
  status public.review_status not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  document_checksum text not null check (document_checksum ~ '^[0-9a-f]{64}$'),
  primary key (run_id, id),
  unique (run_id, review_key)
);

create table migration.review_quarantine (
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  collection_path text not null check (collection_path in ('reviews', 'orderReviews')),
  document_id text not null check (btrim(document_id) <> ''),
  reason_code text not null check (btrim(reason_code) <> ''),
  reason_details jsonb not null default '{}'::jsonb check (jsonb_typeof(reason_details) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  primary key (run_id, collection_path, document_id, reason_code)
);

create index product_reviews_stage_run_relationship_idx
  on migration.product_reviews_stage(run_id, order_id, restaurant_id, menu_item_id, source_user_id);
create index order_reviews_stage_run_relationship_idx
  on migration.order_reviews_stage(run_id, order_id, restaurant_id, source_user_id);
create index review_quarantine_run_reason_idx
  on migration.review_quarantine(run_id, reason_code, collection_path);

revoke all on migration.product_reviews_stage, migration.order_reviews_stage,
  migration.review_quarantine from public, anon, authenticated;

create or replace function migration.revalidate_review_import(p_run_id uuid)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare v_product_valid bigint; v_order_valid bigint; v_quarantined bigint;
begin
  perform 1 from migration.import_runs where id=p_run_id for update;
  if not found then raise exception 'Unknown review import run'; end if;

  delete from migration.review_quarantine where run_id=p_run_id;

  update migration.product_reviews_stage s set profile_id = (
    select p.id from public.profiles p
    where p.deleted_at is null and p.deletion_pending_at is null
      and (p.firebase_uid=s.source_user_id or (p.firebase_uid is null and p.id=s.source_user_id))
    order by (p.firebase_uid=s.source_user_id) desc limit 1
  ) where s.run_id=p_run_id;
  update migration.order_reviews_stage s set profile_id = (
    select p.id from public.profiles p
    where p.deleted_at is null and p.deletion_pending_at is null
      and (p.firebase_uid=s.source_user_id or (p.firebase_uid is null and p.id=s.source_user_id))
    order by (p.firebase_uid=s.source_user_id) desc limit 1
  ) where s.run_id=p_run_id;

  insert into migration.review_quarantine(run_id,collection_path,document_id,reason_code)
    select p_run_id,'reviews',s.id,'PROFILE_NOT_IMPORTED' from migration.product_reviews_stage s
    where s.run_id=p_run_id and s.profile_id is null;
  insert into migration.review_quarantine(run_id,collection_path,document_id,reason_code)
    select p_run_id,'reviews',s.id,'ORDER_NOT_IMPORTED' from migration.product_reviews_stage s
    where s.run_id=p_run_id and not exists(select 1 from public.orders o where o.id=s.order_id);
  insert into migration.review_quarantine(run_id,collection_path,document_id,reason_code)
    select p_run_id,'reviews',s.id,'RESTAURANT_NOT_IMPORTED' from migration.product_reviews_stage s
    where s.run_id=p_run_id and not exists(select 1 from public.restaurants r where r.id=s.restaurant_id);
  insert into migration.review_quarantine(run_id,collection_path,document_id,reason_code)
    select p_run_id,'reviews',s.id,'MENU_ITEM_NOT_IMPORTED' from migration.product_reviews_stage s
    where s.run_id=p_run_id and not exists(select 1 from public.menu_items m where m.id=s.menu_item_id);
  insert into migration.review_quarantine(run_id,collection_path,document_id,reason_code)
    select p_run_id,'reviews',s.id,'ORDER_NOT_DELIVERED' from migration.product_reviews_stage s
    where s.run_id=p_run_id and exists(select 1 from public.orders o where o.id=s.order_id and o.status<>'delivered');
  insert into migration.review_quarantine(run_id,collection_path,document_id,reason_code)
    select p_run_id,'reviews',s.id,'ORDER_RELATIONSHIP_MISMATCH' from migration.product_reviews_stage s
    where s.run_id=p_run_id and s.profile_id is not null and exists(
      select 1 from public.orders o where o.id=s.order_id and (o.restaurant_id<>s.restaurant_id or o.profile_id<>s.profile_id)
    );
  insert into migration.review_quarantine(run_id,collection_path,document_id,reason_code)
    select p_run_id,'reviews',s.id,'MENU_RESTAURANT_MISMATCH' from migration.product_reviews_stage s
    where s.run_id=p_run_id and exists(select 1 from public.menu_items m where m.id=s.menu_item_id and m.restaurant_id<>s.restaurant_id);
  insert into migration.review_quarantine(run_id,collection_path,document_id,reason_code)
    select p_run_id,'reviews',s.id,'ORDER_ITEM_NOT_FOUND' from migration.product_reviews_stage s
    where s.run_id=p_run_id and not exists(
      select 1 from public.order_items oi where oi.order_id=s.order_id and oi.menu_item_id=s.menu_item_id
    );

  insert into migration.review_quarantine(run_id,collection_path,document_id,reason_code)
    select p_run_id,'orderReviews',s.id,'PROFILE_NOT_IMPORTED' from migration.order_reviews_stage s
    where s.run_id=p_run_id and s.profile_id is null;
  insert into migration.review_quarantine(run_id,collection_path,document_id,reason_code)
    select p_run_id,'orderReviews',s.id,'ORDER_NOT_IMPORTED' from migration.order_reviews_stage s
    where s.run_id=p_run_id and not exists(select 1 from public.orders o where o.id=s.order_id);
  insert into migration.review_quarantine(run_id,collection_path,document_id,reason_code)
    select p_run_id,'orderReviews',s.id,'RESTAURANT_NOT_IMPORTED' from migration.order_reviews_stage s
    where s.run_id=p_run_id and not exists(select 1 from public.restaurants r where r.id=s.restaurant_id);
  insert into migration.review_quarantine(run_id,collection_path,document_id,reason_code)
    select p_run_id,'orderReviews',s.id,'ORDER_NOT_DELIVERED' from migration.order_reviews_stage s
    where s.run_id=p_run_id and exists(select 1 from public.orders o where o.id=s.order_id and o.status<>'delivered');
  insert into migration.review_quarantine(run_id,collection_path,document_id,reason_code)
    select p_run_id,'orderReviews',s.id,'ORDER_RELATIONSHIP_MISMATCH' from migration.order_reviews_stage s
    where s.run_id=p_run_id and s.profile_id is not null and exists(
      select 1 from public.orders o where o.id=s.order_id and (o.restaurant_id<>s.restaurant_id or o.profile_id<>s.profile_id)
    );

  select count(*) into v_product_valid from migration.product_reviews_stage s
    where s.run_id=p_run_id and not exists(select 1 from migration.review_quarantine q where q.run_id=p_run_id and q.collection_path='reviews' and q.document_id=s.id);
  select count(*) into v_order_valid from migration.order_reviews_stage s
    where s.run_id=p_run_id and not exists(select 1 from migration.review_quarantine q where q.run_id=p_run_id and q.collection_path='orderReviews' and q.document_id=s.id);
  select count(distinct (collection_path,document_id)) into v_quarantined from migration.review_quarantine where run_id=p_run_id;
  return jsonb_build_object('product_valid',v_product_valid,'order_valid',v_order_valid,'quarantined',v_quarantined);
end $$;

create or replace function private.refresh_product_review_metrics(p_restaurant_id text, p_menu_item_id text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_count integer; v_average numeric(3,2);
begin
  if p_menu_item_id is not null then
    select count(*)::integer,coalesce(round(avg(rating)::numeric,2),0) into v_count,v_average
      from public.product_reviews where menu_item_id=p_menu_item_id and status='published';
    update public.menu_items set rating_count=v_count,rating_average=v_average where id=p_menu_item_id;
  end if;
  if p_restaurant_id is not null then
    select count(*)::integer,coalesce(round(avg(rating)::numeric,2),0) into v_count,v_average
      from public.product_reviews where restaurant_id=p_restaurant_id and status='published';
    update public.restaurants set rating_count=v_count,rating_average=v_average where id=p_restaurant_id;
  end if;
end $$;

create or replace function private.product_review_metrics_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op<>'INSERT' then perform private.refresh_product_review_metrics(old.restaurant_id,old.menu_item_id); end if;
  if tg_op<>'DELETE' and (tg_op='INSERT' or old.restaurant_id is distinct from new.restaurant_id or old.menu_item_id is distinct from new.menu_item_id) then
    perform private.refresh_product_review_metrics(new.restaurant_id,new.menu_item_id);
  elsif tg_op='UPDATE' then
    perform private.refresh_product_review_metrics(new.restaurant_id,new.menu_item_id);
  end if;
  return coalesce(new,old);
end $$;

create trigger product_reviews_refresh_metrics
after insert or update of rating,status,restaurant_id,menu_item_id or delete on public.product_reviews
for each row execute function private.product_review_metrics_trigger();

create or replace view public.menu_item_review_metrics with (security_invoker=true,security_barrier=true) as
select menu_item_id,restaurant_id,count(*)::integer as rating_count,round(avg(rating)::numeric,2) as rating_average,
  jsonb_build_object('1',count(*) filter(where rating=1),'2',count(*) filter(where rating=2),'3',count(*) filter(where rating=3),'4',count(*) filter(where rating=4),'5',count(*) filter(where rating=5)) as distribution
from public.product_reviews where status='published' group by menu_item_id,restaurant_id;

create or replace view public.restaurant_product_review_metrics with (security_invoker=true,security_barrier=true) as
select restaurant_id,count(*)::integer as rating_count,round(avg(rating)::numeric,2) as rating_average,
  jsonb_build_object('1',count(*) filter(where rating=1),'2',count(*) filter(where rating=2),'3',count(*) filter(where rating=3),'4',count(*) filter(where rating=4),'5',count(*) filter(where rating=5)) as distribution
from public.product_reviews where status='published' group by restaurant_id;

create or replace view public.restaurant_order_review_metrics with (security_invoker=true,security_barrier=true) as
select restaurant_id,count(*)::integer as review_count,round(avg(average_rating)::numeric,2) as average_rating,
  round(avg(speed_rating)::numeric,2) as speed_average,round(avg(taste_rating)::numeric,2) as taste_average,
  round(avg(value_rating)::numeric,2) as value_average,
  round(avg(coalesce(price_performance_rating,value_rating))::numeric,2) as price_performance_average
from public.order_reviews where status='published' group by restaurant_id;

grant select on public.menu_item_review_metrics,public.restaurant_product_review_metrics,
  public.restaurant_order_review_metrics to anon,authenticated;
grant select on public.menu_item_review_metrics,public.restaurant_product_review_metrics,
  public.restaurant_order_review_metrics to hungrie_api_owner;

create or replace function public.get_menu_item_review_summary(p_menu_item_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select to_jsonb(m) from public.menu_item_review_metrics m where m.menu_item_id=p_menu_item_id),
    jsonb_build_object('menu_item_id',p_menu_item_id,'rating_count',0,'rating_average',0,'distribution',jsonb_build_object('1',0,'2',0,'3',0,'4',0,'5',0)))
$$;
create or replace function public.get_restaurant_product_review_summary(p_restaurant_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select to_jsonb(m) from public.restaurant_product_review_metrics m where m.restaurant_id=p_restaurant_id),
    jsonb_build_object('restaurant_id',p_restaurant_id,'rating_count',0,'rating_average',0,'distribution',jsonb_build_object('1',0,'2',0,'3',0,'4',0,'5',0)))
$$;
create or replace function public.get_restaurant_order_review_summary(p_restaurant_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select to_jsonb(m) from public.restaurant_order_review_metrics m where m.restaurant_id=p_restaurant_id),
    jsonb_build_object('restaurant_id',p_restaurant_id,'review_count',0,'average_rating',0,'speed_average',0,'taste_average',0,'value_average',0,'price_performance_average',0))
$$;

revoke all on function public.get_menu_item_review_summary(text),public.get_restaurant_product_review_summary(text),
  public.get_restaurant_order_review_summary(text) from public;
grant execute on function public.get_menu_item_review_summary(text),public.get_restaurant_product_review_summary(text),
  public.get_restaurant_order_review_summary(text) to anon,authenticated;

create or replace function migration.promote_review_import(p_run_id uuid)
returns jsonb language plpgsql volatile set search_path='' as $$
declare v_rejections bigint; v_validation jsonb; v_product bigint; v_order bigint; v_quarantined bigint; v_result jsonb;
begin
  perform 1 from migration.import_runs where id=p_run_id for update;
  if not found then raise exception 'Unknown review import run'; end if;
  select count(*) into v_rejections from migration.import_rejections where run_id=p_run_id;
  if v_rejections>0 then raise exception 'Review promotion blocked by % malformed record(s)',v_rejections; end if;
  v_validation:=migration.revalidate_review_import(p_run_id);
  update migration.import_runs set status='running',started_at=coalesce(started_at,statement_timestamp()),completed_at=null where id=p_run_id;

  insert into public.product_reviews(id,review_key,order_id,restaurant_id,menu_item_id,profile_id,user_name_snapshot,menu_item_name_snapshot,rating,comment,status,reply,replied_at,created_at,updated_at)
  select s.id,s.review_key,s.order_id,s.restaurant_id,s.menu_item_id,s.profile_id,s.user_name_snapshot,s.menu_item_name_snapshot,s.rating,s.comment,s.status,s.reply,s.replied_at,s.created_at,s.updated_at
  from migration.product_reviews_stage s where s.run_id=p_run_id and not exists(
    select 1 from migration.review_quarantine q where q.run_id=p_run_id and q.collection_path='reviews' and q.document_id=s.id)
  on conflict(id) do update set review_key=excluded.review_key,rating=excluded.rating,comment=excluded.comment,status=excluded.status,
    reply=excluded.reply,replied_at=excluded.replied_at,updated_at=excluded.updated_at;
  get diagnostics v_product=row_count;

  insert into public.order_reviews(id,review_key,order_id,restaurant_id,profile_id,user_name_snapshot,restaurant_name_snapshot,speed_rating,taste_rating,value_rating,price_performance_rating,comment,items_snapshot,status,created_at,updated_at)
  select s.id,s.review_key,s.order_id,s.restaurant_id,s.profile_id,s.user_name_snapshot,s.restaurant_name_snapshot,s.speed_rating,s.taste_rating,s.value_rating,s.price_performance_rating,s.comment,s.items_snapshot,s.status,s.created_at,s.updated_at
  from migration.order_reviews_stage s where s.run_id=p_run_id and not exists(
    select 1 from migration.review_quarantine q where q.run_id=p_run_id and q.collection_path='orderReviews' and q.document_id=s.id)
  on conflict(id) do update set review_key=excluded.review_key,speed_rating=excluded.speed_rating,taste_rating=excluded.taste_rating,
    value_rating=excluded.value_rating,price_performance_rating=excluded.price_performance_rating,comment=excluded.comment,
    items_snapshot=excluded.items_snapshot,status=excluded.status,updated_at=excluded.updated_at;
  get diagnostics v_order=row_count;

  select count(distinct (collection_path,document_id)) into v_quarantined from migration.review_quarantine where run_id=p_run_id;
  v_result=jsonb_build_object('product_promoted',v_product,'order_promoted',v_order,'quarantined',v_quarantined,'validation',v_validation);
  update migration.import_runs set status='completed',completed_at=statement_timestamp(),counts=counts||v_result where id=p_run_id;
  return v_result;
end $$;

revoke all on function migration.revalidate_review_import(uuid),migration.promote_review_import(uuid)
  from public,anon,authenticated;

grant select,update on public.restaurants,public.menu_items to hungrie_api_owner;
grant create on schema public, private to hungrie_api_owner;
alter function private.refresh_product_review_metrics(text,text) owner to hungrie_api_owner;
alter function private.product_review_metrics_trigger() owner to hungrie_api_owner;
alter function public.get_menu_item_review_summary(text) owner to hungrie_api_owner;
alter function public.get_restaurant_product_review_summary(text) owner to hungrie_api_owner;
alter function public.get_restaurant_order_review_summary(text) owner to hungrie_api_owner;
revoke create on schema public, private from hungrie_api_owner;

-- Bring only entities that already have real reviews under database-owned metrics.
do $refresh_existing$
declare row_record record;
begin
  for row_record in select distinct restaurant_id,menu_item_id from public.product_reviews loop
    perform private.refresh_product_review_metrics(row_record.restaurant_id,row_record.menu_item_id);
  end loop;
end $refresh_existing$;
