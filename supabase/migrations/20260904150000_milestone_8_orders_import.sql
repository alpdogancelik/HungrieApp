-- Milestone 8: protected Firebase order import and item-bearing order access.
-- Runtime order reads/writes remain Firebase-backed until later milestones.

alter table public.order_items add column source_menu_item_id text;
update public.order_items set source_menu_item_id = menu_item_id where source_menu_item_id is null;
create index order_items_source_menu_item_idx on public.order_items(source_menu_item_id) where source_menu_item_id is not null;

create table migration.orders_stage (
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  id text not null check (btrim(id) <> ''),
  source_user_id text not null check (btrim(source_user_id) <> ''),
  profile_id text,
  restaurant_id text not null check (btrim(restaurant_id) <> ''),
  source_status text not null check (btrim(source_status) <> ''),
  status public.order_status not null,
  payment_method public.payment_method not null,
  notes text not null default '' check (length(notes) <= 500),
  subtotal_kurus bigint not null check (subtotal_kurus >= 0),
  delivery_fee_kurus bigint not null check (delivery_fee_kurus >= 0),
  service_fee_kurus bigint not null check (service_fee_kurus >= 0),
  discount_kurus bigint not null check (discount_kurus >= 0),
  tip_kurus bigint not null check (tip_kurus >= 0),
  total_kurus bigint not null check (total_kurus >= 0),
  eta_minutes integer check (eta_minutes is null or eta_minutes >= 0),
  approval_deadline_at timestamptz,
  reminder_pending boolean not null default false,
  reminder_requested_at timestamptz,
  source_reminder_requested_by text,
  reminder_requested_by text,
  reminder_source text,
  preparing_at timestamptz,
  ready_at timestamptz,
  out_for_delivery_at timestamptz,
  delivered_at timestamptz,
  canceled_at timestamptz,
  history_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  source_courier_label text,
  document_checksum text not null check (document_checksum ~ '^[0-9a-f]{64}$'),
  primary key (run_id, id),
  constraint orders_stage_total_equation check (
    subtotal_kurus + delivery_fee_kurus + service_fee_kurus + tip_kurus - discount_kurus = total_kurus
  )
);

create table migration.order_contacts_stage (
  run_id uuid not null,
  order_id text not null,
  customer_name text not null check (btrim(customer_name) <> ''),
  customer_email text,
  customer_whatsapp text,
  delivery_address_snapshot jsonb not null check (jsonb_typeof(delivery_address_snapshot) = 'object'),
  primary key (run_id, order_id),
  foreign key (run_id, order_id) references migration.orders_stage(run_id, id) on delete restrict
);

create table migration.order_items_stage (
  run_id uuid not null,
  id text not null check (btrim(id) <> ''),
  order_id text not null,
  source_ordinal integer not null check (source_ordinal >= 0),
  source_menu_item_id text,
  menu_item_id text,
  name_snapshot text not null check (btrim(name_snapshot) <> ''),
  image_url_snapshot text,
  unit_price_kurus bigint not null check (unit_price_kurus >= 0),
  customization_total_kurus bigint not null check (customization_total_kurus >= 0),
  quantity integer not null check (quantity > 0),
  customizations_snapshot jsonb not null check (jsonb_typeof(customizations_snapshot) = 'array'),
  created_at timestamptz not null,
  primary key (run_id, id),
  unique (run_id, order_id, source_ordinal),
  foreign key (run_id, order_id) references migration.orders_stage(run_id, id) on delete restrict
);

create table migration.order_quarantine (
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  document_id text not null check (btrim(document_id) <> ''),
  reason_code text not null check (reason_code in ('PROFILE_NOT_IMPORTED', 'RESTAURANT_NOT_IMPORTED')),
  reason_details jsonb not null default '{}'::jsonb check (jsonb_typeof(reason_details) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  primary key (run_id, document_id, reason_code)
);

create table private.order_import_metadata (
  order_id text primary key references public.orders(id) on delete restrict,
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  source_document_checksum text not null check (source_document_checksum ~ '^[0-9a-f]{64}$'),
  source_status text not null check (btrim(source_status) <> ''),
  source_courier_label text,
  imported_at timestamptz not null default statement_timestamp()
);

create index orders_stage_run_relationship_idx on migration.orders_stage(run_id, source_user_id, restaurant_id);
create index order_items_stage_run_order_idx on migration.order_items_stage(run_id, order_id, source_ordinal);
create index order_quarantine_run_reason_idx on migration.order_quarantine(run_id, reason_code);

revoke all on migration.orders_stage, migration.order_contacts_stage,
  migration.order_items_stage, migration.order_quarantine,
  private.order_import_metadata from public, anon, authenticated;

create or replace function migration.revalidate_order_import(p_run_id uuid)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare v_valid bigint; v_quarantined bigint; v_unlinked_items bigint;
begin
  perform 1 from migration.import_runs where id = p_run_id for update;
  if not found then raise exception 'Unknown order import run'; end if;

  delete from migration.order_quarantine where run_id = p_run_id;

  update migration.orders_stage s set profile_id = (
    select p.id from public.profiles p
    where p.deleted_at is null and p.deletion_pending_at is null
      and (p.firebase_uid = s.source_user_id or (p.firebase_uid is null and p.id = s.source_user_id))
    order by (p.firebase_uid = s.source_user_id) desc limit 1
  ) where s.run_id = p_run_id;

  update migration.orders_stage s set reminder_requested_by = (
    select p.id from public.profiles p
    where p.deleted_at is null and p.deletion_pending_at is null
      and (p.firebase_uid = s.source_reminder_requested_by
        or (p.firebase_uid is null and p.id = s.source_reminder_requested_by))
    order by (p.firebase_uid = s.source_reminder_requested_by) desc limit 1
  ) where s.run_id = p_run_id and s.source_reminder_requested_by is not null;

  update migration.order_items_stage i set menu_item_id = (
    select m.id from public.menu_items m
    join migration.orders_stage o on o.run_id = i.run_id and o.id = i.order_id
    where m.id = i.source_menu_item_id and m.restaurant_id = o.restaurant_id
  ) where i.run_id = p_run_id;

  insert into migration.order_quarantine(run_id, document_id, reason_code)
  select p_run_id, s.id, 'PROFILE_NOT_IMPORTED' from migration.orders_stage s
  where s.run_id = p_run_id and s.profile_id is null;
  insert into migration.order_quarantine(run_id, document_id, reason_code)
  select p_run_id, s.id, 'RESTAURANT_NOT_IMPORTED' from migration.orders_stage s
  where s.run_id = p_run_id and not exists(select 1 from public.restaurants r where r.id = s.restaurant_id);

  select count(*) into v_valid from migration.orders_stage s
  where s.run_id = p_run_id and not exists(
    select 1 from migration.order_quarantine q where q.run_id = p_run_id and q.document_id = s.id
  );
  select count(distinct document_id) into v_quarantined from migration.order_quarantine where run_id = p_run_id;
  select count(*) into v_unlinked_items from migration.order_items_stage where run_id = p_run_id and source_menu_item_id is not null and menu_item_id is null;
  return jsonb_build_object('valid_orders', v_valid, 'quarantined_orders', v_quarantined, 'unlinked_items', v_unlinked_items);
end
$$;

create or replace function migration.promote_order_import(p_run_id uuid)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_rejections bigint; v_active bigint; v_validation jsonb;
  v_promoted bigint; v_quarantined bigint; v_items bigint; v_result jsonb;
begin
  perform 1 from migration.import_runs where id = p_run_id for update;
  if not found then raise exception 'Unknown order import run'; end if;
  select count(*) into v_rejections from migration.import_rejections where run_id = p_run_id;
  if v_rejections > 0 then raise exception 'Order promotion blocked by % malformed record(s)', v_rejections; end if;
  select count(*) into v_active from migration.orders_stage where run_id = p_run_id and status not in ('delivered', 'canceled');
  if v_active > 0 then raise exception 'Order promotion blocked by % active record(s)', v_active; end if;

  v_validation := migration.revalidate_order_import(p_run_id);

  if exists (
    select 1 from migration.orders_stage s
    join private.order_import_metadata m on m.order_id = s.id
    where s.run_id = p_run_id and m.source_document_checksum <> s.document_checksum
  ) then raise exception 'Previously imported terminal order changed at source'; end if;
  if exists (
    select 1 from migration.orders_stage s join public.orders o on o.id = s.id
    left join private.order_import_metadata m on m.order_id = o.id
    where s.run_id = p_run_id and m.order_id is null
  ) then raise exception 'Order ID conflicts with a non-imported record'; end if;

  update migration.import_runs set status = 'running', started_at = coalesce(started_at, statement_timestamp()), completed_at = null where id = p_run_id;

  insert into public.orders(
    id, profile_id, restaurant_id, courier_profile_id, status, payment_method, notes,
    subtotal_kurus, delivery_fee_kurus, service_fee_kurus, discount_kurus, tip_kurus,
    total_kurus, eta_minutes, approval_deadline_at, reminder_pending,
    reminder_requested_at, reminder_requested_by, reminder_source,
    preparing_at, ready_at, out_for_delivery_at, delivered_at, canceled_at,
    created_at, updated_at
  )
  select s.id, s.profile_id, s.restaurant_id, null, s.status, s.payment_method, s.notes,
    s.subtotal_kurus, s.delivery_fee_kurus, s.service_fee_kurus, s.discount_kurus, s.tip_kurus,
    s.total_kurus, s.eta_minutes, s.approval_deadline_at, s.reminder_pending,
    s.reminder_requested_at, s.reminder_requested_by, s.reminder_source,
    s.preparing_at, s.ready_at, s.out_for_delivery_at, s.delivered_at, s.canceled_at,
    s.created_at, s.updated_at
  from migration.orders_stage s
  where s.run_id = p_run_id
    and not exists(select 1 from migration.order_quarantine q where q.run_id = p_run_id and q.document_id = s.id)
    and not exists(select 1 from public.orders o where o.id = s.id);
  get diagnostics v_promoted = row_count;

  insert into private.order_contacts(order_id, customer_name, customer_email, customer_whatsapp, delivery_address_snapshot, created_at, updated_at)
  select c.order_id, c.customer_name, c.customer_email, c.customer_whatsapp, c.delivery_address_snapshot, s.created_at, s.updated_at
  from migration.order_contacts_stage c join migration.orders_stage s on s.run_id = c.run_id and s.id = c.order_id
  where c.run_id = p_run_id
    and not exists(select 1 from migration.order_quarantine q where q.run_id = p_run_id and q.document_id = c.order_id)
    and not exists(select 1 from private.order_contacts x where x.order_id = c.order_id);

  insert into public.order_items(id, order_id, menu_item_id, source_menu_item_id, name_snapshot, image_url_snapshot,
    unit_price_kurus, customization_total_kurus, quantity, customizations_snapshot, created_at)
  select i.id, i.order_id, i.menu_item_id, i.source_menu_item_id, i.name_snapshot, i.image_url_snapshot,
    i.unit_price_kurus, i.customization_total_kurus, i.quantity, i.customizations_snapshot, i.created_at
  from migration.order_items_stage i
  where i.run_id = p_run_id
    and not exists(select 1 from migration.order_quarantine q where q.run_id = p_run_id and q.document_id = i.order_id)
    and not exists(select 1 from public.order_items x where x.id = i.id);
  get diagnostics v_items = row_count;

  insert into private.order_status_history(order_id, previous_status, new_status, changed_by_profile_id, source, reason, created_at)
  select s.id, null, s.status, null, 'firebase_import', 'Observed terminal status at import', s.history_at
  from migration.orders_stage s
  where s.run_id = p_run_id
    and not exists(select 1 from migration.order_quarantine q where q.run_id = p_run_id and q.document_id = s.id)
    and not exists(select 1 from private.order_status_history h where h.order_id = s.id and h.source = 'firebase_import');

  insert into private.audit_log(actor_profile_id, action, target_type, target_id, metadata, created_at)
  select null, 'order.imported', 'order', s.id,
    jsonb_build_object('run_id', p_run_id, 'restaurant_id', s.restaurant_id), s.updated_at
  from migration.orders_stage s
  where s.run_id = p_run_id
    and not exists(select 1 from migration.order_quarantine q where q.run_id = p_run_id and q.document_id = s.id)
    and not exists(select 1 from private.audit_log a where a.action = 'order.imported' and a.target_type = 'order' and a.target_id = s.id);

  insert into private.order_import_metadata(order_id, run_id, source_document_checksum, source_status, source_courier_label)
  select s.id, p_run_id, s.document_checksum, s.source_status, s.source_courier_label
  from migration.orders_stage s
  where s.run_id = p_run_id
    and not exists(select 1 from migration.order_quarantine q where q.run_id = p_run_id and q.document_id = s.id)
  on conflict(order_id) do nothing;

  select count(distinct document_id) into v_quarantined from migration.order_quarantine where run_id = p_run_id;
  v_result := jsonb_build_object('orders_promoted', v_promoted, 'items_promoted', v_items,
    'quarantined_orders', v_quarantined, 'validation', v_validation);
  update migration.import_runs set status = 'completed', completed_at = statement_timestamp(), counts = counts || jsonb_build_object('orders', v_result) where id = p_run_id;
  return v_result;
end
$$;

create or replace function public.get_order_items(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor text := private.require_profile();
begin
  if not private.can_access_order(p_order_id) then
    raise exception 'Order access required' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', i.id,
    'menu_item_id', coalesce(i.menu_item_id, i.source_menu_item_id),
    'name', i.name_snapshot,
    'image_url', i.image_url_snapshot,
    'unit_price_kurus', i.unit_price_kurus,
    'customization_total_kurus', i.customization_total_kurus,
    'quantity', i.quantity,
    'customizations', i.customizations_snapshot
  ) order by i.created_at, i.id) from public.order_items i where i.order_id = p_order_id), '[]'::jsonb);
end
$$;

revoke all on function migration.revalidate_order_import(uuid), migration.promote_order_import(uuid) from public, anon, authenticated;
revoke all on function public.get_order_items(text) from public, anon;
grant execute on function public.get_order_items(text) to authenticated;

grant create on schema public to hungrie_api_owner;
alter function public.get_order_items(text) owner to hungrie_api_owner;
revoke create on schema public from hungrie_api_owner;

revoke all on all tables in schema migration from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
