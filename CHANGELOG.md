## 2026-11-22 — ChatGPT: Personal exam schedule in the existing overview

- `public/index.html`: remove the oversized separate exam-room form. Student ID is only entered on the email-entry screen; missing-ID and account edit actions open that same screen without losing saved grades. Overview is the default route and first navigation item. Fetch device-scoped personal rooms into transient React context, keyed by entered account and courses/sections; keep grade state and score export unchanged. Personal final exam date/time/room supersede general schedule for display, course cards/details, and calendar export. Unmatched or ambiguous rooms are labeled; calendar shows all recorded exam dates independent of the six-item upcoming list. Place upcoming/calendar above course cards. Explicit shared track positions for course cards.
- `tests/smoke.mjs`: test two student IDs yield distinct dates/rooms in overview and selected calendar dates; confirm default route and navigation, absence of oversized form, and geometry of inner card elements at 1280px and 1800px. Inline JavaScript parsed; CI pending.

## 2026-11-22 — ChatGPT: Align course card content row by row

- `public/index.html`: remove the higher-specificity flex override that disabled subgrid. Share nine intrinsic row tracks across direct and drag-sort course cards: name, metadata, score bar, progress, warnings, forecast, goal, exam, and footer. Long titles and expanded forecasts remain readable, and mobile cards retain natural height.
- `tests/smoke.mjs`: vary course name lengths and check vertical alignment of each slot and card bottoms on My Courses and Dashboard. Initial CI passed mobile and all desktop tracks except the footer. Follow-up: stretch `.ccard-foot` across the shared row track and give its action buttons the same minimum height; keep the original geometry assertions unchanged. Inline JavaScript syntax checked; rerun browser CI.

## 2026-11-22 — ChatGPT: Make exam rooms immediately visible

- `public/index.html`: optional student ID at the email entry screen, saved via the existing device-scoped RPC before entering. No email verification. Existing users see the exam-room panel above the content on the default My Courses page and Dashboard; Settings retains access. No changes to grade storage or database schema.
- `tests/smoke.mjs`: exercise email + ID entry and confirm the ID field is visible in the first viewport; retain existing lookup and layout coverage. Inline JavaScript syntax checked; browser CI pending.

## 2026-11-22 — ChatGPT: Remove exam-room email verification

- Owner requested no email verification. Dashboard and Settings now accept a student ID immediately after the existing email-only login. Supabase stores the ID under that email and a random browser-specific secret; email alone cannot retrieve another browser's student ID. New browsers require entering the ID again. The grade store is unchanged.
- `gs_exam_device` supports get/save/remove/lookup; private ranges and profiles are not directly readable by browser roles. SQL tests under the anonymous role passed save/reload/match/remove and isolation between two device secrets. Updated browser smoke test; production deployment and browser test results not yet verified.

## 2026-11-22 — ChatGPT: Connect personal exam rooms to the website

- `public/index.html`: bilingual My exam rooms panel in Dashboard and Settings, isolated verified-email Supabase client, private student ID save/remove, and automatic course/section matching for semester 1/2569. Legacy email-only grade entry and saved grade data are unchanged. The ID is not included in the grade JSON or score sheet.
- `tests/smoke.mjs`: mock a verified email and exam-room response, assert saved profile and RPC payload in both languages and viewport widths. `.github/workflows/gradespace-browser-smoke.yml`: PR smoke test workflow.
- All inline JavaScript parses; transactional live SQL checks passed profile isolation and correct course/section matches, with rollback. Browser smoke and actual email-delivery/redirect verification still pending; do not claim deployment until verified.

## 2026-11-22 — ChatGPT: Private exam room database

- Imported 310 room rules covering 110 courses and all 16 pages of the uploaded CBS final exam notice (2569, semester 1) directly into Supabase. Raw student-ID ranges remain private and are not committed to this public repository.
- Added per-authenticated-user `gs_exam_profiles` with RLS and `gs_exam_rooms_for_me` for matching student ID, course code and section. The original email-only grade tracker is unchanged; verified auth is required before the web UI can use these APIs.
- Verified import counts, ID/section match examples and role permissions. One malformed student-ID interval on page 3 (2601354) was omitted pending confirmation. No browser smoke test (no frontend changes).

# Changelog

Newest first. Each entry: date · who (which AI / person) · what changed · files.
Add yours at the top before you finish.

## 2026-11-22 · ChatGPT · Pause exam-room and experimental login features
- `public/index.html`: restore original email-only sign-in and guest mode and the original course exam-date flow. Remove individual exam-room page, student-ID/PDF handling, embedded room rules, private central-exam/admin UI, OAuth and OTP preview paths. Keep existing exam dates and calendar, and all unrelated card layout, course priority, type chips, color, timetable, GPA and grading improvements. No stored grade fields are deleted or renamed.
- `supabase/migrations/20261122_pause_school_login_exam_rooms.sql`, `supabase/schema.sql`: revoke anon/authenticated execution of all eight experimental exam and school RPCs; retain private tables and historical migration files. Original grade RPC permissions unchanged, all 12 existing grade accounts preserved. OAuth provider settings are not managed by this migration. No personal room data imported or published. Legacy email-only access is still not verified authentication.
- Validation: three inline scripts parsed; original sign-in and exam-date helpers exactly match the pre-feature source, course ordering and layout changes retained, experimental UI references absent. SQL verification: all eight experimental RPCs inaccessible to anon/authenticated; original load/save available. Full Playwright/browser regression remains pending.

## 2026-11-22 · ChatGPT · Resolve PR #5 conflict and stage school sign-in safely
- Preserve the final course ordering and course type labels from merged PR #4. Keep existing production entry and existing grade RPCs until verified sign-in is tested. New school authentication is available on the named preview host or in an explicitly opted-in tab (`?school_preview=1`); `?school_preview=0` returns to the existing entry. OAuth callback and session restoration retain the selected preview mode. Verified mode never accepts the legacy email-only login, uses the new authenticated RPCs, and keeps its local state separate from legacy accounts.
- All three inline JS scripts parsed. Six staged routing cases and exact equality of the course ordering helper with main passed. Full browser and real Google provider sign-in tests remain pending. Merging this staged code does not activate the university-only requirement site-wide or fix the pre-existing legacy grade RPC access risk. Cutover still requires successful real sign-in, data migration planning, and revocation of legacy RPC permissions.

## 2026-11-22 · ChatGPT · University email login from entry (staged)
- `public/index.html`: replace email-only login and secondary exam OTP with one Google Workspace OAuth session, PKCE callback and server admission check. Student account requires a verified 10-digit `@student.chula.ac.th` address with a trusted Chula hosted-domain claim; single designated administrator exception. Student ID is bound by the server from the verified email. No typed-email login or automatic guest-state import. New grade RPCs derive email from authenticated identity; per-user local cache key uses Auth ID. Exam lookup shares the authenticated session.
- Applied `supabase/migrations/20261122_school_google_login.sql` to live GradeSpace: private singleton owner email configured separately, automatic admin activation only after verified OAuth, student binding, and own-account load/save. All 12 existing grade rows preserved. No raw identifiers or owner email committed. Anonymous execution denied and authenticated role without verified identity rejected for all new RPCs. Three inline JS scripts syntax checked; real OAuth, browser tests and positive account tests pending.
- Old `gs_load`/`gs_save` remain available for production compatibility until coordinated cutover; they are a known security risk and MUST have public/anon/authenticated execute revoked when the verified UI is deployed and tested. Do not describe production as secure yet. Existing personal-email accounts need a verified transfer plan; do not copy by typed email. PDF import and publication still pending. PR #5 remains draft.

## 2026-11-22 · ChatGPT · Google sign-in alternative for private exam verification
- `public/index.html`: add Google OAuth with PKCE, explicit callback exchange, verified Google email match to the current GradeSpace account, and memory-only access/refresh tokens. Only temporary PKCE verifier and expected account persist in sessionStorage during redirect. Email OTP remains optional.
- Gmail SMTP repeatedly returned 535 and 504; Google provider setup is pending in Google Cloud and Supabase. Add the exact app origin and the callback redirect URL (`/?exam_oauth=1`) to their respective allowlists. Supabase callback: `https://jecdbhfnuudmngpqmrrq.supabase.co/auth/v1/callback`. Never commit OAuth secrets.
- Three inline JS scripts syntax parsed. Real OAuth, browser and admin authorization tests pending. No existing grade login, data, or database policy changes. PR #5 stays draft.

## 2026-11-22 · ChatGPT · Private exam migration applied
- Applied private exam migration to GradeSpace Supabase; verified RLS on all three private tables, no direct anon/authenticated SELECT, and no anonymous EXECUTE on five new RPCs. Authenticated RPCs have explicit identity/role checks; full end-to-end tests pending.
- Updated schema reference. Admin Auth user does not yet exist; OTP setup/verification, singleton bootstrap, notice import and role-based integration tests remain pending. No changes to legacy grade RPCs or saved grades. Existing anonymous grade RPCs remain a separate security issue.

## 2026-11-22 · ChatGPT · Private central exam database (deployment pending)
- Added `supabase/migrations/20261122_private_exam_notices.sql`: private schema, exactly one administrator slot tied to a confirmed Supabase Auth user ID and verified email, unique admin-approved student identity bindings, versioned notice publishing, and own-ID-only lookup RPCs. Anonymous callers and authenticated users cannot read the private tables. All admin RPCs independently check administrator identity.
- `public/index.html`: OTP verification isolated from legacy grades login; conditional admin page, PDF extraction and row/range review, publication history, identity approval/revocation, central results shared via the exam lookup helper. Verified session and central lookup results stay in memory; no other student's ID rules are returned to students.
- Not applied to Supabase: connector authorization, Auth email-OTP configuration, singleton admin bootstrap, actual notice import/review and SQL access-control tests remain pending. The supplied PDF is not committed to GitHub. Full central coverage and automatic official notice discovery are not enabled yet. Existing grades login is still legacy email-only.
- Validation: all inline JS parsed; synthetic admin parser tests confirmed multi-range extraction and no full ranges retained in personal import. Browser/PDF and SQL integration tests still required.

## 2026-11-22 · ChatGPT · Revised course priority and type labels
- `public/index.html`: per-semester automatic priority is relative grading (all score states), required criterion courses with actual scores/recorded grades, criterion courses without actual scores, non-GenEd S/U, GenEd, then other courses (including scored criterion electives and unknown grading methods). GenEd and S/U take category precedence. Stable within groups. Actual zero counts; predictions do not. Manual override and reset retained.
- Show compact Required / Elective / GenEd badges on all course cards and details in Thai and English. Updated GenEd ordering hint.
- Validation: all three inline scripts parsed; isolated tests passed for all six priorities, score transition, zero and predicted scores, manual override and reset. Browser layout testing pending.

## 2026-11-22 · ChatGPT · Automatic exam rounds and aligned cards
- `public/index.html`: save a visible, editable 10-digit student ID locally; optional hide/show; default exam session to automatic using Bangkok date and the official Chula semester calendar for 2569, with manual override. For other terms use recorded exam dates or ask the user to select the session.
- Include section-wide room assignments from the supplied CBS final notice, without publishing student ID ranges or individual identifiers. Where rooms depend on a student-number range, local PDF import remains available. Central official PDF source is not configured: no verified accessible source URL was found; no complete automatic individual lookup is claimed. A verified source or an authenticated private backend is needed for that feature.
- Dashboard upcoming and calendar use the same resolved exam record as course cards; dates from known exam schedules supersede stale assessment dates. Show time and venue or explicit unknown status, and prevent duplicate exam entries. Course cards stretch to the tallest card in their own row with aligned bottom actions.
- Validation: three inline JS scripts syntax-checked; isolated round-switching and dashboard exam de-duplication/date/venue checks passed. Browser/Playwright tests pending; verify the supplied PDF import and responsive layout before merging.

## 2026-11-22 · ChatGPT · Course UI, unique course colors, timetable and personal exam rooms
- `public/index.html`: compact withdrawn/completed course cards; inset dropdown chevrons; shorter grade labels; visible pencil edit action; viewport-clamped, portal-based tooltips; aligned course header; GPA contributing course/credit coverage.
- Unique colors across saved course enrollments (including previous years/terms), with a custom hex color picker and duplicate validation. Existing duplicate colors are reassigned on normalization; no scores or grade records are altered.
- Timetable: normalize numeric Sec labels; distinguish missing section from missing matching data; preserve simultaneous distinct class components/rooms; show Sec and course color. Owner's actual personal timetable remains unverified pending comparison with Reg Chula's personal schedule.
- Exam dates remain sourced from existing Reg/shared sources; shared room values are not assumed to be personal assignments. Personal room editor stores explicitly entered rooms within the existing `exams` field, scoped to course/term/Sec/date; unknown rooms are labeled unconfirmed. Do not use real student data on a preview because the frontend still points to live Supabase.
- Suppress impossible predicted totals above 100% (except explicit bonus items) and surface invalid weight/max-score warnings without changing saved scores.
- Validation: all 3 inline JS scripts syntax-parsed; isolated JS checks passed for 100 unique course colors, normal/invalid predicted totals, timetable missing Sec/data and simultaneous class components, and personal room isolation. Playwright not run: execution environment cannot resolve GitHub/npm network; preview and browser smoke test still required before merge.

## 2026-11-22 · Owner · Cloudflare Auto Deploy test
- Test GitHub integration without changing website functionality.

## 2026-11-22 · Claude (claude.ai) · Repository set up for multi-AI work
- Moved the project into this repository: `public/index.html`, edge functions, `supabase/schema.sql`
  (exported from the live database), smoke test, `AGENTS.md` handoff rules.

## 2026-11-22 · Claude (claude.ai) · Grading editor, grade-only finals, calendar colours
- "แก้" next to the grading badge opens a grading editor: letter grades (criterion / norm / not sure)
  with editable cut-offs, or S/U with the pass mark. The student's choice beats shared syllabus data
  (`gradingUser`).
- After the final exam date: prompt to record the official grade without a final score; missing scores
  show "ไม่ประกาศคะแนน"; the implied score range is shown from the grade.
- Exam calendar: course colours, today highlighted, "Today" button, all upcoming exams (not just 6).
- Adding next term's courses no longer switches the dashboard away from a term that is still running.
- Full names from Reg replace short plan names ("Intmd Acctg" → "Intermediate Accounting").
- Business Foundation: 3 credits (S/U) in the catalog.

## 2026-11-22 · Claude · Study plans, majors, GenEd picker, S/U fix
- Study plan: programme + major per year (switching majors supported); "add next term with its required
  courses" on the dashboard and the Years page; 4-year overview.
- GenEd picker: list from gened.chula.ac.th (`gened-sync`, daily) + open/closed, sections, times and finals
  from Reg; filters by group, open this term, no clash with own classes.
- S/U courses always count as pass-mark grading (never norm-referenced).

## 2026-11-21 · Claude · Cleaner layout, consistent names
- Compact course cards, dashboard header, course page (phone and desktop); reference panels folded.
- ALL-CAPS course names shown in Title Case; Sec shown beside the code instead of in the name.

## 2026-11-20 · Claude · Scanner accuracy, MCV paste, calendar export, timetable
- Screenshot scan: full resolution, tall images cut into overlapping parts, known assessments sent as hints,
  automatic second look at suspicious numbers, editable review table; falls back to other models when busy.
- "Paste from MCV" (score table from MyCourseVille Portfolio).
- Type 39/55 in score boxes; needed final score in raw points; .ics calendar export; weekly timetable with
  class/exam clash warnings (from Reg).
- Reg Chula sync (`reg-sync`), daily backups and field-keeping merge in `gs_save`.

## Earlier (Nov 2026) · Claude and another AI
- Core app: courses, weighted assessments, like-for-like estimates, GPA, simulator, GenEd credits,
  drag-to-reorder, course search, plan picker, shared Google Sheets catalog, dark mode, TH/EN.
