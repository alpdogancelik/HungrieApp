-- Bind self-service account deletion to canonical Customer accounts. The
-- caller UID is supplied only by the trusted Firebase callable; this function
-- fails closed instead of removing privileged Restaurant/Admin authority.

create or replace function public.begin_account_anonymization(p_firebase_uid text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_profile_id text;
  v_deletion_pending_at timestamptz;
  v_blocking_restaurant text;
  v_account_type public.account_type;
  v_account_status private.account_status;
  v_status_reason_code text;
begin
  if p_firebase_uid is null or btrim(p_firebase_uid)='' then
    raise exception 'Firebase identity required' using errcode='22023';
  end if;

  select id,deletion_pending_at into v_profile_id,v_deletion_pending_at from public.profiles
    where firebase_uid=p_firebase_uid for update;

  if v_profile_id is null then
    insert into private.firebase_subject_tombstones(firebase_uid)
    values(p_firebase_uid) on conflict(firebase_uid) do nothing;
    return jsonb_build_object('state','not_found');
  end if;

  if exists(select 1 from public.profiles where id=v_profile_id and deleted_at is not null) then
    return jsonb_build_object('state','completed','profile_id',v_profile_id);
  end if;

  select account_type,status,status_reason_code
    into v_account_type,v_account_status,v_status_reason_code
  from private.account_access where profile_id=v_profile_id for update;

  -- A retry after a valid transactional anonymization remains allowed. A
  -- legacy privileged profile carrying deletion_pending_at still fails closed.
  if v_deletion_pending_at is not null then
    if v_account_type = 'customer'::public.account_type
      and v_account_status = 'revoked'::private.account_status
      and v_status_reason_code = 'firebase_identity_deleted'
      and not exists(select 1 from private.user_roles where profile_id=v_profile_id)
      and not exists(select 1 from private.restaurant_members where profile_id=v_profile_id)
      and not exists(select 1 from private.restaurant_couriers where profile_id=v_profile_id) then
      return jsonb_build_object('state','pending','profile_id',v_profile_id);
    end if;
    raise exception 'CUSTOMER_ACCOUNT_REQUIRED' using errcode='42501';
  end if;

  select rm.restaurant_id into v_blocking_restaurant
  from private.restaurant_members rm
  where rm.profile_id=v_profile_id and rm.role='owner'
    and not exists(select 1 from private.restaurant_members other
      where other.restaurant_id=rm.restaurant_id and other.profile_id<>v_profile_id and other.role='owner')
  limit 1;
  if v_blocking_restaurant is not null then
    raise exception 'LAST_RESTAURANT_OWNER' using errcode='23514';
  end if;

  if v_account_type is distinct from 'customer'::public.account_type
    or v_account_status is distinct from 'active'::private.account_status
    or exists(select 1 from private.user_roles where profile_id=v_profile_id)
    or exists(select 1 from private.restaurant_members where profile_id=v_profile_id)
    or exists(select 1 from private.restaurant_couriers where profile_id=v_profile_id) then
    raise exception 'CUSTOMER_ACCOUNT_REQUIRED' using errcode='42501';
  end if;

  insert into private.firebase_subject_tombstones(firebase_uid)
  values(p_firebase_uid) on conflict(firebase_uid) do nothing;
  delete from private.push_tokens where profile_id=v_profile_id;
  delete from public.favorites where profile_id=v_profile_id;
  delete from public.addresses where profile_id=v_profile_id;
  delete from private.account_email_reservations where profile_id=v_profile_id;
  update private.account_access set
    status='revoked', onboarding_step='none',
    status_reason_code='firebase_identity_deleted',
    revoked_at=coalesce(revoked_at,statement_timestamp())
    where profile_id=v_profile_id and status<>'revoked';
  update private.order_contacts set customer_name='Deleted user', customer_email=null,
    customer_whatsapp=null, delivery_address_snapshot='{}'::jsonb
    where order_id in (select id from public.orders where profile_id=v_profile_id);
  update public.profiles set name='Deleted user',
    email='deleted+'||md5(id)||'@example.invalid', avatar_url=null, whatsapp_number=null,
    deletion_pending_at=coalesce(deletion_pending_at,statement_timestamp())
    where id=v_profile_id;
  return jsonb_build_object('state','pending','profile_id',v_profile_id);
end $$;

alter function public.begin_account_anonymization(text) owner to hungrie_api_owner;
revoke all on function public.begin_account_anonymization(text) from public,anon,authenticated;
grant execute on function public.begin_account_anonymization(text) to service_role;
