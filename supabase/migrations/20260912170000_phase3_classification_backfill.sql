-- Phase 3 import bookkeeping. Legacy authorization remains authoritative.
create table private.account_classification_runs (
  id uuid primary key,
  environment text not null check (environment in ('development', 'staging')),
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  state text not null check (state in ('completed', 'reverted')),
  inserted_count integer not null check (inserted_count >= 0),
  created_at timestamptz not null default statement_timestamp(),
  reverted_at timestamptz
);

create table private.account_classification_entries (
  run_id uuid not null references private.account_classification_runs(id) on delete restrict,
  profile_id text not null references public.profiles(id) on delete restrict,
  inserted_row jsonb not null check (jsonb_typeof(inserted_row) = 'object'),
  primary key (run_id, profile_id),
  unique (profile_id)
);

alter table private.account_classification_runs enable row level security;
alter table private.account_classification_entries enable row level security;
revoke all on private.account_classification_runs,
  private.account_classification_entries from public, anon, authenticated, service_role;
grant select, insert, update on private.account_classification_runs to hungrie_api_owner;
grant select, insert on private.account_classification_entries to hungrie_api_owner;
create policy phase3_runs_owner on private.account_classification_runs
  for all to hungrie_api_owner using (true) with check (true);
create policy phase3_entries_owner on private.account_classification_entries
  for all to hungrie_api_owner using (true) with check (true);

create function private.phase3_import_classification(
  p_run_id uuid, p_environment text, p_input_sha256 text, p_rows jsonb)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_profile public.profiles%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_existing private.account_access%rowtype;
  v_type text;
  v_role text;
  v_restaurant_id text;
  v_inserted integer := 0;
  v_prior private.account_classification_runs%rowtype;
begin
  if session_user <> 'postgres' or p_run_id is null or
     p_environment not in ('development','staging') or
     p_input_sha256 !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Reviewed operator import required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hungrie:phase3-classification',0));
  select * into v_prior from private.account_classification_runs where id=p_run_id for update;
  if found then
    if v_prior.environment<>p_environment or v_prior.input_sha256<>p_input_sha256 or
       v_prior.state<>'completed' or
       v_prior.inserted_count<>(select count(*) from private.account_classification_entries where run_id=p_run_id) then
      raise exception 'Classification run differs or was reverted' using errcode='23505';
    end if;
    return 0;
  end if;
  -- This lock also prevents a legacy source row from changing between checking
  -- a proposal and committing its canonical row.
  lock table public.profiles, public.restaurants, public.orders, public.addresses,
    private.user_roles, private.restaurant_members, private.account_access,
    private.account_invitations, private.account_email_reservations in share mode;
  if (select count(distinct item.value->>'profileId')
        from pg_catalog.jsonb_array_elements(p_rows) item) <>
      pg_catalog.jsonb_array_length(p_rows) then
    raise exception 'Duplicate profile in import proposal' using errcode='23514';
  end if;
  insert into private.account_classification_runs(id,environment,input_sha256,state,inserted_count)
    values(p_run_id,p_environment,p_input_sha256,'completed',0);
  for v_item in select value from pg_catalog.jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_item)<>'object' or
       coalesce(v_item->>'profileId','')='' or
       coalesce(v_item->>'firebaseUid','')='' or
       coalesce(v_item->>'normalizedEmail','')='' then
      raise exception 'Malformed classification proposal' using errcode='22023';
    end if;
    select * into v_profile from public.profiles where id=v_item->>'profileId'
      and firebase_uid=v_item->>'firebaseUid' and deletion_pending_at is null
      and deleted_at is null;
    if not found or lower(btrim(v_profile.email))<>v_item->>'normalizedEmail' or
       (select count(*) from public.profiles p where p.deleted_at is null
          and p.deletion_pending_at is null and lower(btrim(p.email))=v_item->>'normalizedEmail')<>1 or
       exists(select 1 from private.account_invitations i
         where i.normalized_email=v_item->>'normalizedEmail' and i.state='pending') or
       exists(select 1 from private.account_email_reservations e
         where e.normalized_email=v_item->>'normalizedEmail' and
           (e.profile_id is distinct from v_profile.id or
            e.account_type::text is distinct from v_item->>'accountType')) then
      raise exception 'Profile identity changed or email is ambiguous' using errcode='23514';
    end if;
    v_type := v_item->>'accountType';
    v_restaurant_id := v_item->>'restaurantId';
    v_role := v_item->>'role';
    if exists(select 1 from private.user_roles ur where ur.profile_id=v_profile.id
      and ur.role='courier') or
       (select count(*) from private.user_roles ur where ur.profile_id=v_profile.id
        and ur.role in ('admin','super_admin'))>1 or
       (select count(*) from private.restaurant_members rm where rm.profile_id=v_profile.id)>1 then
      raise exception 'Legacy authority is ambiguous' using errcode='23514';
    end if;
    if v_type='customer' then
      if v_restaurant_id is not null or v_role is not null or
         exists(select 1 from private.user_roles ur where ur.profile_id=v_profile.id) or
         exists(select 1 from private.restaurant_members rm where rm.profile_id=v_profile.id) or
         exists(select 1 from private.account_invitations i where i.normalized_email=v_item->>'normalizedEmail' and i.state='pending') or
         exists(select 1 from private.account_email_reservations e where e.normalized_email=v_item->>'normalizedEmail' and e.account_type<>'customer') then
        raise exception 'Customer classification conflicts with legacy staff or invitation' using errcode='23514';
      end if;
    elsif v_type='restaurant' then
      select * into v_restaurant from public.restaurants where id=v_restaurant_id;
      if not found or v_restaurant.lifecycle_status<>'active' or
         v_restaurant.is_active is not true or v_role not in ('owner','manager') or
         not exists(select 1 from private.restaurant_members rm where rm.profile_id=v_profile.id
           and rm.restaurant_id=v_restaurant_id and rm.role::text=v_role) or
         exists(select 1 from private.user_roles ur where ur.profile_id=v_profile.id) or
         exists(select 1 from public.orders o where o.profile_id=v_profile.id) or
         exists(select 1 from public.addresses a where a.profile_id=v_profile.id) then
        raise exception 'Restaurant scope or Customer data conflicts with proposal' using errcode='23514';
      end if;
    elsif v_type='admin' then
      if v_restaurant_id is not null or v_role not in ('admin','super_admin') or
         not exists(select 1 from private.user_roles ur where ur.profile_id=v_profile.id
           and ur.role::text=v_role) or
         exists(select 1 from private.restaurant_members rm where rm.profile_id=v_profile.id) or
         exists(select 1 from public.orders o where o.profile_id=v_profile.id) or
         exists(select 1 from public.addresses a where a.profile_id=v_profile.id) then
        raise exception 'Admin authority or Customer data conflicts with proposal' using errcode='23514';
      end if;
    else
      raise exception 'Unknown account type' using errcode='22023';
    end if;
    select * into v_existing from private.account_access where profile_id=v_profile.id;
    if found then
      if v_existing.account_type::text<>v_type or
         v_existing.restaurant_id is distinct from v_restaurant_id or
         (v_type='restaurant' and v_existing.restaurant_role::text is distinct from v_role) or
         (v_type<>'restaurant' and v_existing.restaurant_role is not null) or
         (v_type='admin' and v_existing.admin_role::text is distinct from v_role) or
         (v_type<>'admin' and v_existing.admin_role is not null) then
        raise exception 'Existing canonical classification differs' using errcode='23514';
      end if;
      continue;
    end if;
    if v_type='customer' then
      insert into private.account_access(profile_id,account_type,status,activated_at)
        values(v_profile.id,'customer','active',statement_timestamp());
    elsif v_type='restaurant' then
      insert into private.account_access(profile_id,account_type,status,restaurant_id,
        restaurant_role,activated_at)
        values(v_profile.id,'restaurant','active',v_restaurant_id,
          v_role::public.restaurant_role,statement_timestamp());
    else
      insert into private.account_access(profile_id,account_type,status,onboarding_step,admin_role)
        values(v_profile.id,'admin','pending','admin_mfa_enrollment_required',
          v_role::private.admin_account_role);
    end if;
    insert into private.account_classification_entries(run_id,profile_id,inserted_row)
      select p_run_id,a.profile_id,to_jsonb(a) from private.account_access a where a.profile_id=v_profile.id;
    perform private.write_audit(null,'account.phase3_classified','profile',v_profile.id,
      pg_catalog.jsonb_build_object('run_id',p_run_id,'account_type',v_type));
    v_inserted := v_inserted+1;
  end loop;
  update private.account_classification_runs set inserted_count=v_inserted where id=p_run_id;
  return v_inserted;
end $$;

create function private.phase3_revert_classification(p_run_id uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_run private.account_classification_runs%rowtype;
  v_entry private.account_classification_entries%rowtype;
begin
  if session_user<>'postgres' then
    raise exception 'Reviewed operator revert required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hungrie:phase3-classification',0));
  select * into v_run from private.account_classification_runs where id=p_run_id for update;
  if not found then raise exception 'Unknown classification run' using errcode='22023'; end if;
  if v_run.state='reverted' then return 0; end if;
  for v_entry in select * from private.account_classification_entries where run_id=p_run_id loop
    if not exists(select 1 from private.account_access a where a.profile_id=v_entry.profile_id
      and to_jsonb(a)=v_entry.inserted_row) then
      raise exception 'Canonical row changed; manual recovery required' using errcode='23514';
    end if;
    delete from private.account_access where profile_id=v_entry.profile_id;
    perform private.write_audit(null,'account.phase3_classification_reverted','profile',
      v_entry.profile_id,pg_catalog.jsonb_build_object('run_id',p_run_id));
  end loop;
  update private.account_classification_runs set state='reverted',reverted_at=statement_timestamp()
    where id=p_run_id;
  return v_run.inserted_count;
end $$;

revoke all on function private.phase3_import_classification(uuid,text,text,jsonb),
  private.phase3_revert_classification(uuid) from public, anon, authenticated, service_role;
grant execute on function private.phase3_import_classification(uuid,text,text,jsonb),
  private.phase3_revert_classification(uuid) to postgres;
grant delete on private.account_access to hungrie_api_owner;
grant create on schema private to hungrie_api_owner;
alter function private.phase3_import_classification(uuid,text,text,jsonb) owner to hungrie_api_owner;
alter function private.phase3_revert_classification(uuid) owner to hungrie_api_owner;
revoke create on schema private from hungrie_api_owner;
