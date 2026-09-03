create or replace function private.enforce_delivered_review_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.orders
    where id = new.order_id
      and status = 'delivered'
  ) then
    raise exception 'reviews require a delivered order'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_delivered_review_order() from public, anon, authenticated;

create trigger product_reviews_require_delivered_order
  before insert or update of order_id on public.product_reviews
  for each row execute function private.enforce_delivered_review_order();

create trigger order_reviews_require_delivered_order
  before insert or update of order_id on public.order_reviews
  for each row execute function private.enforce_delivered_review_order();

create index orders_reminder_requested_by_idx
  on public.orders(reminder_requested_by)
  where reminder_requested_by is not null;

create index order_status_history_changed_by_idx
  on private.order_status_history(changed_by_profile_id)
  where changed_by_profile_id is not null;
