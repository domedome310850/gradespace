-- GradeSpace database (Supabase project jecdbhfnuudmngpqmrrq) — reference copy of what is live.
-- This file documents the schema; it was exported on 2026-11-22. Change the live database with a new,
-- dated file in supabase/migrations/ and apply it, then update this file to match.
-- Secrets are NOT here: the sync token lives in Supabase Vault as 'reg_sync_token';
-- AI keys are Edge Function secrets (GEMINI_API_KEY or ANTHROPIC_API_KEY).

-- ============ tables (RLS on everywhere; the site only goes through the RPC functions below) ============

-- One row per student, keyed by email; data = the whole app state (settings, years, semesters, courses, assessments…)
create table public.gradespace_by_email (
  email text primary key,
  data jsonb not null,
  client_updated_at bigint not null default 0,   -- ms timestamp from the client that saved last
  updated_at timestamptz not null default now()
);
-- One snapshot per student per day (Bangkok date), taken by gs_save before overwriting. Kept 14 days.
create table public.gradespace_backups (
  email text not null,
  day date not null,
  data jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (email, day)
);
-- Older login-based storage (not used by the current site).
create table public.gradespace_states (
  user_id uuid primary key default auth.uid(),
  data jsonb not null,
  client_updated_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
-- Public course schedules read from Reg Chula by the reg-sync function.
create table public.reg_offerings (
  academic_year text not null, term text not null, program text not null default 'S', course_no text not null,
  abbr_name text, name_en text, name_th text, department text, credits numeric, credit_hours text,
  midterm jsonb, final jsonb,                       -- {date, start, end}
  sections jsonb not null default '[]',             -- [{sec, closed, note, seats, teachers[], classes[{type, day, start, end, building, room, teachers}]}]
  fetched_at timestamptz not null default now(),
  primary key (academic_year, term, program, course_no)
);
-- Work list for reg-sync: what to read next and when.
create table public.reg_queue (
  academic_year text not null, term text not null, program text not null default 'S', course_no text not null,
  next_due timestamptz not null default now(), last_ok timestamptz,
  status text,                                      -- null (never read) | ok | not_offered | waiting | error
  last_error text, fails integer not null default 0,
  primary key (academic_year, term, program, course_no)
);
-- GenEd course list from gened.chula.ac.th, refreshed daily by gened-sync.
create table public.gened_courses (
  code text primary key check (code ~ '^\d{7}$'),
  name text not null,
  cats text[] not null default '{}',                -- hum, inter, sci, soc, c21, mooc
  credits numeric, hours text,
  tags text[] not null default '{}',                -- enth, inter, special
  seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ functions ============

CREATE OR REPLACE FUNCTION public.gradespace_touch()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
begin new.updated_at := now(); return new; end; $function$;

CREATE OR REPLACE FUNCTION public.gs_load(p_email text)
 RETURNS TABLE(data jsonb, client_updated_at bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select g.data, g.client_updated_at from public.gradespace_by_email g where g.email = lower(trim(p_email));
$function$;

-- Saves the whole state. Keeps a daily backup, and keeps gradingMode/exams/section on a course
-- when an older copy of the site sends the course without those keys.
CREATE OR REPLACE FUNCTION public.gs_save(p_email text, p_data jsonb, p_updated bigint)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  e text := lower(trim(p_email));
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

CREATE OR REPLACE FUNCTION public.gs_reg_offerings(p_year text, p_term text, p_codes text[])
 RETURNS SETOF reg_offerings LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select * from public.reg_offerings
  where academic_year = p_year and term = p_term
    and course_no = any (select left(c, 7) from unnest(p_codes[1:60]) c)
$function$;

-- The site asks for courses Reg hasn't been read for yet (max 20 per call).
CREATE OR REPLACE FUNCTION public.gs_reg_request(p_year text, p_term text, p_codes text[])
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare n int;
begin
  if p_year !~ '^25[6-9][0-9]$' or p_term not in ('1','2','3') then return 0; end if;
  insert into public.reg_queue (academic_year, term, program, course_no)
  select p_year, p_term, 'S', c from (select distinct left(x, 7) c from unnest(p_codes[1:20]) x) s
  where c ~ '^[0-9]{7}$'
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.gs_gened_list(p_year text, p_term text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', g.code, 'name', g.name, 'cats', g.cats, 'credits', g.credits, 'hours', g.hours, 'tags', g.tags,
    'offered', case when o.course_no is not null then true when q.status = 'not_offered' then false else null end,
    'nameTh', o.name_th, 'final', o.final, 'midterm', o.midterm,
    'secs', case when o.course_no is null then null else (
      select jsonb_agg(jsonb_build_object('sec', s->>'sec', 'closed', s->'closed', 'seats', s->>'seats', 'note', s->>'note',
        'classes', (select jsonb_agg(jsonb_build_object('day', k->>'day', 'start', k->>'start', 'end', k->>'end', 'building', k->>'building', 'room', k->>'room'))
                    from jsonb_array_elements(coalesce(s->'classes','[]'::jsonb)) k)))
      from jsonb_array_elements(coalesce(o.sections,'[]'::jsonb)) s) end
  ) order by g.code), '[]'::jsonb)
  from gened_courses g
  left join reg_offerings o on o.course_no = g.code and o.academic_year = p_year and o.term = p_term and o.program = 'S'
  left join reg_queue q on q.course_no = g.code and q.academic_year = p_year and q.term = p_term and q.program = 'S'
  where g.seen_at > now() - interval '30 days';
$function$;

-- Used by the sync functions to check the x-sync-token header (service_role only).
CREATE OR REPLACE FUNCTION public.reg_sync_check_token(p_token text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'vault'
AS $function$
  select exists (select 1 from vault.decrypted_secrets where name = 'reg_sync_token' and decrypted_secret = p_token)
$function$;

-- Who may call what: the site (anon) only gets these RPCs.
-- grant execute on function public.gs_load, gs_save, gs_reg_offerings, gs_reg_request, gs_gened_list to anon, authenticated;
-- reg_sync_check_token: service_role only.

-- ============ scheduled jobs (pg_cron + pg_net) ============
-- gradespace-reg-sync       */10 * * * *  POST /functions/v1/reg-sync    body {"batch":8}, header x-sync-token from Vault
-- gradespace-gened-sync     41 19 * * *   POST /functions/v1/gened-sync  (02:41 Bangkok), same header
-- gradespace-backup-cleanup 17 3 * * *    delete from public.gradespace_backups where day < Bangkok today - 14
