## 2026-11-26 — ChatGPT: TBS semester plans and schedule/assessment references

- `public/index.html`: 12 source-scoped semester plans, 395 conservative schedule references, two additional historical TBS syllabi; no automatic application to grades, calendars or saved data. Distinguish curriculum code pairs, section/group, tentative and final notice.
- `tests/tu-catalog.mjs` and `docs/tu-public-data.md`: source scope and integrity checks. Visual review incomplete, CI pending.

## 2026-11-26 — ChatGPT: TBS Thai prerequisite references and required internships

- `public/index.html`: recover 3 internship course rows, 210 source-scoped Thai-program prerequisites, flag mismatched credits. All captured required/core codes have metadata. No automatic rules or student data changes.
- `tests/tu-catalog.mjs` and `docs/tu-public-data.md`: updated integrity checks and source scope.

## 2026-11-26 — ChatGPT: TBS Thai bilingual course catalog

- `public/index.html`: 294 Thai 2566 course records from official degree curriculum documents; 96 additional distinct codes, Thai code lookup and Thai/BBA picker selector, source references. Preserve existing data and credits. No automated grading or schedules.
- `tests/tu-catalog.mjs`, `docs/tu-public-data.md`: catalog checks, provenance and known gaps. Visual source verification/CI pending.

## 2026-11-26 — ChatGPT: prioritize TBS Thai curriculum and assessment sources

- `public/index.html`: Thai 2566 degree-audit reference for all eight majors, including track choices, GenEd alternatives and official source links; RB211 historical grading weights only (no fabricated cutoffs). No graduation claims or student state changes.
- `tests/tu-catalog.mjs`: verify credit sums, track counts and absent cutoffs; `docs/tu-public-data.md`: source scope. Browser tests and full visual verification pending.

## 2026-11-26 — ChatGPT: expand TU public academic catalog and syllabus references

- `public/index.html`: 229 GenEd 2566 rows and 208 BBA 2023 rows from official TU sources; 429 unique catalog codes including three social-administration syllabi. Expand picker prefixes, deduplicate GenEd overlap, expose prerequisites and section/term-scoped syllabus score weights and grade floors as reference only. No automatic grading or student data changes. Note 2570 curriculum is different.
- `docs/tu-public-data.md`: provenance, limitations, and next steps. `tests/tu-catalog.mjs` and `tests/package.json`: catalog integrity tests. Full visual PDF verification, CI, Reg TU sync, and deployment pending.

## 2026-11-26 — Claude (claude.ai): bring back a university space that was put aside by mistake

- `public/index.html`: one account was found with the Chula label active, an empty current space, and all its Chula data (14 courses, 47 items, years, terms) stored under `settings.spaces.cu` (put aside when switching to Thammasat, then only the label went back). Nothing was lost. `Store.normalize` now runs `healSpace`: if the active university's stored space holds data and the current space is empty, it is brought back (nothing merged or deleted). `switchSpace` never puts an empty space over a stored one with data, and if both hold data the older one is kept as `spaces['<uni>-<savedAt>']`. `window.GradeSpace` exposes `Store` and `switchSpace` for tests.
- `tests/smoke.mjs`: a stored Chula space comes back on load; switching from an empty space keeps the stored one.

## 2026-11-26 — Claude (claude.ai): what-if grades, phone one-row layouts, plain AI menu, Thammasat picker

- `public/index.html`:
  - **What-if grades** (`WhatIfCard` on the GPA page; link “ลองสมมติเกรด” on the overview; command menu): pick a letter for each in-progress course this term and see term GPA and GPAX at once; “I want 2.50” (term or GPAX) suggests up to four grade sets (`whatIfSolve`: same grade everywhere, fewest changes from now, high-credit first, all-in on a few), never above what a course can still reach under its cut-offs. S/U courses don’t count. Nothing is saved.
  - **Phone layouts:** overview term picker + Add course + Quick score on one row (`.dash-bar`), facts line shortened to one row, next-term actions scroll in one row; Courses page buttons on one row (Add / By major / scan icon) and term filter + search on one row; GPA tiles: GPAX full width then 2×2. Removed the rectangle around the centre AI button.
  - **AI menu** (`AiHubModal`) redone as a plain list like Settings: Ask ChatGPT/Claude (copy-paste), @GradeSpace in ChatGPT and Claude (coming soon), then scan / paste / quick score.
  - **Thammasat:** in a TU space the Chula major/year plan windows (`plan`, `studyplan`) are replaced by `TuPlanModal` (GenEd groups 1–5 and TBS subject groups; tick and add to a term). The sign-in screen’s university choice now only applies when the student actually picks it, and it switches to that university’s space after the account loads (same email, separate spaces) — fixes landing in the Chula space after choosing Thammasat.
- `tests/smoke.mjs`: what-if (best vs worst grades, a suggested set reaches 2.50, saved grades unchanged); TU “By major” opens the TU picker and adds AC201.
- Not yet: year-by-year study plans for Thammasat majors.

## 2026-11-26 — Claude (claude.ai): ask your own AI by copy-paste (free plans)

- `public/index.html`: most students use free ChatGPT, which can’t add custom connectors, so until GradeSpace is in ChatGPT’s directory there is a copy-paste bridge (`AskAiModal`, modal `askAi`; card in the AI hub and a command-menu item). Step 1 copies this term’s courses/items/scores as JSON plus rules (score null ≠ 0, never invent; answer new scores in a ```gradespace-scores block) and opens ChatGPT or Claude; no email or student ID is included. Step 2 parses the pasted answer (`parseAskAi`), matches only existing courses/items, shows each row to approve (unknown course/item or impossible score is skipped), and saves with undo. TH/EN.
- `tests/smoke.mjs`: copied text has course data and no email/student ID; a pasted answer with one real and one invented item saves only the real one and creates nothing.

## 2026-11-26 — Claude (claude.ai): GradeSpace as the bridge to your own AI (no built-in chat)

- `public/index.html`: owner decided GradeSpace should not have its own AI; it connects the student’s own ChatGPT/Claude to their grades. Removed the local chat (`ChatBrain`, `ChatModal`). The AI button (centre of the phone bar, floating button on desktop) now opens `AiHubModal` (“AI ของคุณ”): first the ChatGPT (`@GradeSpace`) / Claude connector card (coming soon, explains the bridge and that every change is approved in GradeSpace), then the in-site tools (screenshot scan, paste, quick score). First-visit bubble reworded. TH/EN.
- `tests/smoke.mjs`: AI hub shows the connect card with ChatGPT and Claude, no chat box, and 3 tools.
- Next (needs owner steps): secure sign-in live (PR #25 checklist) → Supabase OAuth 2.1 server + consent page → MCP server for ChatGPT/Claude. Using the student’s ChatGPT plan *inside* GradeSpace (“Sign in with ChatGPT” plan usage) needs OpenAI partner approval; fallback would be the student’s own API key.

## 2026-11-26 — Claude (claude.ai): one space per university

- `public/index.html`: choosing a university now switches to that university’s own space. `switchSpace` / `applyUni` move the current `years`, `semesters`, `courses`, `categories`, `assessments` (and `currentSemesterId`, `studyPlan`, `genEdRequired`, `plannedCredits`, `targetCGPA`) into `settings.spaces[<old>]` and bring back `settings.spaces[<new>]` or an empty space. Kept inside `settings` because every copy of the site (`normalize`) and `gs_save` keep unknown settings keys; nothing is deleted. Switching with courses asks first (“your N courses are kept aside, not deleted”). A university picked on the sign-in screen applies quietly. TH/EN.
- `tests/smoke.mjs`: TU sign-in starts an empty TU space with the Chula courses kept aside; switch TU → CU → TU restores each space exactly, with no course leaking between them.

## 2026-11-26 — Claude (claude.ai): secure sign-in step 1 (one-time email code), switched off

- `supabase/migrations/20261126_verified_email_signin.sql` (**not applied**): adds `gradespace_by_email.verified_at`; `gs_me_load` / `gs_me_save` for signed-in Supabase Auth users (email taken from the confirmed session, `authenticated` only); `gs_save_core` shares the existing save logic (daily backup, course keep-list); `gs_load` / `gs_save` refuse rows already verified. No data copied, renamed or removed; rollback block included. Checked on local Postgres 16 with `tests/sql/verified-signin.*` (anon/unconfirmed/no-session refused, keep-list and backup kept, email-only blocked only for verified rows).
- `public/index.html`: `GS_WEB.otp` switch (default **false**, so the live site is unchanged). When on: sign-in sends a code and verifies it (`signInWithOtp` / `verifyOtp`), session persists, a remembered email only pre-fills the form, storage uses `gs_me_*` (`makeEmailStore(…, verified)`), sign-out also ends the Supabase session. Resend after 60 s, change-email link, numeric code field with one-time-code autofill. TH/EN.
- `tests/smoke.mjs`: OTP run (390/1280): remembered email doesn’t open the account, wrong code rejected, right code opens it via `gs_me_load` only, session survives reload. All earlier runs unchanged.
- `docs/secure-signin.md`: how it works + owner checklist (custom SMTP, email template with `{{ .Token }}`, apply migration, flip `otp`).

## 2026-11-26 — Claude (claude.ai): AI chat in the centre of the bottom bar; Help + Feedback merged

- `public/index.html`: new `ChatModal` (modal `chat`) with a local engine `ChatBrain`: answers GPA, “what do I need for an A in X” (uses `Calc.requiredExamAverage`/`requiredAverage`, refuses when no cut-offs), upcoming exams, work due in 14 days, and records typed scores (“HW5 econ 4/5”) only after a confirm card (saved with undo). It never creates courses or assessments; unmatched names get a pick list. Runs on the student’s data in the browser; nothing is sent to an AI service. Quick actions (scan, paste, quick score) sit at the top of the chat. Phones: raised AI button in the middle of the bottom bar (Overview · Courses · **AI** · GPA · You); Simulator moved under You; the floating button is desktop-only and the first-visit bubble points at the centre button on phones. Help and Feedback are one page with two tabs (`HelpHub`, `#help` / `#feedback`). New icon `send`. TH/EN.
- `tests/smoke.mjs`: 5 bottom-bar items incl. centre AI; chat GPA answer, confirmed score save, refuses to invent “Quiz 99”, need-for-grade answer; desktop FAB only. Local: planning 40; smoke CU 6 runs + TU 4 runs pass.
- AI sheet now opens with a “Use GradeSpace from ChatGPT or Claude — coming soon” card (owner asked for it first); GradeSpace’s own chat sits below. Owner decided (2026-11-26) the real connector waits for secure sign-in (OAuth), so the card explains that and has no working button yet.
- Not done: free-form LLM answers. Needs a new edge function that would send a student’s grades to Gemini/Claude — waiting for the owner’s decision.

## 2026-11-26 — Claude (claude.ai): Thammasat grading rules + database check

- `public/index.html`: checked against Thammasat’s undergraduate regulation 2568 (db.legal.tu.ac.th/05010201-01). Letter points A–F already matched. Added for TU: result letters ACC / EXE / AUD (no GPA; ACC earns credits; added to `outcomes` only when a student switches to Thammasat, never removed); “Thammasat rules check” card on the GPA page (`TuRulesCard`: standing at GPAX 2.00 / 1.50, honours 3.50 with no grade below C / 3.25, F/U or repeated course blocks honours, term load above 22 credits or 6 in summer). GPA display now rounds half-up at the 3rd decimal (ข้อ 48; also fixes float cases like 1.005 → 1.01) for every university. TU wording overrides via `key@tu` in I18N (no MyCourseVille mentions for TU). TH/EN.
- Database (read-only check, nothing changed): 12 saved students, all Chula course codes, none with `settings.institution`; outcomes in use I/S/U/W; live `gs_save` keep-list matches `supabase/schema.sql`. `reg_offerings` / `gened_courses` are Chula-only and are not queried in TU mode. No migration needed: `institution` lives in the settings JSON, which `normalize` and `gs_save` keep as is.
- `tests/smoke.mjs`: TU rules card, TU outcomes present, half-up rounding.

## 2026-11-26 — Claude (claude.ai): Thammasat University support

- `public/index.html`: new optional `settings.institution` (`'cu'` | `'tu'`; empty = Chula, so existing students see no change). University picker on the sign-in screen (Chula student-ID field only for Chula), in Settings → profile and on the You page (`UniPicker`, `setUni`, `uniOf`, `isCU`). For Thammasat: course search/autocomplete uses a TU catalog (TU GenEd 2566, 52 courses in 5 groups, plus 21 TBS BBA 2023 courses from PR #19); “Choose GenEd” opens a TU GenEd picker (`TuGenEdModal`, modal `tuGened`); Reg Chula sync, Chula GenEd, CBS study plans and exam-room lookups are off (no `gs_reg_*` / `gs_exam_device` calls); the assistant’s paste item is relabelled generically; a note explains TU exam dates are entered on Midterm/Final items; red/gold accent with contrast correction (helpers adapted from PR #18). Grade scale unchanged — TU’s A–F points match (ข้อบังคับ มธ. ว่าด้วยการศึกษาระดับปริญญาตรี 2568). TH/EN strings. No database or backend change.
- `tests/smoke.mjs`: TU run (TH/EN × 390/1280): sign-in without student ID, institution saved, theme applied, no Chula RPCs, no study-plan card, TU GenEd list ≥ 50, add TU101 as 3-credit GenEd, TU catalog search. Local run: planning 40 passed; CU smoke unchanged and TU smoke pass, no errors or overflow.
- Not done: automatic TU class/exam schedule sync (see AGENTS Open work); TU faculty study plans.

## 2026-11-26 — Claude (claude.ai): YouTube-style navigation

- `public/index.html`: phone bottom bar cut from 7 tabs to 5 (Overview, Courses, Simulator, GPA, You). New “You/ฉัน” page (`#me`, `MePage`) holds the account card, language and theme switches and links to Years & semesters, Feedback, Help and Settings; the tab stays highlighted on those pages. Desktop sidebar grouped into main / Tools / More with labels. Search moved back to the top bar on every page (wide pill on desktop, icon on phones) instead of only beside the semester picker; the avatar menu stays on desktop and is replaced by the You tab on phones. New icons `globe`, `chevronRight`. TH/EN strings. No data or backend changes.
- `tests/smoke.mjs`: 5-tab bottom bar, You page (language switch, links), sidebar groups, top-bar search; `#me` added to the page sweep. Local run: planning 40 passed; smoke TH/EN × 390/1280/1800 px, 16 pages, no errors or overflow.

## 2026-11-25 — Claude (claude.ai): declutter top bar, floating AI button, search beside semester

- `public/index.html`: top bar now holds only the logo (phones) and an account menu; language, theme, save status and Settings moved into that menu (status shown as a dot on the avatar). Logo no longer renders black on phones (each logo SVG gets its own gradient id; the hidden sidebar copy broke the shared one). AI assistant moved from the top bar to a floating button bottom-right (✕ hides it for the session) with a one-time intro bubble (`gradespace.aifab.intro`). Search moved next to “Viewing semester” on the overview (Ctrl/⌘K still works) and matches Thai and English labels. Removed the “what’s new” card and the overview Scan button (both duplicated the assistant). New sparkle icon. TH/EN strings. No data, backend or login changes.
- `tests/smoke.mjs`: account menu (open, switch language, Escape), unique logo gradients, intro bubble → assistant, search button and bilingual search. Local run: planning 40 passed; smoke TH/EN × 390/1280/1800 px, no errors or overflow.

## 2026-11-25 — Claude (claude.ai): AI assistant button, Ctrl/⌘K search, “what’s new” card

- `public/index.html`: topbar gets a search box (Ctrl+K / ⌘K) and a “ผู้ช่วย AI / AI assistant” button (icon-only under 900px). New modals `assistant` (one place for screenshot scan, paste from MCV, quick score — reuses the existing `scan`/`paste`/`quick` flows; voice/chat marked “coming soon”) and `cmd` (search pages, actions and courses, arrow keys + Enter). Dismissible “what’s new” card on the overview (localStorage `gradespace.whatsnew` = `2026-11-ai-cmdk`). New icons `search`, `spark`; CSS before `.thumb-badge`; all strings in TH and EN. No data, backend or login changes. GPA term/GPAX tiles were already side by side, so unchanged.
- `tests/smoke.mjs`: checks the card, the assistant popup (3 actions, Escape closes), Ctrl+K → course jump, and dismissing the card. Local run: planning 40 passed; smoke TH/EN × 390/1280/1800 px, 15 pages each, no errors or overflow.

## 2026-11-25 — Claude (claude.ai): GradeSpace Connect plan (docs only)

- `docs/grade-space-connect-roadmap.md`: feasibility of ChatGPT Apps SDK / Claude connectors / MCP Apps (checked against official docs 2026-11-25), PRD, journey, architecture, security, cost comparison, CONNECT-01…18 roadmap, submission checklist, testing strategy, open questions (Claude Free-plan connector access and directory eligibility conflict between official pages).
- `docs/integrations/universal-import-schema.json`: Universal Import JSON Schema v1 draft (null ≠ 0, stated-only weights, total-row flag, source refs); example and negative cases validated with Ajv 2020.
- `docs/integrations/mcp-tools.md`: Read / Calculate / Prepare / Confirm tool spec and MCP Apps UI resources.
- `docs/prototype/gradespace-v2-prototype.html`: standalone clickable prototype (20 screens, CU/CBS/TU themes, TH/EN, light/dark, simulated voice flow, bulk review, Connected AI). Built on the production stylesheet from `public/index.html` (ee506bb) and the original 8-item menu; new features live in buttons/popups, a ⌘K command menu and a dismissible “what’s new” card. Sample data only. Playwright: 20 routes × TH/EN × light/dark × 360/1280 px, no errors or overflow.
- Status Planned / Deferred Implementation. No runtime, database, deployment or authentication changes.

## 2026-11-24 — ChatGPT: Overview action hub redesign

- `public/index.html`: unify planning modules into one actionable hub with an emphasized first recommendation, colored day counters and concise target/exam score explanations. Keep top three by default, explicit completed-course summary and smaller GPA/alerts tiles; remove duplicated export action (calendar retains export). Differentiate exam urgency by time and score pressure; hide finished/fully graded courses from study recommendations. Thai and English.
- `tests/smoke.mjs`, `.github/workflows/gradespace-browser-smoke.yml`: retain 180px mini-card size limit; test completed ungraded exam and generate viewport screenshots for visual review. Prior PR #14 failed compactness at 390px; new CI pending. No user account data changed.

## 2026-11-24 — ChatGPT: Compact overview and exam completion flow

- `public/index.html`: replace full-width planning sections with a responsive recommendation card plus two compact GPA/reminder cards, above the detailed calendar. Semantic status colors, concise reasons, three recommendations by default, expanded view on demand, and completed finals summarized rather than ranked. GPA planner link and full reminder count. Preserve calendar history.
- Exam completion uses Bangkok dates and same-day end times, recorded scores, or independent user-controlled per-exam flags. Mark/undo from Course Detail; suppress completed exam reminders, study recommendations and upcoming ICS exports without changing assessment scores or grades. Reset manual flags when section changes. No hard-coded student/course state or login/community changes.
- `tests/planning.mjs`: 8 additional exam completion checks; all 40 planning checks executed in an isolated JS harness. `tests/smoke.mjs`: compact layout, mark/undo, calendar history, score preservation across languages and viewports; GitHub CI pending.

## 2026-11-24 — ChatGPT: Academic planning release candidate

- `docs/academic-planning-roadmap.md`: implementation, UI and acceptance plan; login and community explicitly excluded.
- `public/index.html`, `public/planning-core.js`: study priority, class score comparison, GPA bounds and reverse planner, advanced grading policies (component minimum/cap, drop-lowest for equally weighted categories, bonus, retake and rounding), scanner confirmation, local reminders and MCV paste handling. Relative grades and simulated results remain hypothetical.
- `public/manifest.webmanifest`, `public/sw.js`, `public/app-icon.svg`: installable static shell; private RPC and scan responses are not cached.
- `supabase/functions/gs-scan/index.ts`: extraction/validation of explicitly stated grading rules; production deployment not performed.
- `tests/planning.mjs`, `tests/smoke.mjs`: pure calculation and browser regression coverage. CI run 45384873158 passed at commit 082c215; added interactive tests for grade floors, class comparison, advanced policy, GPA inputs and denied/unsupported notification permission in commit 1aba3db. Verify latest CI before merging.
- Release blockers: actual device PWA install/offline and calendar reminders, live scan verification, authorized MCV API credentials, and server preservation of new optional fields when legacy clients save. No production deploy or login/community modifications.

## 2026-11-24 — ChatGPT: Confirmed minimum grades for relative grading

- `public/index.html`: optional instructor-confirmed lower bounds in the grading modal, separate from estimated scales; show reached and remaining thresholds in course cards, details and simulator without treating them as exact grades or GPA. Clear bounds on section changes. Thai/English support. Browser smoke pending; AI scan and older-client server preservation not yet implemented.

## 2026-11-22 — ChatGPT: Compact overview summary

- `public/index.html`: combine semester GPA, cumulative GPA and next-term plan into one responsive desktop row with smaller metric typography and padding. Keep GPA coverage and estimation status, study-plan editing, major selection, GenEd and full-plan access. On mobile the GPA tiles remain side by side with the plan below. Full Years-page plan remains unchanged. No data or computation changes.
- `tests/smoke.mjs`: assert three tiles share a compact desktop row and the plan wraps below the GPA tiles on mobile. Inline JavaScript syntax checked; browser CI pending.

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
