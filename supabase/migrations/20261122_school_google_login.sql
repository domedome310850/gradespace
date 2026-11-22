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
