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

-- Private exam schema applied 2026-11-22; no admin identity or notice data in this reference.
-- Private exam notices. Run before enabling the new exam UI.
-- Admin bootstrap is intentionally out-of-band: the database owner sets one verified auth.users.id.
begin;
create schema if not exists gs_exam_private;
revoke all on schema gs_exam_private from public, anon, authenticated;
create table gs_exam_private.admin (
  singleton boolean primary key default true check(singleton),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check(email=lower(email))
);
create table gs_exam_private.identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check(email=lower(email)),
  student_id text not null unique check(student_id ~ '^[0-9]{10}$'),
  verified_at timestamptz not null default now()
);
create table gs_exam_private.notices (
  id bigint generated always as identity primary key,
  academic_year text not null check(academic_year ~ '^25[0-9]{2}$'),
  term text not null check(term in ('s1','s2','summer')),
  round text not null check(round in ('mid','fin')),
  faculty text not null check(length(faculty) between 1 and 80),
  source text not null check(length(source) between 1 and 250),
  rows jsonb not null check(jsonb_typeof(rows)='array'),
  active boolean not null default true,
  published_at timestamptz not null default now(),
  published_by uuid not null references auth.users(id)
);
create unique index gs_exam_one_active on gs_exam_private.notices(academic_year,term,round,faculty) where active;
alter table gs_exam_private.admin enable row level security;
alter table gs_exam_private.identities enable row level security;
alter table gs_exam_private.notices enable row level security;
revoke all on all tables in schema gs_exam_private from public, anon, authenticated;
revoke all on all sequences in schema gs_exam_private from public, anon, authenticated;

create function gs_exam_private.verified_email() returns text
language sql stable security definer set search_path='' as $$
select lower(email) from auth.users where id=auth.uid() and email_confirmed_at is not null
and lower(email)=lower(auth.jwt()->>'email');
$$;
create function gs_exam_private.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
select exists(select 1 from gs_exam_private.admin
where user_id=auth.uid() and email=gs_exam_private.verified_email());
$$;
revoke all on function gs_exam_private.verified_email(), gs_exam_private.is_admin() from public, anon, authenticated;

create function public.gs_exam_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare em text; sid text;
begin
 em:=gs_exam_private.verified_email();
 if em is null then raise exception 'verified email required' using errcode='42501'; end if;
 select student_id into sid from gs_exam_private.identities where user_id=auth.uid() and email=em;
 return jsonb_build_object('admin',gs_exam_private.is_admin(),'studentId',sid);
end;$$;

-- The sole admin checks evidence of ownership/enrollment outside the app before binding.
-- A student cannot claim an ID just by typing it. Changing or revoking the link requires the admin.
create function public.gs_exam_bind_student(p_email text,p_student_id text) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid; em text;
begin
 if not gs_exam_private.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
 em:=lower(trim(p_email));
 if p_student_id is not null and p_student_id !~ '^[0-9]{10}$' then raise exception 'invalid student number'; end if;
 select id into uid from auth.users where lower(email)=em and email_confirmed_at is not null;
 if uid is null then raise exception 'student must verify email first'; end if;
 if p_student_id is null then delete from gs_exam_private.identities where user_id=uid; return; end if;
 insert into gs_exam_private.identities(user_id,email,student_id) values(uid,em,p_student_id)
 on conflict(user_id) do update set email=excluded.email,student_id=excluded.student_id,verified_at=now();
end;$$;

-- Entire reviewed notice replaces the active version atomically. No raw attachment goes to GitHub.
create function public.gs_exam_publish(p_year text,p_term text,p_round text,p_faculty text,p_source text,p_rows jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare r jsonb; v jsonb; first_id text; last_id text; result_id bigint; s text;
begin
 if not gs_exam_private.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
 if p_year is null or p_year !~ '^25[0-9]{2}$' or p_term is null or p_term not in ('s1','s2','summer') or p_round is null or p_round not in ('mid','fin') then raise exception 'invalid scope'; end if;
 if p_faculty is null or length(trim(p_faculty)) not between 1 and 80 or p_source is null or length(trim(p_source)) not between 1 and 250 then raise exception 'invalid source'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 10000 or pg_column_size(p_rows)>5000000 then raise exception 'invalid notice'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
   if jsonb_typeof(r)<>'object' or coalesce(r->>'code','') !~ '^[0-9]{7}$' or coalesce(r->>'sec','') !~ '^([0-9]{1,3}(-[0-9]{1,3})?)?$'
   or coalesce(r->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(r->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$'
   or left(r->>'time',5)>=right(r->>'time',5) or length(trim(coalesce(r->>'room',''))) not between 1 and 180
   or coalesce(r->>'page','') !~ '^[1-9][0-9]{0,2}$' or jsonb_typeof(r->'sectionOnly') is distinct from 'boolean' or jsonb_typeof(r->'ranges') is distinct from 'array'
   then raise exception 'invalid exam row'; end if;
   if (r->>'date')::date is null then raise exception 'invalid date'; end if;
   s:=r->>'sec';
   if strpos(s,'-')>0 and split_part(s,'-',1)::int>split_part(s,'-',2)::int then raise exception 'invalid section range'; end if;
   if (r->>'sectionOnly')::boolean then
     if s='' or jsonb_array_length(r->'ranges')<>0 then raise exception 'invalid section-only rule'; end if;
   elsif jsonb_array_length(r->'ranges')=0 then raise exception 'missing student ranges'; end if;
   for v in select value from jsonb_array_elements(r->'ranges') loop
     first_id:=v->>'first';last_id:=v->>'last';
     if first_id is null or last_id is null or first_id !~ '^[0-9]{10}$' or last_id !~ '^[0-9]{10}$'
       or left(first_id,3)<>left(last_id,3) or right(first_id,2)<>right(last_id,2) or first_id>last_id then raise exception 'invalid student range'; end if;
   end loop;
 end loop;
 perform pg_advisory_xact_lock(hashtext(p_year||'|'||p_term||'|'||p_round||'|'||p_faculty)::bigint);
 update gs_exam_private.notices set active=false where academic_year=p_year and term=p_term and round=p_round and faculty=p_faculty and active;
 insert into gs_exam_private.notices(academic_year,term,round,faculty,source,rows,published_by)
 values(p_year,p_term,p_round,p_faculty,p_source,p_rows,auth.uid()) returning id into result_id;
 return result_id;
end;$$;

-- Return only the caller's possible matches, never the underlying ID rules or other identities.
-- No arbitrary student ID argument. All ambiguous possibilities must be resolved in the client.
create function public.gs_exam_lookup(p_year text,p_term text,p_round text,p_courses jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sid text; em text; result jsonb;
begin
 em:=gs_exam_private.verified_email();
 select student_id into sid from gs_exam_private.identities where user_id=auth.uid() and email=em;
 if sid is null then raise exception 'student identity not verified' using errcode='42501'; end if;
 if p_courses is null or jsonb_typeof(p_courses)<>'array' or jsonb_array_length(p_courses)>100 then raise exception 'invalid course request'; end if;
 select coalesce(jsonb_agg(distinct jsonb_build_object('code',r->>'code','sec',r->>'sec','date',r->>'date','time',r->>'time','room',r->>'room','page',r->'page','sectionOnly',r->'sectionOnly','hit',not (r->>'sectionOnly')::boolean,'source','central-notice')), '[]'::jsonb)
 into result from gs_exam_private.notices n cross join lateral jsonb_array_elements(n.rows) r
 where n.active and n.academic_year=p_year and n.term=p_term and n.round=p_round
 and exists(select 1 from jsonb_array_elements(p_courses) c where c->>'code'=r->>'code')
 and ((r->>'sectionOnly')::boolean or exists(select 1 from jsonb_array_elements(r->'ranges') v
 where left(sid,3)=left(v->>'first',3) and right(sid,2)=right(v->>'first',2) and sid between v->>'first' and v->>'last'));
 return result;
end;$$;
create function public.gs_exam_admin_history() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not gs_exam_private.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.id desc),'[]'::jsonb) into result
 from (select id,academic_year,term,round,faculty,source,active,published_at,jsonb_array_length(rows) as row_count from gs_exam_private.notices order by id desc limit 50) q;
 return result;
end;$$;
revoke all on function public.gs_exam_status(),public.gs_exam_bind_student(text,text),public.gs_exam_publish(text,text,text,text,text,jsonb),public.gs_exam_lookup(text,text,text,jsonb),public.gs_exam_admin_history() from public,anon,authenticated;
grant execute on function public.gs_exam_status(),public.gs_exam_bind_student(text,text),public.gs_exam_publish(text,text,text,text,text,jsonb),public.gs_exam_lookup(text,text,text,jsonb),public.gs_exam_admin_history() to authenticated;
commit;

-- Staged school login migration applied 2026-11-22. Owner email is private operational data.
-- Stage verified school login. Legacy grade API cutover is deliberately separate.
begin;
create table gs_exam_private.owner_email (
 singleton boolean primary key default true check(singleton),
 email text not null check(email=lower(email))
);
alter table gs_exam_private.owner_email enable row level security;
revoke all on gs_exam_private.owner_email from public,anon,authenticated;

-- Identity metadata is supplied by Google's provider, not editable user metadata.
-- Fail closed if Google does not return a verified Workspace hosted-domain claim.
create or replace function gs_exam_private.verified_email() returns text
language sql stable security definer set search_path='' as $$
 select lower(u.email)
 from auth.users u
 where u.id=auth.uid() and u.email_confirmed_at is not null
 and lower(u.email)=lower(auth.jwt()->>'email')
 and exists (
   select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
   and lower(i.identity_data->>'email')=lower(u.email)
   and i.identity_data->>'email_verified'='true'
   and (
     (lower(u.email) ~ '^[0-9]{10}@student[.]chula[.]ac[.]th$'
      and lower(coalesce(i.identity_data->>'hd','')) in ('student.chula.ac.th','chula.ac.th'))
     or exists(select 1 from gs_exam_private.owner_email o where o.email=lower(u.email))
   )
 );
$$;
revoke all on function gs_exam_private.verified_email() from public,anon,authenticated;

-- Only the database owner's privately configured email may bootstrap the one admin slot.
-- A verified numeric Workspace address supplies the student ID without manual ID approval.
create function public.gs_school_access() returns jsonb
language plpgsql security definer set search_path='' as $$
declare em text; sid text;
begin
 em:=gs_exam_private.verified_email();
 if em is null then raise exception 'verified university or owner account required' using errcode='42501'; end if;
 if exists(select 1 from gs_exam_private.owner_email where email=em) then
   insert into gs_exam_private.admin(singleton,user_id,email) values(true,auth.uid(),em)
   on conflict(singleton) do nothing;
   if not gs_exam_private.is_admin() then raise exception 'administrator identity differs' using errcode='42501'; end if;
 else
   sid:=split_part(em,'@',1);
   insert into gs_exam_private.identities(user_id,email,student_id) values(auth.uid(),em,sid)
   on conflict(user_id) do update set email=excluded.email,student_id=excluded.student_id,verified_at=now();
 end if;
 return public.gs_exam_status();
end;$$;

-- The browser cannot select a different email. Existing data is reused only for the same verified email.
create function public.gs_school_load() returns table(data jsonb,client_updated_at bigint)
language plpgsql stable security definer set search_path='' as $$
declare em text:=gs_exam_private.verified_email();
begin
 if em is null then raise exception 'verified account required' using errcode='42501'; end if;
 return query select l.data,l.client_updated_at from public.gs_load(em) l;
end;$$;
create function public.gs_school_save(p_data jsonb,p_updated bigint) returns void
language plpgsql security definer set search_path='' as $$
declare em text:=gs_exam_private.verified_email();
begin
 if em is null then raise exception 'verified account required' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid data'; end if;
 perform public.gs_save(em,p_data,p_updated);
end;$$;
revoke all on function public.gs_school_access(),public.gs_school_load(),public.gs_school_save(jsonb,bigint) from public,anon,authenticated;
grant execute on function public.gs_school_access(),public.gs_school_load(),public.gs_school_save(jsonb,bigint) to authenticated;
commit;

-- 2026-11-22: owner requested pause; experimental objects remain dormant.
-- Pause experimental school sign-in and individual exam-room features.
-- Preserve all saved data and leave the original grade-storage RPCs unchanged.
revoke execute on function public.gs_exam_admin_history(), public.gs_exam_bind_student(text,text), public.gs_exam_lookup(text,text,text,jsonb), public.gs_exam_publish(text,text,text,text,text,jsonb), public.gs_exam_status(), public.gs_school_access(), public.gs_school_load(), public.gs_school_save(jsonb,bigint) from public, anon, authenticated;
