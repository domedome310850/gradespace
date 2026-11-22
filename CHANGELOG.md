# Changelog

Newest first. Each entry: date · who (which AI / person) · what changed · files.
Add yours at the top before you finish.

## 2026-11-22 · Claude (claude.ai) · Fix Cloudflare preview builds
- Added an empty top-level `"previews": {}` block to `wrangler.jsonc`: `npx wrangler preview` stops with
  "Your Wrangler configuration is missing a `previews` block" without it. No other settings changed.
- Files: `wrangler.jsonc`, `CHANGELOG.md`.

## 2026-11-22 · Codex · Cloudflare Auto Deploy retest
- Added this `CHANGELOG.md` entry to retrigger the `gradespace-th` preview build on `test/cloudflare-auto-deploy`.

## 2026-11-22 · Codex · First Cloudflare Auto Deploy test
- Added this `CHANGELOG.md` entry to test Cloudflare Auto Deploy for `gradespace-th` when the pull request is merged into `main`.

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
