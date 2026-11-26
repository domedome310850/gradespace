# GradeSpace — handoff for any AI or developer

Read this whole file before changing anything. It is the shared memory between the AIs that work on this
project (Claude, ChatGPT/Codex, Gemini, Cursor, Copilot…). The owner switches between them, so **the next
one must be able to pick up exactly where you stopped.**

GradeSpace is a bilingual (Thai/English) grade tracker for Chulalongkorn University students: courses,
assessments, weighted scores, grade estimates, GPA, exam dates, study plans, GenEd picking.

## The rules (please follow every time)

1. **GitHub is the only source of truth.** Always start from the latest `main` (`git pull`). Never start
   from a zip, a pasted file or a copy from an earlier chat — it may be out of date and would undo
   other people's work.
2. **Work on a branch, open a pull request.** Name it after the change (`fix/calendar-colors`). Small,
   focused commits with clear messages. Never force-push to `main`. Merge only when the owner says so
   (or when they asked you to merge).
3. **Before you finish:**
   - run the tests (see *Testing*) and fix anything you broke;
   - add an entry at the top of `CHANGELOG.md`: date, which AI you are, what changed, which files;
   - if you leave something half-done, write it under *Open work* below so the next AI can continue.
4. **Never lose saved data.** Students' data is stored as one JSON object per email (see *Data*).
   Don't rename or remove stored fields; add new optional ones. If a new course field must survive
   saves from older copies of the site, add it to the keep-list in `gs_save` (see `supabase/schema.sql`).
5. **Every UI text in both languages.** Add each new string to both `I18N.en` and `I18N.th`.
6. **Backend changes go through the repo too.** SQL: add a dated file in `supabase/migrations/`, apply it,
   then update `supabase/schema.sql`. Edge functions: edit `supabase/functions/<name>/index.ts`, deploy
   that same code, commit it.
7. **No secrets in the repo.** The Supabase URL and the *publishable* (anon) key in `index.html` are meant
   to be public. Everything else (sync token, AI keys, service-role key) lives in Supabase.

## Where things are

| Path | What |
|---|---|
| `public/index.html` | The whole website: one file, React 18 + htm from CDN, **no build step**. |
| `supabase/functions/gs-scan/` | Reads screenshots with AI (Gemini or Claude) → courses/scores JSON. |
| `supabase/functions/reg-sync/` | Reads public course schedules from Reg Chula (sections, times, exam dates). Cron every 10 min. |
| `supabase/functions/gened-sync/` | Reads the GenEd course list PDF from gened.chula.ac.th. Cron daily. |
| `supabase/schema.sql` | Reference copy of the live database: tables, RPC functions, cron jobs. |
| `supabase/migrations/` | Dated SQL changes from now on. |
| `tests/` | Browser smoke test (Playwright) + sample data. |
| `wrangler.jsonc` | Cloudflare Worker `gradespace-th` serving `public/`. |
| `CHANGELOG.md` | What each AI did, newest first. |

### Inside `public/index.html`

Find code with search (`grep -n "^function CourseCard"`), not by line number — lines move.

- **CSS** at the top. Colours are tokens on `:root` (light) and dark overrides; course colours are
  `--c-indigo`, `--c-blue`… (`COLORS` in JS). Add new rules just before `.thumb-badge {`.
- **Modules** (plain JS, before the React app):
  `Calc` (alias `C`: weights, course summary, estimates, GPA), `Store` (state shape, normalize, cloud),
  `Scan` (applies AI scan results), `CATALOG` (built-in course catalog + faculty study plans),
  `SharedCatalog` (shared Google Sheet via JSONP), `Fuzzy`, `PasteScores`, `I18N`.
- **App** (inside one IIFE): global state `S`, `update(fn, {undo:true})` to change data, `emit()`,
  `toast()`, `openModal(type, props)`; the modal registry is the object ending in
  `…studyplan: StudyPlanModal, gened: GenEdModal, grading: GradingModal, assistant: AssistantModal, cmd: CommandModal }[m.type]` — add new modals there.
  New features should get an entry point in the `cmd` menu (`commandItems`). Navigation follows YouTube:
  top bar = logo + search (`.top-search`) + `AccountMenu` (desktop only); phones get a 5-tab `BOTTOM_NAV`, and
  less-used pages live under the “You” tab (`MePage`, `ME_PAGES`); the sidebar `NAV` uses `group` labels.
  GradeSpace has **no AI of its own** (owner, 2026-11-26): the AI button (centre of the phone bar, `AiFab` on
  desktop) opens `AiHubModal` — ChatGPT/Claude connector card first (coming soon), then scan/paste/quick tools.
  Connectors: student's own AI reads/proposes, the student approves every change in GradeSpace.
  Until the connector is in ChatGPT's directory (free plans can't add custom ones), `AskAiModal` is a copy-paste
  bridge: copy JSON → AI answers with a ```gradespace-scores block → paste → approve rows. Never creates items. Help and Feedback share `HelpHub`. Don't add a sixth bottom item — put it under You instead.
  **Universities:** `uniOf(state)` / `isCU(state)` read `settings.institution` (`''` → Chula). Anything that talks
  to Reg Chula, Chula GenEd, CBS study plans or exam rooms must stay behind `isCU`. Thammasat data lives in
  `TU_GENED` / `TU_TBS` / `TU_CATALOG`; `CATALOG.get/search` switch by university.
  Each university is a separate space: inactive ones live in `settings.spaces[cu|tu]` (`SPACE_KEYS`,
  `SPACE_SETTINGS`, `switchSpace`). Always switch with `setUni`; never copy courses between spaces.
  Thammasat-only wording: add `'key@tu'` next to `'key'` in both languages; `t()` picks it when not Chula.
  TU grade rules (regulation 2568) are in `TU_OUTCOMES` and `TuRulesCard`.
  In a TU space `plan`/`studyplan` modals are swapped for `TuPlanModal` in `ModalHost`. What-if grades: `WhatIfCard`,
  `whatIfCourses`, `whatIfSolve` (never saved).
  Other helpers: `RegData` (Reg Chula data per course), `GenEdData`, `examsFor(c, state)`,
  `gradingModeFor(c)`, `sectionOf(c)`, `niceName(name)`, `courseDisplayTitle(c)`.
- **Pages**: `Dashboard`, `CoursesPage`, `CourseDetail`, `YearsPage`, `SimulatorPage`, `GPAPage`, settings.
- `window.GradeSpace` exposes `S` and a few helpers for tests.

## Data

One JSON object per student (`gradespace_by_email.data`), loaded with `gs_load(email)`, saved with
`gs_save(email, data, updated)`. Main keys:
`settings` (lang, theme, currentSemesterId, studyPlan {prog, majors{year: major}}, genEdRequired…),
`scales` (grade scales: `scale-th`, `scale-su`, `scale-norm`), `outcomes` (W, I, S, U…),
`years` [{id, level, academic (B.E. year)}], `semesters` [{id, yearId, kind s1|s2|summer}],
`courses` [{id, semesterId, code, name, section, credits, kind required|elective|gened, scaleId,
customGrades, gradingMode criterion|norm|unknown, gradingUser, target, targetPct, exams, finalGrade, color}],
`categories` (assessment groups), `assessments` [{id, courseId, categoryId, name, type, weight, max, score,
status, due, predicted}].

`gs_save` keeps a daily backup (`gradespace_backups`, 14 days) — use it to restore if something goes wrong.

## Backend and services

- **Supabase** project `jecdbhfnuudmngpqmrrq` (database, RPCs, edge functions, cron, Vault).
- **Cloudflare** Worker `gradespace-th` serves the site (an older Worker `gradespace` also exists).
- **Google Sheets** (owner's Drive): "GradeSpace — User Registrations" (sign-ups/feedback via Apps Script)
  and "GradeSpace — Shared Course Master" (read by `SharedCatalog`).
- **Reg Chula** `cas.reg.chula.ac.th`: its TLS chain lacks an intermediate certificate; `reg-sync` adds it.
  Reg sometimes answers "ระบบยังไม่พร้อมใช้งาน" — the sync backs off and retries.
- **gened.chula.ac.th**: GenEd list from `/server-api/pdf/course-list` (a PDF with 6 group columns).

## Testing

```
cd tests
npm install
npx playwright install chromium
npm test
```
Opens every page in Thai and English on phone (390px) and desktop (1280px) widths with fake network
data and fails on any error or sideways scrolling. Also click through what you changed yourself.

## Deploying

- **Website:** once the repo is connected in Cloudflare (Workers & Pages → `gradespace-th` → Settings →
  Build → Connect to Git, branch `main`), merging to `main` deploys by itself. Until then, upload
  `public/index.html` in the Cloudflare dashboard.
- **Edge functions:** `supabase functions deploy <name> --project-ref jecdbhfnuudmngpqmrrq`
  (`gs-scan`, `reg-sync` and `gened-sync` run with JWT verification off; they check their own token).

## Open work

- **Exam rooms (owner requested on 2026-11-22):** 310 private rules covering 110 courses in `gs_room_data.rules` for 2569/s1/fin. PR #7 now uses `gs_exam_device` and `gs_room_data.device_profiles` with a random browser-specific secret stored per email; no email verification or extra login. Different browsers must re-enter the ID. The original grade store is unchanged (email-only access is not verified identity). One malformed PDF p.3 interval omitted pending faculty confirmation. SQL device-isolation tests passed, browser smoke and deployment pending.
- **Secure sign-in step 1 (2026-11-26, PR feat/verified-signin):** code-based sign-in built behind `GS_WEB.otp=false`;
  migration `20261126_verified_email_signin.sql` written and tested locally, **not applied**. Owner checklist in
  `docs/secure-signin.md` (custom SMTP, `{{ .Token }}` template, apply migration, flip `otp`). Steps 2–3 (OAuth for
  outside AI, ChatGPT/Claude connector) not started.
- **Owner decision 2026-11-26:** ChatGPT/Claude connector must wait for secure sign-in (OAuth); the owner un-paused login work, but its plan needs approval before any login/DB change. The AI sheet shows a non-working “coming soon” connect card first.
- **GradeSpace Connect (2026-11-25, planned):** external AI (ChatGPT/Claude via one MCP server, MCP Apps review widget, Universal JSON import). See `docs/grade-space-connect-roadmap.md`. Do not expose real student data to external AI until OAuth 2.1 (Epic Auth) ships; sandbox data only.
- **Thammasat (2026-11-26):** TU mode shipped without automatic schedules. TU’s class/exam search
  (`https://vnweb68.reg.tu.ac.th/registrar/classinfo`, linked from reg.tu.ac.th) is a JavaScript app; its data API
  was not inspected yet (needs a real browser’s network tab). Next: capture that API, add a `tu-sync` edge function +
  migration mirroring `reg-sync`, then feed exam dates into `examsFor`. Also missing: TU faculty study plans (TBS 2566
  curriculum PDFs on tbs.tu.ac.th) for `TuPlanModal`, more TU faculties’ course lists.
- Installable app (PWA) and a privacy (PDPA) page.
- Move the two Google Sheets into Supabase tables.
- MyCourseVille: official API needs an app key from the MCV team; meanwhile "Paste from MCV" and
  screenshot scanning exist. A bookmarklet that sends the Portfolio table was proposed, not built.
- Study plans cover Accounting, BBA majors and Statistics from the faculty's 2569 timetable; some terms
  (e.g. MIS year 4) have no published plan.

- **TU public data audit, PR #33 (2026-11-26):** 12 TBS Thai sample plan variants, public schedule references, 2569/2570 registrar calendar references, historical syllabus data. User ZIP: 34 distinct PDFs/408 pages rendered; detailed visual check incomplete. IB/IT/RB discrepancies documented; never coerce source totals or auto-apply historical grades/exams. Curriculum 2556 forms are not 2566. See `docs/tu-public-data.md`; remaining tasks: visual row validation, live TU sync and safe program/section scoping, browser tests. Do not deploy draft without approval.

- November final notice pp.9,10,17,20,23 visually reconciled; p.23 weekday/date conflict flagged, IS281 9000/01 blank code omitted. No automatic calendar insertion.

- TU ZIP all 408 pages rendered and contact-sheet visually surveyed; 99 term credit sums checked (additional FN/IS anomalies). 15 missing course records recovered; 312 Thai records. Individual data-field audit still incomplete; do not mark all fields verified or deploy draft.

- TBS workflow audit: `docs/tu-registration-workflow.md`; 11 track checklists and major-elective baskets, registration guide, repeat-planning and legacy shared Chula isolation. Remaining: persisted curriculum/major, precise other/minor allocation, live quota/offerings, cohort-specific rules, test CI, remaining detailed 408-page field audit. No auto-registration, no merge/deploy.
