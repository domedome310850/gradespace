# Secure sign-in — step 1: one-time email code (2026-11-26)

Owner approved the plan: (1) verified email sign-in → (2) OAuth for outside AI → (3) ChatGPT/Claude connector.
This file covers step 1. **Nothing here is live until the owner does the checklist below.**

## How it works
- Students sign in with their email and a one-time code from Supabase Auth (`signInWithOtp` → `verifyOtp`).
- Data does **not move**. It stays in `gradespace_by_email`, keyed by email. Verified students use
  `gs_me_load` / `gs_me_save`, which read the email from the signed-in session (`auth.users`, confirmed only).
- The first verified load marks the row `verified_at`. From then on `gs_load` / `gs_save` (email-only) refuse
  that row, so typing someone's email no longer opens their grades.
- Rows that never signed in with a code keep working email-only (old cached pages keep working too) until the owner
  decides to switch email-only off for everyone.
- Guest mode (data in the browser only) is unchanged.
- The website keeps the old behaviour while `GS_WEB.otp` is `false` (in `public/index.html`).

## Owner checklist (in this order)
1. **Email sending:** Supabase's built-in email only delivers to the project team's own addresses and has a low
   hourly limit. Set up custom SMTP (e.g. Resend, Brevo, AWS SES) in Authentication → Emails → SMTP, then raise
   Authentication → Rate Limits as needed. Optional: CAPTCHA against bot sign-ups.
2. **Email template:** Authentication → Email Templates → *Magic Link*: include `{{ .Token }}` so the email carries a
   6-digit code, e.g. `รหัสเข้าสู่ GradeSpace: {{ .Token }}`. Keep it short, no marketing text.
3. **Database:** apply `supabase/migrations/20261126_verified_email_signin.sql`, then copy its functions into
   `supabase/schema.sql`. Local test: `tests/sql/README.md`. Rollback block at the bottom of the migration.
4. **Website:** set `otp: true` in `GS_WEB` (index.html) and merge. Everyone signs in once with a code; their data
   is already there.
5. Later decision: revoke `gs_load` / `gs_save` from `anon` to end email-only access for unverified rows too.
