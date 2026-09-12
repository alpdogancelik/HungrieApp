begin;
select plan(13);

select has_table('private', 'client_release_policy', 'private release policy exists');
select has_function('public', 'get_client_release_policy_v1', array['text','text','integer','integer'], 'sanitized release RPC exists');
select ok(not has_table_privilege('anon', 'private.client_release_policy', 'select'), 'anonymous callers cannot read policy table');
select ok(not has_table_privilege('authenticated', 'private.client_release_policy', 'update'), 'authenticated callers cannot change policy');
select ok(has_function_privilege('anon', 'public.get_client_release_policy_v1(text,text,integer,integer)', 'execute'), 'anonymous bootstrap may call RPC');
select is((public.get_client_release_policy_v1('customer','ios',1,0)->>'policy_configured')::boolean, false, 'missing policy is explicit');

insert into private.client_release_policy(application, platform, minimum_build_number, minimum_api_contract, update_required, store_url, user_message_key)
values ('customer','ios',2,1,true,'https://example.invalid/update','customer.update.required');

select is((public.get_client_release_policy_v1('customer','ios',1,1)->>'update_required')::boolean, true, 'obsolete build is marked for update');
select is((public.get_client_release_policy_v1('customer','ios',2,1)->>'update_required')::boolean, false, 'minimum build is allowed');
select is((public.get_client_release_policy_v1('customer','ios',2,0)->>'update_required')::boolean, true, 'obsolete API contract is marked for update');
select is(public.get_client_release_policy_v1('customer','ios',2,1)->>'store_url', null, 'store URL is withheld when update is not required');

update private.client_release_policy set update_required=false where application='customer' and platform='ios';
select is((public.get_client_release_policy_v1('customer','ios',1,0)->>'update_required')::boolean, false, 'disabled policy does not block simulated build');
select throws_ok($$select public.get_client_release_policy_v1('customer','ios',0,0)$$, '22023', 'Invalid client release check', 'invalid build is rejected');
select throws_ok($$select public.get_client_release_policy_v1('admin','ios',1,0)$$, '22023', 'Invalid client release check', 'unknown app is rejected');

select * from finish();
rollback;
