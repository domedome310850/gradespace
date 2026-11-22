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
