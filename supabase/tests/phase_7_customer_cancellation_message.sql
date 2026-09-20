begin;
select no_plan();

insert into private.account_access(profile_id,account_type,status,activated_at,restaurant_id,restaurant_role)
values('fixture_owner','restaurant','active',statement_timestamp(),'fixture_restaurant_a','owner');
insert into private.account_access(profile_id,account_type,status,activated_at)
values('fixture_customer','customer','active',statement_timestamp());
insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,approval_deadline_at)
values
 ('phase7_message_order','fixture_customer','fixture_restaurant_a','pending','cash',1000,1000,statement_timestamp()+interval '5 minutes'),
 ('phase7_blank_message_order','fixture_customer','fixture_restaurant_a','pending','cash',1000,1000,statement_timestamp()+interval '5 minutes');
insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,approval_deadline_at,canceled_at)
values('phase7_legacy_internal_order','fixture_customer','fixture_restaurant_a','canceled','cash',1000,1000,
  statement_timestamp()-interval '1 minute',statement_timestamp());
insert into private.order_status_history(order_id,previous_status,new_status,changed_by_profile_id,source,reason)
values('phase7_legacy_internal_order','pending','canceled','fixture_owner','restaurant','other:private staffing detail');
insert into public.orders(id,profile_id,restaurant_id,status,payment_method,subtotal_kurus,total_kurus,approval_deadline_at)
values('phase7_foreign_order','fixture_customer','fixture_restaurant_b','pending','cash',1000,1000,statement_timestamp()+interval '5 minutes');
create temporary table phase7_message_expected as
  select updated_at from public.orders where id='phase7_message_order';

select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_owner"}',true);
select is((public.restaurant_cancel_order_v2('phase7_message_order',
  (select updated_at from phase7_message_expected),
  'delivery_unavailable','  No driver is available tonight.  ',
  '77777777-0000-4000-8000-000000000001')->>'status'),'canceled',
  'Restaurant can cancel with a customer-visible message');
select is((select message from private.restaurant_customer_cancellation_messages where order_id='phase7_message_order'),
  'No driver is available tonight.','customer message is trimmed and stored separately');
select is((public.restaurant_cancel_order_v2('phase7_message_order',
  (select updated_at from phase7_message_expected),
  'delivery_unavailable','No driver is available tonight.',
  '77777777-0000-4000-8000-000000000001')->>'status'),'canceled',
  'exact cancellation replay returns its original result');
select throws_ok($$select public.restaurant_cancel_order_v2('phase7_message_order',
  (select updated_at from phase7_message_expected), 'delivery_unavailable',
  'Changed message','77777777-0000-4000-8000-000000000001')$$,'22023',null,
  'an operation ID cannot be replayed with changed public text');
select throws_ok($$select public.restaurant_cancel_order_v2('phase7_foreign_order',
  (select updated_at from public.orders where id='phase7_foreign_order'),
  'other','Foreign Restaurant message','77777777-0000-4000-8000-000000000004')$$,'42501',null,
  'Restaurant cannot cancel another Restaurant order');

select is((public.restaurant_cancel_order_v2('phase7_blank_message_order',
  (select updated_at from public.orders where id='phase7_blank_message_order'),
  'too_busy','   ',
  '77777777-0000-4000-8000-000000000002')->>'status'),'canceled',
  'Restaurant can cancel without a customer-visible message');

select set_config('request.jwt.claims',
  '{"role":"authenticated","iss":"https://securetoken.google.com/hungrieapp-a2288","aud":"hungrieapp-a2288","sub":"fixture_firebase_customer"}',true);
select is((public.get_my_customer_order_v2('phase7_message_order')->>'restaurant_cancellation_note'),
  'No driver is available tonight.','Customer sees only the explicitly public message');
select is((public.get_my_customer_order_v2('phase7_message_order')->>'cancellation_reason_code'),
  'delivery_unavailable','the public message does not replace the cancellation reason');
select ok(not public.get_my_customer_order_v2('phase7_blank_message_order') ? 'restaurant_cancellation_note',
  'Customer payload omits an empty message');
select ok(position('private staffing detail' in public.get_my_customer_order_v2('phase7_legacy_internal_order')::text)=0,
  'new Customer read still conceals historical internal Restaurant notes');
select ok(not has_table_privilege('authenticated','private.restaurant_customer_cancellation_messages','select'),
  'Customer cannot read the private message table directly');
select ok(not has_function_privilege('anon','public.get_my_customer_order_v2(text)','execute'),
  'anonymous callers cannot read a Customer order message');
select throws_ok($$select public.restaurant_cancel_order_v2('phase7_message_order',statement_timestamp(),
  'other','Forged','77777777-0000-4000-8000-000000000003')$$,'42501',null,
  'Customer cannot invoke Restaurant cancellation');

select * from finish();
rollback;
