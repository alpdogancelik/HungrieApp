begin;

-- Reading preferences creates the caller's default row on first use, so the
-- guarded wrapper must permit the write performed by get_my_notification_preferences().
alter function public.get_my_customer_notification_preferences_v1() volatile;

commit;
