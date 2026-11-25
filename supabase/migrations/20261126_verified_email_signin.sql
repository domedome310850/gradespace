-- Secure sign-in, step 1 (owner-approved plan, 2026-11-26).
-- STATUS: written, NOT applied. The owner reviews this file before it is applied to the live project.
--
-- Idea: keep every student's data exactly where it is (gradespace_by_email, keyed by email).
-- A student who proves they own the email with a one-time code (Supabase Auth email OTP) reads and
-- saves through gs_me_load / gs_me_save, which take the email from the verified session instead of
-- from the request. The first verified load marks the row (verified_at); from then on the old
-- email-only RPCs (gs_load / gs_save) refuse that row, so nobody can open it by typing the email.
-- Rows never signed in with a code keep working with email-only access until the owner switches it off.
-- No data is copied, renamed or deleted. Rollback: run the "rollback" block at the bottom.
begin;

-- 1) Additive column: when the owner of this email first signed in with a code.
alter table public.gradespace_by_email add column if not exists verified_at timestamptz;

-- 2) The verified email of the signed-in Supabase Auth user, or null.
create or replace function public.gs_me_email() returns text
language sql stable security definer set search_path to '' as $$
  select lower(trim(u.email)) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null and u.email is not null
    and coalesce(u.is_anonymous, false) = false
$$;
revoke all on function public.gs_me_email() from public, anon, authenticated;

-- 3) Shared save body (same logic as the live gs_save: daily backup + course keep-list). Internal only.
create or replace function public.gs_save_core(e text, p_data jsonb, p_updated bigint)
returns void language plpgsql security definer set search_path to '' as $function$
declare
  old jsonb;
  merged jsonb := p_data;
begin
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid email'; end if;
  if pg_column_size(p_data) > 2000000 then raise exception 'data too large'; end if;
  select g.data into old from public.gradespace_by_email g where g.email = e;
  if old is not null then
    insert into public.gradespace_backups (email, day, data)
    values (e, (now() at time zone 'Asia/Bangkok')::date, old)
    on conflict (email, day) do nothing;
    if jsonb_typeof(p_data->'courses') = 'array' and jsonb_typeof(old->'courses') = 'array' then
      merged := jsonb_set(p_data, '{courses}', coalesce((
        select jsonb_agg(
          case when o.c is null then n.c
               else n.c || coalesce((select jsonb_object_agg(k, o.c->k)
                                     from unnest(array['gradingMode', 'exams', 'section']) k
                                     where o.c ? k and not (n.c ? k)), '{}'::jsonb)
          end order by n.ord)
        from jsonb_array_elements(p_data->'courses') with ordinality as n(c, ord)
        left join lateral (
          select x as c from jsonb_array_elements(old->'courses') x where x->>'id' = n.c->>'id' limit 1
        ) o on true), '[]'::jsonb));
    end if;
  end if;
  insert into public.gradespace_by_email (email, data, client_updated_at) values (e, merged, coalesce(p_updated, 0))
  on conflict (email) do update set data = excluded.data, client_updated_at = excluded.client_updated_at, updated_at = now();
end;
$function$;
revoke all on function public.gs_save_core(text, jsonb, bigint) from public, anon, authenticated;

-- 4) Verified load/save for signed-in students.
create or replace function public.gs_me_load() returns table(data jsonb, client_updated_at bigint)
language plpgsql security definer set search_path to '' as $function$
declare e text := public.gs_me_email();
begin
  if e is null then raise exception 'not signed in'; end if;
  update public.gradespace_by_email g set verified_at = coalesce(g.verified_at, now()) where g.email = e;
  return query select g.data, g.client_updated_at from public.gradespace_by_email g where g.email = e;
end;
$function$;

create or replace function public.gs_me_save(p_data jsonb, p_updated bigint) returns void
language plpgsql security definer set search_path to '' as $function$
declare e text := public.gs_me_email();
begin
  if e is null then raise exception 'not signed in'; end if;
  perform public.gs_save_core(e, p_data, p_updated);
  update public.gradespace_by_email set verified_at = coalesce(verified_at, now()) where email = e;
end;
$function$;
revoke all on function public.gs_me_load(), public.gs_me_save(jsonb, bigint) from public, anon;
grant execute on function public.gs_me_load(), public.gs_me_save(jsonb, bigint) to authenticated;

-- 5) Email-only RPCs keep working, except for rows whose owner already verified.
create or replace function public.gs_load(p_email text) returns table(data jsonb, client_updated_at bigint)
language sql stable security definer set search_path to '' as $function$
  select g.data, g.client_updated_at from public.gradespace_by_email g
  where g.email = lower(trim(p_email)) and g.verified_at is null;
$function$;

create or replace function public.gs_save(p_email text, p_data jsonb, p_updated bigint) returns void
language plpgsql security definer set search_path to '' as $function$
declare e text := lower(trim(p_email));
begin
  if exists (select 1 from public.gradespace_by_email g where g.email = e and g.verified_at is not null) then
    raise exception 'verified account: sign in with a code';
  end if;
  perform public.gs_save_core(e, p_data, p_updated);
end;
$function$;

commit;

-- Rollback (restores email-only access for everyone; keeps the column and all data):
-- begin;
-- create or replace function public.gs_load(p_email text) returns table(data jsonb, client_updated_at bigint)
--   language sql stable security definer set search_path to '' as $$
--   select g.data, g.client_updated_at from public.gradespace_by_email g where g.email = lower(trim(p_email)); $$;
-- create or replace function public.gs_save(p_email text, p_data jsonb, p_updated bigint) returns void
--   language plpgsql security definer set search_path to '' as $$ begin perform public.gs_save_core(lower(trim(p_email)), p_data, p_updated); end; $$;
-- revoke execute on function public.gs_me_load(), public.gs_me_save(jsonb, bigint) from authenticated;
-- commit;
