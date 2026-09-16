-- Phase 5/6 RPCs use versioned audit action names. Keep notification event
-- production compatible with both the legacy and current order contracts.

create or replace function private.notification_event_from_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_status public.order_status;
begin
  if new.action in (
    'order.created','order.created_v2','order.reminder_requested',
    'order.transitioned','restaurant.order_transitioned','delivery.claimed',
    'order.support_resolved'
  ) then
    select status into v_status from public.orders where id=new.target_id;
    if new.action in ('order.created','order.created_v2') then
      perform private.enqueue_notification_event(
        'audit:'||new.id,'restaurant_new_order',new.target_id,null,v_status
      );
    elsif new.action='order.reminder_requested' then
      perform private.enqueue_notification_event(
        'audit:'||new.id,'restaurant_reminder',new.target_id,null,v_status
      );
    else
      perform private.enqueue_notification_event(
        'audit:'||new.id,'order_status',new.target_id,null,v_status
      );
    end if;
  elsif new.action='review.replied' then
    perform private.enqueue_notification_event(
      'audit:'||new.id,'review_reply',null,new.target_id,null
    );
  end if;
  return new;
end $$;
