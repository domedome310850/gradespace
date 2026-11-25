\set ON_ERROR_STOP 0
-- anon: email-only still works for unverified rows
set role anon;
select 't1 anon load a (before verify)', (select count(*) from public.gs_load('a@x.com'));
select 't2 anon cannot call gs_me_load'; select * from public.gs_me_load();
select 't3 anon cannot call gs_save_core'; select public.gs_save_core('a@x.com','{}',1);
reset role;
-- verified user a
set role authenticated; set test.uid = '11111111-1111-1111-1111-111111111111';
select 't4 me load a', (select data->>'v' from public.gs_me_load());
select 't5 me save a (drops section key -> kept by keep-list)'; select public.gs_me_save('{"courses":[{"id":"c1"}],"v":2}', 2);
reset role;
select 't6 row a', data->'courses'->0->>'section' as kept_section, data->>'v' as v, verified_at is not null as verified from public.gradespace_by_email where email='a@x.com';
select 't7 backup rows', count(*) from public.gradespace_backups;
set role anon;
select 't8 anon load a after verify (expect 0)', (select count(*) from public.gs_load('A@x.com '));
select 't9 anon save a after verify (expect error)'; select public.gs_save('a@x.com','{"courses":[],"v":9}',9);
select 't10 anon load b still works', (select count(*) from public.gs_load('b@x.com'));
select 't11 anon save new d works'; select public.gs_save('d@x.com','{"courses":[],"v":1}',1);
reset role;
-- unconfirmed email user c
set role authenticated; set test.uid = '22222222-2222-2222-2222-222222222222';
select 't12 unconfirmed c load (expect error)'; select * from public.gs_me_load();
set test.uid = '';
select 't13 no session (expect error)'; select * from public.gs_me_load();
reset role;
select 't14 final', email, data->>'v', verified_at is not null from public.gradespace_by_email order by email;
