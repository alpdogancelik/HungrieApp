drop policy if exists order_private_broadcast_receive on realtime.messages;

create policy order_private_broadcast_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and private.can_subscribe_order_topic((select realtime.topic()))
);
