create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
grant usage on schema auth to anon, authenticated;
create table public.gradespace_by_email (email text primary key, data jsonb not null, client_updated_at bigint not null default 0, updated_at timestamptz not null default now());
create table public.gradespace_backups (email text not null, day date not null, data jsonb not null, saved_at timestamptz not null default now(), primary key (email, day));
alter table public.gradespace_by_email enable row level security; alter table public.gradespace_backups enable row level security;
-- live versions before migration
create or replace function public.gs_load(p_email text) returns table(data jsonb, client_updated_at bigint) language sql stable security definer set search_path to '' as $$ select g.data, g.client_updated_at from public.gradespace_by_email g where g.email = lower(trim(p_email)); $$;
create or replace function public.gs_save(p_email text, p_data jsonb, p_updated bigint) returns void language plpgsql security definer set search_path to '' as $$ begin insert into public.gradespace_by_email(email,data,client_updated_at) values (lower(trim(p_email)),p_data,p_updated) on conflict (email) do update set data=excluded.data; end $$;
grant execute on function public.gs_load(text), public.gs_save(text,jsonb,bigint) to anon, authenticated;
insert into public.gradespace_by_email values ('a@x.com','{"courses":[{"id":"c1","section":"4","exams":{"x":1}}],"v":1}',1), ('b@x.com','{"courses":[],"v":1}',1);
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@x.com',now(),false), ('22222222-2222-2222-2222-222222222222','c@x.com',null,false);
