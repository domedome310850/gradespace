-- Applied to GradeSpace on 2026-11-22. PDF ranges are kept in the private live database, not in GitHub.
create schema if not exists gs_room_data;
revoke all on schema gs_room_data from public, anon, authenticated;
create table gs_room_data.rules (
 academic_year text not null, term text not null, round text not null, faculty text not null, source text not null,
 code text not null check (code ~ '^[0-9]{7}$'), sec text not null check (sec ~ '^([0-9]{1,3}(-[0-9]{1,3})?)?$'),
 exam_date date not null, exam_time text not null, room text not null, page integer not null check(page>0),
 section_only boolean not null, ranges jsonb not null check(jsonb_typeof(ranges)='array'),
 primary key(academic_year,term,round,faculty,code,sec,exam_date,exam_time,room,page),
 check ((section_only and sec<>'' and jsonb_array_length(ranges)=0) or (not section_only and jsonb_array_length(ranges)>0))
);
alter table gs_room_data.rules enable row level security;
revoke all on gs_room_data.rules from public,anon,authenticated;
create table public.gs_exam_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
 student_id text not null check(student_id ~ '^[0-9]{10}$')
);
alter table public.gs_exam_profiles enable row level security;
revoke all on public.gs_exam_profiles from public,anon,authenticated;
grant select,insert,update,delete on public.gs_exam_profiles to authenticated;
create policy own_exam_profile_select on public.gs_exam_profiles for select to authenticated using ((select auth.uid())=user_id);
create policy own_exam_profile_insert on public.gs_exam_profiles for insert to authenticated with check ((select auth.uid())=user_id and exists(select 1 where (select auth.jwt()->>'email') is not null));
create policy own_exam_profile_update on public.gs_exam_profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_exam_profile_delete on public.gs_exam_profiles for delete to authenticated using ((select auth.uid())=user_id);
create function gs_room_data.lookup(p_year text,p_term text,p_round text,p_courses jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sid text; result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null) then raise exception 'verified email required' using errcode='42501'; end if;
 select student_id into sid from public.gs_exam_profiles where user_id=auth.uid();
 if sid is null then return '[]'::jsonb; end if;
 if p_courses is null or jsonb_typeof(p_courses)<>'array' or jsonb_array_length(p_courses)>100 then raise exception 'invalid courses'; end if;
 select coalesce(jsonb_agg(x order by x->>'date',x->>'time',x->>'code'), '[]'::jsonb) into result from (
 select distinct jsonb_build_object('code',r.code,'sec',r.sec,'date',r.exam_date,'time',r.exam_time,'room',r.room,'page',r.page,'sectionOnly',r.section_only,'source',r.source) x
 from gs_room_data.rules r
 where r.academic_year=p_year and r.term=p_term and r.round=p_round
 and exists(select 1 from jsonb_array_elements(p_courses) c where c->>'code'=r.code and
 case when r.sec='' then true when coalesce(c->>'sec','') ~ '^[0-9]{1,3}$' then (c->>'sec')::int between split_part(r.sec,'-',1)::int and (case when strpos(r.sec,'-')>0 then split_part(r.sec,'-',2)::int else r.sec::int end) else false end)
 and (r.section_only or exists(select 1 from jsonb_array_elements(r.ranges) v where left(sid,3)=left(v->>'first',3) and right(sid,2)=right(v->>'first',2) and sid between v->>'first' and v->>'last'))
 ) q; return result;
end; $$;
revoke all on function gs_room_data.lookup(text,text,text,jsonb) from public,anon,authenticated;
grant usage on schema gs_room_data to authenticated;
grant execute on function gs_room_data.lookup(text,text,text,jsonb) to authenticated;
create function public.gs_exam_rooms_for_me(p_year text,p_term text,p_round text,p_courses jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$select gs_room_data.lookup(p_year,p_term,p_round,p_courses)$$;
revoke all on function public.gs_exam_rooms_for_me(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.gs_exam_rooms_for_me(text,text,text,jsonb) to authenticated;
