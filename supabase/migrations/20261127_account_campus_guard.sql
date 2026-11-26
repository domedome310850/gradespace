-- Draft: review the account-to-campus mapping and enable verified email sign-in first.
-- Apply only after 20261126_verified_email_signin.sql and provisioning trusted admin
-- app_metadata.gradespace_admin=true on the owner's verified auth account.
-- Existing users retain their currently saved workspace; review users who switched
-- in the past against actual registration records before deployment.
begin;
alter table public.gradespace_by_email
  add column if not exists campus_home text check (campus_home in ('cu','tu'));

update public.gradespace_by_email
set campus_home = case when data #>> '{settings,institution}' = 'tu' then 'tu' else 'cu' end
where campus_home is null;

create or replace function public.gs_guard_account_campus() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  requested text := coalesce(nullif(new.data #>> '{settings,institution}', ''), 'cu');
  admin_session boolean := false;
begin
  if requested not in ('cu','tu') then
    raise exception 'invalid university workspace';
  end if;
  if tg_op = 'INSERT' then
    -- First registration chooses the campus; no client-provided home override.
    new.campus_home := requested;
  else
    new.campus_home := old.campus_home;
    select exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and u.email_confirmed_at is not null
        and lower(trim(u.email)) = lower(trim(old.email))
        and u.raw_app_meta_data->'gradespace_admin' = 'true'::jsonb
    ) into admin_session;
    if requested is distinct from old.campus_home and not admin_session then
      raise exception 'university workspace is fixed for this account';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.gs_guard_account_campus() from public, anon, authenticated;
drop trigger if exists gs_guard_account_campus on public.gradespace_by_email;
create trigger gs_guard_account_campus
before insert or update of data, campus_home on public.gradespace_by_email
for each row execute function public.gs_guard_account_campus();

commit;
-- This guard protects active campus writes; it intentionally leaves historic
-- archived workspaces and public catalog assets intact. It does not make the
-- legacy email-only RPC an authenticated account system.
