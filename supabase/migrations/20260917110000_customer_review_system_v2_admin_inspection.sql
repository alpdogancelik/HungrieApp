-- Customer Review System v2, Phase 6: additive Admin inspection contract.
-- This migration does not rewrite review data or broaden direct table access.

grant create on schema public to hungrie_api_owner;

create or replace function public.admin_list_order_review_reports_v2(
  p_status public.review_report_status default null,p_restaurant_id text default null,
  p_cursor text default null,p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_admin('admin'); v_created timestamptz; v_id text;
  v_limit integer:=least(greatest(coalesce(p_limit,20),1),50); v_items jsonb; v_next text;
begin
  if p_cursor is not null then
    select d.created_at,d.id into v_created,v_id from private.review_v2_cursor_decode(p_cursor)d;
  end if;
  with page as (
    select rp.*,r.contract_version,r.taste_rating,r.speed_rating,r.comment,r.items_snapshot,
      r.status review_status,r.created_at review_created_at
    from private.order_review_reports rp join public.order_reviews r on r.id=rp.review_id
    where (p_status is null or rp.status=p_status)
      and (p_restaurant_id is null or rp.restaurant_id=p_restaurant_id)
      and (p_cursor is null or (rp.created_at,rp.id::text)<(v_created,v_id))
    order by rp.created_at desc,rp.id desc limit v_limit+1
  ), shown as (select * from page order by created_at desc,id desc limit v_limit)
  select coalesce(jsonb_agg(jsonb_build_object('reportId',s.id,'reviewId',s.review_id,
      'restaurantId',s.restaurant_id,'reason',s.reason,'internalNote',s.internal_note,
      'reportStatus',s.status,'resolutionNote',s.resolution_note,'reportCreatedAt',s.created_at,
      'review',jsonb_build_object('contractVersion',s.contract_version,
        'overallRating',round((s.taste_rating+s.speed_rating)::numeric/2,2),
        'tasteRating',s.taste_rating,'speedRating',s.speed_rating,'comment',s.comment,
        'items',private.review_v2_safe_items(s.items_snapshot),
        'status',s.review_status,'createdAt',s.review_created_at))
      order by s.created_at desc,s.id desc),'[]'::jsonb),
    case when (select count(*) from page)>v_limit then
      (select private.review_v2_cursor_encode(s2.created_at,s2.id::text)
       from shown s2 order by s2.created_at,s2.id limit 1)
      else null end into v_items,v_next from shown s;
  return jsonb_build_object('items',v_items,'nextCursor',v_next,'limit',v_limit);
end $$;

create or replace function public.admin_list_order_review_audit_v2(
  p_report_id uuid,p_cursor text default null,p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=private.require_active_admin('admin'); v_review_id text; v_restaurant_id text;
  v_created timestamptz; v_id text; v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
  v_items jsonb; v_next text;
begin
  select rp.review_id,rp.restaurant_id into v_review_id,v_restaurant_id
  from private.order_review_reports rp where rp.id=p_report_id;
  if not found then raise exception 'Report not found' using errcode='22023'; end if;
  if p_cursor is not null then
    select d.created_at,d.id into v_created,v_id from private.review_v2_cursor_decode(p_cursor)d;
  end if;
  with page as (
    select l.id,l.actor_profile_id,l.action,l.target_type,l.target_id,l.metadata,l.created_at
    from private.audit_log l
    where (
      (l.action in ('order_review.reported_v2','order_review.report_status_changed_v2')
        and l.target_type='order_review_report' and l.target_id=p_report_id::text)
      or
      (l.action='order_review.visibility_changed_v2'
        and l.target_type='order_review' and l.target_id=v_review_id)
    ) and (p_cursor is null or (l.created_at,l.id::text)<(v_created,v_id))
    order by l.created_at desc,l.id desc limit v_limit+1
  ), shown as (select * from page order by created_at desc,id desc limit v_limit)
  select coalesce(jsonb_agg(jsonb_build_object(
      'auditId',s.id,'actorProfileId',s.actor_profile_id,'action',s.action,
      'targetType',s.target_type,'targetId',s.target_id,
      'contractVersion',case when (s.metadata->>'contract_version')~'^[0-9]+$'
        then (s.metadata->>'contract_version')::integer else null end,
      'restaurantId',s.metadata->>'restaurant_id','operationId',s.metadata->>'operation_id',
      'priorState',s.metadata->>'prior_state','newState',s.metadata->>'new_state',
      'reportReason',s.metadata->>'report_reason',
      'moderationReason',s.metadata->>'moderation_reason','createdAt',s.created_at)
      order by s.created_at desc,s.id desc),'[]'::jsonb),
    case when (select count(*) from page)>v_limit then
      (select private.review_v2_cursor_encode(s2.created_at,s2.id::text)
       from shown s2 order by s2.created_at,s2.id limit 1)
      else null end into v_items,v_next from shown s;
  return jsonb_build_object('items',v_items,'nextCursor',v_next,'limit',v_limit);
end $$;

alter function public.admin_list_order_review_reports_v2(public.review_report_status,text,text,integer)
  owner to hungrie_api_owner;
alter function public.admin_list_order_review_audit_v2(uuid,text,integer) owner to hungrie_api_owner;

revoke all on function
  public.admin_list_order_review_reports_v2(public.review_report_status,text,text,integer),
  public.admin_list_order_review_audit_v2(uuid,text,integer)
from public,anon,authenticated,service_role;

grant execute on function
  public.admin_list_order_review_reports_v2(public.review_report_status,text,text,integer),
  public.admin_list_order_review_audit_v2(uuid,text,integer)
to authenticated;

revoke create on schema public from hungrie_api_owner;
