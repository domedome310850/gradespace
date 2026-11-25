# SQL checks (local Postgres, no Supabase needed)

`verified-signin.*` exercise `supabase/migrations/20261126_verified_email_signin.sql` against a stand-in
`auth` schema (`auth.users`, `auth.uid()` from `test.uid`).

```
createdb t
psql -d t -f tests/sql/verified-signin.setup.sql
psql -d t -v ON_ERROR_STOP=1 -f supabase/migrations/20261126_verified_email_signin.sql
psql -d t -At -f tests/sql/verified-signin.test.sql
```
Expected: t1 = 1; t2, t3 permission denied; t4 = 1; t6 = `4|2|t` (section kept, v 2, verified);
t7 = 1 backup; t8 = 0; t9 "verified account"; t10 = 1; t11 ok; t12, t13 "not signed in".
