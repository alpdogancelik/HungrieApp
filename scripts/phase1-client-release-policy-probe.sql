-- One statement, with an exception subtransaction: fixture writes always roll back.
do $phase1_probe$
declare
  v_result jsonb;
begin
  begin
    insert into private.client_release_policy (
      application, platform, minimum_build_number, minimum_api_contract,
      update_required, store_url, user_message_key
    ) values
      ('customer', 'ios', 2, 1, true, 'https://example.invalid/ios', 'probe.update'),
      ('customer', 'android', 2, 1, true, 'https://example.invalid/android', 'probe.update')
    on conflict (application, platform) do update set
      minimum_build_number = excluded.minimum_build_number,
      minimum_api_contract = excluded.minimum_api_contract,
      update_required = excluded.update_required,
      store_url = excluded.store_url,
      user_message_key = excluded.user_message_key;

    for v_result in
      select public.get_client_release_policy_v1('customer', platform, build_number, api_contract)
      from (values
        ('ios', 1, 1), ('ios', 2, 0), ('android', 1, 1), ('android', 2, 0)
      ) as blocked(platform, build_number, api_contract)
    loop
      if v_result->>'update_required' is distinct from 'true' then
        raise exception 'Simulated obsolete Customer build was not marked for update';
      end if;
    end loop;

    for v_result in
      select public.get_client_release_policy_v1('customer', platform, 2, 1)
      from (values ('ios'), ('android')) as allowed(platform)
    loop
      if v_result->>'update_required' is distinct from 'false' then
        raise exception 'Simulated current Customer build was incorrectly marked for update';
      end if;
    end loop;

    raise exception 'phase1_probe_complete' using errcode = 'P1000';
  exception when sqlstate 'P1000' then
    null;
  end;
end
$phase1_probe$;
