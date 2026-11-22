# Private central exam database — setup and review

This branch is not a production migration. Do not publish student ID ranges in the public repo. The supplied PDF lives outside GitHub. The legacy GradeSpace grade tracker still uses email-only access; the exam subsystem uses a separate Supabase Auth OTP session. This does not fix the legacy grade-data authorization problem.

## Deployment sequence
1. Merge the prerequisite UI branch (PR #4), review this stacked PR, and retarget it to main. Apply the migration in the intended Supabase project after testing on a non-production database; update the schema reference only after it is applied.
2. Enable email OTP in Supabase Auth, configure a suitable SMTP provider and the email template with the OTP Token variable. The admin signs in with their usual GradeSpace email, opens Exam rooms, and verifies that mailbox with OTP. No administrator menu appears until private bootstrap.
3. The project database owner checks the specified administrator's confirmed Auth user record and inserts the single admin record into gs_exam_private.admin. Use the exact owner-designated verified email, not an email supplied by a browser or guessed from a grade profile. Do not commit that address or personal roster to GitHub. Example for SQL editor, replace the local placeholder privately:
```sql
insert into gs_exam_private.admin (singleton,user_id,email)
select true,id,lower(email) from auth.users
where lower(email) = '<owner-designated verified email>'
  and email_confirmed_at is not null;
```
Confirm exactly one row exists and the correct Auth ID. The singleton check and primary key prevent a second admin. No public RPC can change this table.
4. Reverify the administrator email, open Exam database admin, choose year/term/round/faculty, and load the official notice. Compare extracted rows and ranges against every PDF page; correct incomplete rows, ambiguous sessions or section splits before ticking the review checkbox and publishing. Review failures must not be silently accepted. Publication replaces one faculty/scope atomically but keeps prior versions for history. Never use production student records in a public preview. No raw roster is returned by normal lookup.
5. A student verifies email by OTP and the administrator confirms evidence of ownership of the stated student number before binding the verified Auth account. No self-claiming arbitrary student IDs. Link once; subsequent verified sessions retrieve their own matching rooms for enrolled courses. Unmatched/ambiguous items retain an unconfirmed state. Do not upload proof documents to GitHub.
6. Test with synthetic identities: anonymous should be denied all new public RPCs; an ordinary authenticated user cannot publish, bind, read history or select private tables; a confirmed student cannot supply another ID; a revoked link fails lookup; admin can publish and history shows the active version; duplicate student links fail. Verify the PDF format and date/round selection and compare every displayed room with the actual notice before production release.

## Source update
Official publication discovery is not configured in this branch. A verified reachable notice URL and permission to process the published document are prerequisites. Future scheduled ingestion must create a review draft, not automatically overwrite an approved notice with unverified extracted rules. New faculties may require different parsers. Until then the owner uploads an official PDF once per notice; end users need no upload when their authorized assignments are present.
