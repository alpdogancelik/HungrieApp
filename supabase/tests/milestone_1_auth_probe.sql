begin;

select plan(1);

select ok(
  to_regprocedure('public.migration_auth_probe()') is null,
  'the temporary Milestone 1 authentication probe is removed by Milestone 3'
);
select * from finish();
rollback;
