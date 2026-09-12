-- Milestone 6: Firebase profile/membership import plus protected customer-owned
-- data operations. Firebase remains the identity provider.

alter table public.profiles
  add column deletion_pending_at timestamptz,
  add column deleted_at timestamptz,
  add constraint profiles_deletion_order check (
    deleted_at is null or deletion_pending_at is not null
  );

create unique index restaurant_members_one_membership_per_profile_idx
  on private.restaurant_members(profile_id);

create table migration.identity_profiles_stage (
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  id text not null check (btrim(id) <> ''),
  firebase_uid text check (firebase_uid is null or btrim(firebase_uid) <> ''),
  name text not null check (btrim(name) <> ''),
  email text not null check (btrim(email) <> ''),
  avatar_url text,
  whatsapp_number text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'tr')),
  source_kind text not null check (source_kind in ('firestore_auth', 'firestore_only', 'auth_only')),
  document_checksum text not null check (document_checksum ~ '^[0-9a-f]{64}$'),
  primary key (run_id, id)
);

create unique index identity_profiles_stage_run_firebase_uid_idx
  on migration.identity_profiles_stage(run_id, firebase_uid)
  where firebase_uid is not null;

create table migration.identity_addresses_stage (
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  id text not null check (btrim(id) <> ''),
  profile_id text not null check (btrim(profile_id) <> ''),
  label text not null check (btrim(label) <> ''),
  line1 text not null check (btrim(line1) <> ''),
  block text,
  room text,
  city text not null check (btrim(city) <> ''),
  country text not null check (btrim(country) <> ''),
  is_default boolean not null,
  created_at timestamptz,
  document_checksum text not null check (document_checksum ~ '^[0-9a-f]{64}$'),
  primary key (run_id, id),
  foreign key (run_id, profile_id)
    references migration.identity_profiles_stage(run_id, id) on delete restrict
);

create unique index identity_addresses_stage_one_default_idx
  on migration.identity_addresses_stage(run_id, profile_id)
  where is_default;

create table migration.identity_favorites_stage (
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  profile_id text not null check (btrim(profile_id) <> ''),
  restaurant_id text not null check (btrim(restaurant_id) <> ''),
  document_checksum text not null check (document_checksum ~ '^[0-9a-f]{64}$'),
  primary key (run_id, profile_id, restaurant_id),
  foreign key (run_id, profile_id)
    references migration.identity_profiles_stage(run_id, id) on delete restrict
);

create table migration.identity_memberships_stage (
  run_id uuid not null references migration.import_runs(id) on delete restrict,
  profile_id text not null check (btrim(profile_id) <> ''),
  restaurant_id text not null check (btrim(restaurant_id) <> ''),
  role public.restaurant_role not null,
  document_checksum text not null check (document_checksum ~ '^[0-9a-f]{64}$'),
  primary key (run_id, profile_id),
  unique (run_id, restaurant_id, profile_id),
  foreign key (run_id, profile_id)
    references migration.identity_profiles_stage(run_id, id) on delete restrict
);

revoke all on migration.identity_profiles_stage,
  migration.identity_addresses_stage, migration.identity_favorites_stage,
  migration.identity_memberships_stage from public, anon, authenticated;

create or replace function migration.promote_identity_import(p_run_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_rejections bigint;
  v_profiles bigint;
  v_addresses bigint;
  v_favorites bigint;
  v_memberships bigint;
  v_result jsonb;
begin
  perform 1 from migration.import_runs where id = p_run_id for update;
  if not found then raise exception 'Unknown identity import run'; end if;

  select count(*) into v_rejections from migration.import_rejections where run_id = p_run_id;
  if v_rejections > 0 then
    raise exception 'Identity promotion blocked by % rejected record(s)', v_rejections;
  end if;

  select count(*) into v_profiles from migration.identity_profiles_stage where run_id = p_run_id;
  select count(*) into v_addresses from migration.identity_addresses_stage where run_id = p_run_id;
  select count(*) into v_favorites from migration.identity_favorites_stage where run_id = p_run_id;
  select count(*) into v_memberships from migration.identity_memberships_stage where run_id = p_run_id;
  if v_profiles = 0 then raise exception 'Identity promotion requires profiles'; end if;

  update migration.import_runs
    set status = 'running', started_at = coalesce(started_at, statement_timestamp()), completed_at = null
    where id = p_run_id;

  insert into public.profiles (
    id, firebase_uid, name, email, avatar_url, whatsapp_number, preferred_language
  )
  select id, firebase_uid, name, email, avatar_url, whatsapp_number, preferred_language
  from migration.identity_profiles_stage where run_id = p_run_id
  on conflict (id) do update set
    firebase_uid = excluded.firebase_uid,
    name = excluded.name,
    email = excluded.email,
    avatar_url = excluded.avatar_url,
    whatsapp_number = excluded.whatsapp_number,
    preferred_language = excluded.preferred_language,
    deletion_pending_at = null,
    deleted_at = null;

  -- A final pre-rollout import runs while these domains are frozen. Replace
  -- only child data belonging to profiles in this complete snapshot.
  delete from public.favorites f using migration.identity_profiles_stage p
    where p.run_id = p_run_id and f.profile_id = p.id;
  delete from public.addresses a using migration.identity_profiles_stage p
    where p.run_id = p_run_id and a.profile_id = p.id;
  delete from private.restaurant_members rm using migration.identity_profiles_stage p
    where p.run_id = p_run_id and rm.profile_id = p.id;

  insert into public.addresses (
    id, profile_id, label, line1, block, room, city, country, is_default, created_at
  )
  select id, profile_id, label, line1, block, room, city, country, is_default,
    coalesce(created_at, statement_timestamp())
  from migration.identity_addresses_stage where run_id = p_run_id;

  insert into public.favorites (profile_id, restaurant_id)
  select profile_id, restaurant_id
  from migration.identity_favorites_stage where run_id = p_run_id;

  insert into private.restaurant_members (restaurant_id, profile_id, role)
  select restaurant_id, profile_id, role
  from migration.identity_memberships_stage where run_id = p_run_id;

  v_result := jsonb_build_object(
    'profiles', v_profiles, 'addresses', v_addresses,
    'favorites', v_favorites, 'memberships', v_memberships,
    'rejections', v_rejections
  );
  update migration.import_runs
    set status = 'completed', counts = counts || jsonb_build_object('identity', v_result),
        completed_at = statement_timestamp()
    where id = p_run_id;
  return v_result;
exception when others then
  update migration.import_runs set status = 'failed', completed_at = statement_timestamp()
    where id = p_run_id;
  raise;
end
$$;

revoke all on function migration.promote_identity_import(uuid) from public, anon, authenticated;

-- Deleted or pending-deletion profiles can no longer resolve through RLS.
create or replace function private.current_profile_id()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := private.request_jwt();
  subject text;
  result text;
begin
  if not private.jwt_is_authenticated() then return null; end if;
  subject := claims ->> 'sub';
  if btrim(coalesce(subject, '')) = '' then return null; end if;

  if claims ->> 'iss' = 'https://securetoken.google.com/hungrieapp-a2288' then
    if claims ->> 'aud' <> 'hungrieapp-a2288' then return null; end if;
    select p.id into result from public.profiles p
      where p.firebase_uid = subject and p.deletion_pending_at is null and p.deleted_at is null;
    return result;
  end if;

  if subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select p.id into result from public.profiles p
      where p.supabase_user_id = subject::uuid and p.deletion_pending_at is null and p.deleted_at is null;
  end if;
  return result;
end
$$;

create or replace function public.ensure_my_profile(
  p_name text,
  p_avatar_url text default null,
  p_whatsapp_number text default null,
  p_preferred_language text default 'en'
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := private.request_jwt();
  v_firebase_uid text := private.firebase_subject();
  v_supabase_uid uuid;
  v_subject text := v_claims ->> 'sub';
  v_email text := lower(btrim(coalesce(v_claims ->> 'email', '')));
  v_profile_id text;
begin
  if not private.jwt_is_authenticated() or btrim(coalesce(v_subject, '')) = '' then
    raise exception 'Authenticated identity required' using errcode = '42501';
  end if;
  if v_email = '' or btrim(coalesce(p_name, '')) = '' or p_preferred_language not in ('en', 'tr') then
    raise exception 'A valid name, email claim, and language are required' using errcode = '22023';
  end if;
  if v_firebase_uid is not null then
    select id into v_profile_id from public.profiles
      where firebase_uid = v_firebase_uid and deletion_pending_at is null and deleted_at is null;
  elsif v_subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_supabase_uid := v_subject::uuid;
    select id into v_profile_id from public.profiles
      where supabase_user_id = v_supabase_uid and deletion_pending_at is null and deleted_at is null;
  else
    raise exception 'Untrusted identity issuer or subject' using errcode = '42501';
  end if;
  if v_profile_id is not null then return v_profile_id; end if;

  v_profile_id := v_subject;
  insert into public.profiles (
    id, firebase_uid, supabase_user_id, name, email, avatar_url,
    whatsapp_number, preferred_language
  ) values (
    v_profile_id, v_firebase_uid, v_supabase_uid, btrim(p_name), v_email,
    nullif(btrim(coalesce(p_avatar_url, '')), ''),
    nullif(btrim(coalesce(p_whatsapp_number, '')), ''), p_preferred_language
  );
  perform private.write_audit(v_profile_id, 'profile.created', 'profile', v_profile_id);
  return v_profile_id;
end
$$;

create or replace function public.update_my_profile(
  p_name text,
  p_avatar_url text default null,
  p_whatsapp_number text default null,
  p_preferred_language text default 'en'
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_actor text := private.require_profile();
begin
  if btrim(coalesce(p_name, '')) = '' or length(btrim(p_name)) > 120
     or length(coalesce(p_avatar_url, '')) > 2048
     or length(coalesce(p_whatsapp_number, '')) > 40
     or p_preferred_language not in ('en', 'tr') then
    raise exception 'Invalid profile input' using errcode = '22023';
  end if;
  update public.profiles set
    name = btrim(p_name),
    avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), ''),
    whatsapp_number = nullif(btrim(coalesce(p_whatsapp_number, '')), ''),
    preferred_language = p_preferred_language
  where id = v_actor;
  perform private.write_audit(v_actor, 'profile.updated', 'profile', v_actor);
  return v_actor;
end
$$;

create or replace function public.create_my_address(
  p_id text, p_label text, p_line1 text, p_block text, p_room text,
  p_city text, p_country text, p_is_default boolean default false
)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_actor text := private.require_profile(); v_make_default boolean;
begin
  if btrim(coalesce(p_id,'')) = '' or btrim(coalesce(p_label,'')) = ''
     or btrim(coalesce(p_line1,'')) = '' or btrim(coalesce(p_city,'')) = ''
     or btrim(coalesce(p_country,'')) = '' then
    raise exception 'Address required fields are missing' using errcode = '22023';
  end if;
  perform 1 from public.addresses where profile_id = v_actor for update;
  v_make_default := p_is_default or not exists(select 1 from public.addresses where profile_id = v_actor);
  if v_make_default then update public.addresses set is_default = false where profile_id = v_actor; end if;
  insert into public.addresses(id, profile_id, label, line1, block, room, city, country, is_default)
    values (p_id, v_actor, btrim(p_label), btrim(p_line1), nullif(btrim(coalesce(p_block,'')),''),
      nullif(btrim(coalesce(p_room,'')),''), btrim(p_city), btrim(p_country), v_make_default);
  return p_id;
end $$;

create or replace function public.update_my_address(
  p_id text, p_label text, p_line1 text, p_block text, p_room text,
  p_city text, p_country text, p_is_default boolean default false
)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_actor text := private.require_profile(); v_was_default boolean; v_replacement text;
begin
  select is_default into v_was_default from public.addresses
    where id = p_id and profile_id = v_actor for update;
  if not found then raise exception 'Address unavailable' using errcode = '42501'; end if;
  if btrim(coalesce(p_label,'')) = '' or btrim(coalesce(p_line1,'')) = ''
     or btrim(coalesce(p_city,'')) = '' or btrim(coalesce(p_country,'')) = '' then
    raise exception 'Address required fields are missing' using errcode = '22023';
  end if;
  if p_is_default then
    update public.addresses set is_default = false where profile_id = v_actor and id <> p_id;
  elsif v_was_default then
    select id into v_replacement from public.addresses
      where profile_id = v_actor and id <> p_id order by created_at, id limit 1 for update;
    if v_replacement is not null then
      update public.addresses set is_default = true where id = v_replacement;
    else
      p_is_default := true;
    end if;
  end if;
  update public.addresses set label=btrim(p_label), line1=btrim(p_line1),
    block=nullif(btrim(coalesce(p_block,'')),''), room=nullif(btrim(coalesce(p_room,'')),''),
    city=btrim(p_city), country=btrim(p_country), is_default=p_is_default
    where id=p_id and profile_id=v_actor;
  return p_id;
end $$;

create or replace function public.delete_my_address(p_id text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_actor text := private.require_profile(); v_was_default boolean; v_replacement text;
begin
  select is_default into v_was_default from public.addresses
    where id=p_id and profile_id=v_actor for update;
  if not found then raise exception 'Address unavailable' using errcode = '42501'; end if;
  delete from public.addresses where id=p_id and profile_id=v_actor;
  if v_was_default then
    select id into v_replacement from public.addresses where profile_id=v_actor
      order by created_at,id limit 1 for update;
    if v_replacement is not null then update public.addresses set is_default=true where id=v_replacement; end if;
  end if;
end $$;

create or replace function public.replace_my_favorites(p_restaurant_ids text[])
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_actor text := private.require_profile(); v_invalid bigint; v_ids text[];
begin
  select coalesce(array_agg(distinct btrim(value)), '{}'::text[]) into v_ids
    from unnest(coalesce(p_restaurant_ids, '{}'::text[])) value where btrim(value) <> '';
  select count(*) into v_invalid from unnest(v_ids) as requested(restaurant_id)
    where not exists(select 1 from public.restaurants r where r.id=requested.restaurant_id and r.is_active);
  if v_invalid > 0 then raise exception 'Favorites include unavailable restaurants' using errcode='22023'; end if;
  delete from public.favorites where profile_id=v_actor;
  insert into public.favorites(profile_id,restaurant_id) select v_actor,id from unnest(v_ids) id;
  return cardinality(v_ids);
end $$;

-- These functions are called only by the trusted Firebase callable backend.
create or replace function public.begin_account_anonymization(p_firebase_uid text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_profile_id text; v_blocking_restaurant text;
begin
  select id into v_profile_id from public.profiles
    where firebase_uid=p_firebase_uid for update;
  if v_profile_id is null then return jsonb_build_object('state','not_found'); end if;
  if exists(select 1 from public.profiles where id=v_profile_id and deleted_at is not null) then
    return jsonb_build_object('state','completed','profile_id',v_profile_id);
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

create or replace function public.finalize_account_anonymization(p_profile_id text, p_firebase_uid text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.profiles set firebase_uid=null, supabase_user_id=null,
    deleted_at=coalesce(deleted_at,statement_timestamp())
  where id=p_profile_id and firebase_uid=p_firebase_uid and deletion_pending_at is not null;
  return found;
end $$;

create or replace function public.pending_account_anonymizations()
returns table(profile_id text, firebase_uid text)
language sql stable security definer set search_path = '' as $$
  select id, firebase_uid from public.profiles
  where deletion_pending_at is not null and deleted_at is null and firebase_uid is not null
$$;

grant select, insert, update, delete on public.addresses, public.favorites to hungrie_api_owner;
grant update on public.profiles, private.order_contacts to hungrie_api_owner;
grant select, delete on private.push_tokens, private.restaurant_couriers, private.user_roles,
  private.restaurant_members to hungrie_api_owner;

revoke all on function public.update_my_profile(text,text,text,text),
  public.create_my_address(text,text,text,text,text,text,text,boolean),
  public.update_my_address(text,text,text,text,text,text,text,boolean),
  public.delete_my_address(text), public.replace_my_favorites(text[])
  from public, anon;
grant execute on function public.update_my_profile(text,text,text,text),
  public.create_my_address(text,text,text,text,text,text,text,boolean),
  public.update_my_address(text,text,text,text,text,text,text,boolean),
  public.delete_my_address(text), public.replace_my_favorites(text[])
  to authenticated;

revoke all on function public.begin_account_anonymization(text),
  public.finalize_account_anonymization(text,text), public.pending_account_anonymizations()
  from public, anon, authenticated;
grant execute on function public.begin_account_anonymization(text),
  public.finalize_account_anonymization(text,text), public.pending_account_anonymizations()
  to service_role;

grant create on schema public to hungrie_api_owner;
alter function public.update_my_profile(text,text,text,text) owner to hungrie_api_owner;
alter function public.create_my_address(text,text,text,text,text,text,text,boolean) owner to hungrie_api_owner;
alter function public.update_my_address(text,text,text,text,text,text,text,boolean) owner to hungrie_api_owner;
alter function public.delete_my_address(text) owner to hungrie_api_owner;
alter function public.replace_my_favorites(text[]) owner to hungrie_api_owner;
alter function public.begin_account_anonymization(text) owner to hungrie_api_owner;
alter function public.finalize_account_anonymization(text,text) owner to hungrie_api_owner;
alter function public.pending_account_anonymizations() owner to hungrie_api_owner;
revoke create on schema public from hungrie_api_owner;

revoke insert, update, delete on public.addresses, public.favorites from authenticated;
revoke update on public.profiles from authenticated;

comment on function migration.promote_identity_import(uuid) is
  'Administrative Milestone 6 identity promotion; never exposed to mobile roles.';
