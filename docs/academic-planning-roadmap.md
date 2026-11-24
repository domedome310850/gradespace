# Academic planning upgrade — implementation and acceptance plan

Scope: existing grade tracker, no login or community changes. Preserve user data and official GPA; keep hypothetical scenarios separate. Deliver via PR, not direct production deployment.

| Workstream | Design | Acceptance |
|---|---|---|
| Confirmed grade floors | Sparse per-grade cutoffs, not default scale; source and section scoped | 39.99 below D40 is not F; 40 reaches D; unconfirmed higher grades stay unknown |
| Study priorities | Compact overview ranked by exam date, weighting, score gap and credits; show reason, not probability | Date changes, completed exams, impossible goals, missing/invalid weights |
| Class comparison | Same assessment/snapshot score, mean and SD; Z-score with explicit limits | Missing and zero SD, negative Z, save/reload, section change |
| GPA planning | Current semester official results fixed; alternative hypothetical grade sets and bounds; S/U excluded | Credit weighting, impossible target, relative grading not presented as official |
| Complex grading | Explicit rules for component minimum, grade cap, rounding, bonus and dropped work; only calculate supported policies | Boundary cases, incomplete work, simulate vs actual, unchanged legacy rules |
| Scanner | Extract only explicit rules, show evidence/review, never invent unknowns | Mock responses, malformed input, existing manual policy preserved |
| PWA/reminders | Responsive, accessible, installable shell; no private network responses cached; local reminders/ICS with permission | Manifest, offline shell, notification permission denied, desktop/mobile |
| MCV import | Extend existing paste/preview; official API requires authorized app credentials | No scraping credentials, duplicate rows, missing scores not zero |
| Architecture/tests | Separate pure planning functions where practical, regression tests and CI | Parse scripts, pure tests, browser smoke in Thai/English 390/1280, no overflow/console errors |

UI: use existing cards, type scale, spacing, contrast and bilingual dictionary. Make missing data visible; labels explain assumptions. Avoid adding unnecessary nav tabs. Use inline advanced controls and review panels. No silent destructive edits.

Release gates: unit and browser tests green; review migration/backward compatibility; no production Edge Function deployment until matching front end verified; merge only with owner approval. No claim of live MCV sync without credentials; no claim of background push without infrastructure.
