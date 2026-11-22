create table gs_room_data.device_profiles (
 email text not null check (email=lower(email) and length(email) between 3 and 254),
 device_hash bytea not null check (octet_length(device_hash)=32),
 student_id text not null check(student_id ~ '^[0-9]{10}$'),
 updated_at timestamptz not null default now(),
 primary key(email,device_hash)
);
alter table gs_room_data.device_profiles enable row level security;
revoke all on gs_room_data.device_profiles from public,anon,authenticated;

-- Email is a label, not authentication. A random per-browser capability protects the saved ID.
-- No list/search by email, no returned raw notice ranges, no access to grade records.
create function gs_room_data.device_exam(p_email text,p_device text,p_action text,p_student_id text default null,p_year text default null,p_term text default null,p_round text default null,p_courses jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare em text:=lower(trim(p_email)); dh bytea; sid text; result jsonb;
begin
 if em is null or length(em)>254 or em !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or p_device is null or p_device !~ '^[0-9a-f]{64}$' then raise exception 'invalid exam profile'; end if;
 dh:=pg_catalog.sha256(pg_catalog.convert_to(p_device,'UTF8'));
 if p_action='save' then
   if p_student_id is null or p_student_id !~ '^[0-9]{10}$' then raise exception 'invalid student ID'; end if;
   insert into gs_room_data.device_profiles(email,device_hash,student_id) values(em,dh,p_student_id)
   on conflict(email,device_hash) do update set student_id=excluded.student_id,updated_at=now();
   return jsonb_build_object('saved',true);
 elsif p_action='remove' then
   delete from gs_room_data.device_profiles where email=em and device_hash=dh;
   return jsonb_build_object('saved',false);
 end if;
 select student_id into sid from gs_room_data.device_profiles where email=em and device_hash=dh;
 if p_action='get' then return jsonb_build_object('studentId',sid); end if;
 if p_action is distinct from 'lookup' then raise exception 'invalid action'; end if;
 if sid is null then return '[]'::jsonb; end if;
 if p_courses is null or jsonb_typeof(p_courses)<>'array' or jsonb_array_length(p_courses)>100 then raise exception 'invalid courses'; end if;
 select coalesce(jsonb_agg(x order by x->>'date',x->>'time',x->>'code'),'[]'::jsonb) into result from (
  select distinct jsonb_build_object('code',r.code,'sec',r.sec,'date',r.exam_date,'time',r.exam_time,'room',r.room,'page',r.page,'sectionOnly',r.section_only,'source',r.source) x
  from gs_room_data.rules r where r.academic_year=p_year and r.term=p_term and r.round=p_round
  and exists(select 1 from jsonb_array_elements(p_courses) c where c->>'code'=r.code and case when r.sec='' then true when coalesce(c->>'sec','') ~ '^[0-9]{1,3}$' then (c->>'sec')::int between split_part(r.sec,'-',1)::int and (case when strpos(r.sec,'-')>0 then split_part(r.sec,'-',2)::int else r.sec::int end) else false end)
  and (r.section_only or exists(select 1 from jsonb_array_elements(r.ranges) v where left(sid,3)=left(v->>'first',3) and right(sid,2)=right(v->>'first',2) and sid between v->>'first' and v->>'last'))
 ) q;
 return result;
end;$$;
revoke all on function gs_room_data.device_exam(text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant usage on schema gs_room_data to anon,authenticated;
grant execute on function gs_room_data.device_exam(text,text,text,text,text,text,text,jsonb) to anon,authenticated;
create function public.gs_exam_device(p_email text,p_device text,p_action text,p_student_id text default null,p_year text default null,p_term text default null,p_round text default null,p_courses jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$select gs_room_data.device_exam(p_email,p_device,p_action,p_student_id,p_year,p_term,p_round,p_courses)$$;
revoke all on function public.gs_exam_device(text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.gs_exam_device(text,text,text,text,text,text,text,jsonb) to anon,authenticated;
