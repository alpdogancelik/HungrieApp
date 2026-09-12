-- App-owner-approved Milestone 8 exception: two test-only delivered orders with
-- absent delivery-address snapshots remain protected and quarantined.

alter table migration.order_quarantine
  drop constraint order_quarantine_reason_code_check;
alter table migration.order_quarantine
  add constraint order_quarantine_reason_code_check check (
    reason_code in ('PROFILE_NOT_IMPORTED', 'RESTAURANT_NOT_IMPORTED', 'DELIVERY_ADDRESS_SNAPSHOT_MISSING')
  );
alter table migration.order_quarantine
  add column approved_exception boolean not null default false;

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

  delete from migration.order_quarantine
  where run_id = p_run_id and not approved_exception;

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

revoke all on function migration.revalidate_order_import(uuid) from public, anon, authenticated;
