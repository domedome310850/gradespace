# Changelog

Newest first. Each entry: date · who (which AI / person) · what changed · files.
Add yours at the top before you finish.

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
