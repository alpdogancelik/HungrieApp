-- Phase 5 staging correction: Storage RLS needs a callable, narrow predicate.
-- The canonical private helpers remain unavailable to authenticated clients.

create function public.restaurant_can_manage_media_object_v1(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    split_part(p_object_name, '/', 1) = private.current_restaurant_id()
      and strpos(p_object_name, '/') > 1,
    false
  )
$$;

drop policy restaurant_media_canonical_insert on storage.objects;
drop policy restaurant_media_canonical_update on storage.objects;
drop policy restaurant_media_canonical_delete on storage.objects;

create policy restaurant_media_canonical_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'restaurant-media'
  and public.restaurant_can_manage_media_object_v1(name)
);

create policy restaurant_media_canonical_update
on storage.objects for update to authenticated
using (
  bucket_id = 'restaurant-media'
  and public.restaurant_can_manage_media_object_v1(name)
)
with check (
  bucket_id = 'restaurant-media'
  and public.restaurant_can_manage_media_object_v1(name)
);

create policy restaurant_media_canonical_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'restaurant-media'
  and public.restaurant_can_manage_media_object_v1(name)
);

grant create on schema public to hungrie_api_owner;
alter function public.restaurant_can_manage_media_object_v1(text) owner to hungrie_api_owner;
revoke create on schema public from hungrie_api_owner;

revoke all on function public.restaurant_can_manage_media_object_v1(text)
  from public, anon, authenticated, service_role;
grant execute on function public.restaurant_can_manage_media_object_v1(text)
  to authenticated;
