-- Firestore address document IDs are scoped by their parent user document.
-- Preserve those IDs without pretending they are globally unique.

alter table public.addresses drop constraint addresses_pkey;
alter table public.addresses add primary key (profile_id, id);

alter table migration.identity_addresses_stage
  drop constraint identity_addresses_stage_pkey;
alter table migration.identity_addresses_stage
  add primary key (run_id, profile_id, id);

create or replace function public.set_default_address(p_address_id text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor text := private.require_profile();
begin
  perform 1 from public.addresses
    where id = p_address_id and profile_id = v_actor for update;
  if not found then
    raise exception 'Address not found' using errcode = '42501';
  end if;
  update public.addresses set is_default = false
    where profile_id = v_actor and is_default and id <> p_address_id;
  update public.addresses set is_default = true
    where profile_id = v_actor and id = p_address_id;
  perform private.write_audit(v_actor, 'address.default_changed', 'address', p_address_id);
end
$$;

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
      update public.addresses set is_default = true
        where profile_id = v_actor and id = v_replacement;
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
    if v_replacement is not null then
      update public.addresses set is_default=true
        where profile_id=v_actor and id=v_replacement;
    end if;
  end if;
end $$;
