-- A Firebase ID token can remain cryptographically valid briefly after its
-- identity is deleted. Remember deleted subjects so those cached tokens cannot
-- recreate a Customer account during that interval.

create table private.firebase_subject_tombstones (
  firebase_uid text primary key check (btrim(firebase_uid) <> ''),
  reason_code text not null default 'account_deleted',
  created_at timestamptz not null default statement_timestamp()
);

alter table private.firebase_subject_tombstones enable row level security;
revoke all on private.firebase_subject_tombstones from public,anon,authenticated,service_role;
grant select,insert on private.firebase_subject_tombstones to hungrie_api_owner;
create policy firebase_subject_tombstones_api_owner
  on private.firebase_subject_tombstones
  for all to hungrie_api_owner using (true) with check (true);

create or replace function public.bootstrap_my_customer_account_v1(p_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_uid text:=private.firebase_subject(); v_claims jsonb:=private.request_jwt();
  v_email text; v_profile text; v_result jsonb;
begin
  if v_uid is null then raise exception 'Firebase identity required' using errcode='42501'; end if;
  if exists(select 1 from private.firebase_subject_tombstones t where t.firebase_uid=v_uid) then
    raise exception 'Firebase identity was deleted' using errcode='42501';
  end if;
  v_email:=lower(btrim(coalesce(v_claims->>'email','')));
  if v_email='' then raise exception 'Firebase email claim required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hungrie:email:'||v_email,0));
  v_result:=private.phase2_operation_begin(p_operation_id,'customer_bootstrap',
    encode(extensions.digest(v_uid||':'||v_email,'sha256'),'hex'));
  if v_result is not null then return v_result; end if;
  if exists(select 1 from private.account_invitations i where i.normalized_email=v_email
    and i.state='pending' and i.expires_at>statement_timestamp())
    or exists(select 1 from private.account_email_reservations e
      where e.normalized_email=v_email and e.account_type<>'customer') then
    raise exception 'Email is reserved for privileged onboarding' using errcode='42501';
  end if;
  select p.id into v_profile from public.profiles p where p.firebase_uid=v_uid
    and p.deletion_pending_at is null and p.deleted_at is null;
  if exists(select 1 from public.profiles p where lower(btrim(p.email))=v_email
    and p.deletion_pending_at is null and p.deleted_at is null
    and p.id is distinct from v_profile) then
    raise exception 'Email already maps to another profile' using errcode='42501';
  end if;
  if v_profile is not null then
    if exists(select 1 from private.user_roles ur where ur.profile_id=v_profile
      and ur.role in ('admin','super_admin','courier'))
      or exists(select 1 from private.restaurant_members rm where rm.profile_id=v_profile)
      or exists(select 1 from private.account_access a where a.profile_id=v_profile
        and a.account_type<>'customer') then
      raise exception 'Identity already has privileged scope' using errcode='42501';
    end if;
  else
    if exists(select 1 from public.profiles p where lower(btrim(p.email))=v_email
      and p.deletion_pending_at is null and p.deleted_at is null) then
      raise exception 'Email already maps to another profile' using errcode='42501';
    end if;
    v_profile:=v_uid;
    insert into public.profiles(id,firebase_uid,name,email)
    values(v_profile,v_uid,left(coalesce(nullif(btrim(v_claims->>'name'),''),v_email),120),v_email);
  end if;
  insert into private.account_email_reservations
    (normalized_email,account_type,firebase_uid,profile_id)
  values(v_email,'customer',v_uid,v_profile)
  on conflict(normalized_email) do update set updated_at=statement_timestamp()
  where account_email_reservations.account_type='customer'
    and account_email_reservations.profile_id=v_profile
    and account_email_reservations.firebase_uid=v_uid;
  if not found then raise exception 'Email classification conflict' using errcode='42501'; end if;
  insert into private.account_access(profile_id,account_type,status,activated_at)
  values(v_profile,'customer','active',statement_timestamp()) on conflict do nothing;
  if not exists(select 1 from private.account_access a where a.profile_id=v_profile
    and a.account_type='customer' and a.status='active') then
    raise exception 'Account classification conflict' using errcode='42501';
  end if;
  perform private.write_audit(v_profile,'account.customer_bootstrapped','profile',v_profile,
    jsonb_build_object('operation_id',p_operation_id));
  return private.phase2_operation_complete(p_operation_id,
    jsonb_build_object('profileId',v_profile,'accountType','customer'),v_profile);
end $$;

create or replace function public.begin_account_anonymization(p_firebase_uid text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_profile_id text; v_blocking_restaurant text;
begin
  if p_firebase_uid is null or btrim(p_firebase_uid)='' then
    raise exception 'Firebase identity required' using errcode='22023';
  end if;
  select id into v_profile_id from public.profiles
    where firebase_uid=p_firebase_uid for update;
  if v_profile_id is not null then
    select rm.restaurant_id into v_blocking_restaurant
    from private.restaurant_members rm
    where rm.profile_id=v_profile_id and rm.role='owner'
      and not exists(select 1 from private.restaurant_members other
        where other.restaurant_id=rm.restaurant_id and other.profile_id<>v_profile_id and other.role='owner')
    limit 1;
    if v_blocking_restaurant is not null then
      raise exception 'LAST_RESTAURANT_OWNER' using errcode='23514';
    end if;
  end if;
  insert into private.firebase_subject_tombstones(firebase_uid)
  values(p_firebase_uid) on conflict(firebase_uid) do nothing;
  if v_profile_id is null then return jsonb_build_object('state','not_found'); end if;
  if exists(select 1 from public.profiles where id=v_profile_id and deleted_at is not null) then
    return jsonb_build_object('state','completed','profile_id',v_profile_id);
  end if;
  delete from private.push_tokens where profile_id=v_profile_id;
  delete from private.restaurant_couriers where profile_id=v_profile_id;
  delete from private.user_roles where profile_id=v_profile_id;
  delete from private.restaurant_members where profile_id=v_profile_id;
  delete from public.favorites where profile_id=v_profile_id;
  delete from public.addresses where profile_id=v_profile_id;
  update private.order_contacts set customer_name='Deleted user', customer_email=null,
    customer_whatsapp=null, delivery_address_snapshot='{}'::jsonb
    where order_id in (select id from public.orders where profile_id=v_profile_id);
  update public.profiles set name='Deleted user',
    email='deleted+'||md5(id)||'@example.invalid', avatar_url=null, whatsapp_number=null,
    deletion_pending_at=coalesce(deletion_pending_at,statement_timestamp())
    where id=v_profile_id;
  return jsonb_build_object('state','pending','profile_id',v_profile_id);
end $$;

alter function public.bootstrap_my_customer_account_v1(uuid) owner to hungrie_api_owner;
alter function public.begin_account_anonymization(text) owner to hungrie_api_owner;

revoke all on function public.bootstrap_my_customer_account_v1(uuid) from public,anon,service_role;
grant execute on function public.bootstrap_my_customer_account_v1(uuid) to authenticated;
revoke all on function public.begin_account_anonymization(text) from public,anon,authenticated;
grant execute on function public.begin_account_anonymization(text) to service_role;
