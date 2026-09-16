-- Phase 2 deliberately withheld Customer self-bootstrap. Phase 6 is the first
-- Customer client that implements the exclusive access-context contract, so
-- authenticated Firebase callers may now invoke the caller-bound bootstrap.

revoke all on function public.bootstrap_my_customer_account_v1(uuid)
  from public,anon,service_role;
grant execute on function public.bootstrap_my_customer_account_v1(uuid)
  to authenticated;
