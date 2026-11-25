# GradeSpace MCP Tools — Specification Draft v0.1

Part of [GradeSpace Connect](../grade-space-connect-roadmap.md). Status: Planned. Sandbox only until Auth (Epic EX) ships.

Conventions

- Transport: Streamable HTTP. One server for ChatGPT, Claude and other MCP clients.
- Every tool declares `inputSchema`, `outputSchema` and annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint: false`).
- All numbers returned come from the shared GradeSpace engine. Descriptions tell the model to quote them, not recompute them.
- Errors: `{ "error": { "code": "...", "message_th": "...", "message_en": "...", "retryable": bool } }`. Codes: `unauthorized`, `forbidden_scope`, `not_found`, `validation_failed`, `stale_proposal`, `proposal_expired`, `rate_limited`, `too_many_items`.
- Scopes: `courses:read`, `grades:read`, `grades:propose`, `grades:write`, `profile:read`.

## Read (readOnlyHint: true)

| Tool | Input | Output (key fields) | Scope |
|---|---|---|---|
| `get_academic_profile` | — | institution, faculty, program, curriculum_version, entry_year, verification | profile:read |
| `get_my_courses` | `term?` | [{course_id, code, name, section, credits, color, grading_mode, projected_pct, collected, collected_max}] | grades:read |
| `find_courses` | `query` (name, code or nickname), `term?` | ranked [{course_id, code, name, match_reason, score}] | grades:read |
| `get_course_details` | `course_id` | course + exams + target + grading policy + trust labels | grades:read |
| `get_assessments` | `course_id` | [{assessment_id, name, type, group, score, max_score, weight, weight_source, status}] | grades:read |
| `get_current_scores` | `course_id?` | collected / released max / projected, labelled fact vs projection | grades:read |
| `get_exam_schedule` | `term?` | [{course_id, kind, starts_at, room, source, verification}] | grades:read |
| `get_academic_calendar` | `institution`, `year` | public calendar events with source | — |
| `get_import_history` | `limit<=50` | [{import_id, client, rows, created_at, undone}] | grades:read |
| `get_degree_progress` | — | requirement groups with earned/required and `verifiable` flag | grades:read |
| `search_courses` | `q, institution?, credits?, suffix_min?, suffix_max?, verification?, after?` | public catalog page (≤ 30) | — (public) |

## Calculate (readOnlyHint: true)

| Tool | Input | Output |
|---|---|---|
| `calculate_weighted_score` | `course_id` or inline items | weighted %, unknown-weight warning |
| `calculate_required_score` | `course_id, target (grade or %), assessment_id?` | required score per remaining item, `feasible` bool, assumption list |
| `calculate_gpa` | `scope: term|cumulative` | GPA, credits counted, excluded symbols, rounding note |
| `simulate_grade` | `course_id, hypothetical scores[]` | projected % and grade, labelled hypothetical |
| `simulate_gpa` | `{course_id: grade}[]`, `target?` | simulated GPA/GPAX, average needed |
| `check_curriculum_requirements` | — | per group status; `verifiable:false` when data incomplete |
| `find_eligible_electives` | `group_id` | courses with `match: confirmed|code_range_only` |

## Prepare (readOnlyHint: true — writes only an expiring row in `proposals`)

| Tool | Input | Output |
|---|---|---|
| `prepare_score_import` | Universal Import payload (1–500 items) | `proposal_id`, `expires_at`, `base_version`, summary {ready, needs_info, duplicates, conflicts, dropped_total_rows}, rows [{row_id, action: create|update|skip, old, new, issues[]}], `questions[]` |
| `prepare_course_import` | courses[] with code/section/term | proposal as above |
| `prepare_assessment_import` / `prepare_syllabus_import` | assessment structure (names, weights stated, groups) | proposal |
| `prepare_exam_import` | exams[] with date/time/room/source | proposal; never overwrites verified Reg data silently |
| `prepare_score_update` | `assessment_id, score, note` (e.g. "จริงๆ ได้ 8.5") | proposal with old → new |
| `prepare_undo_import` | `import_id` | proposal listing every field that will be restored |
| `update_proposal_rows` | `proposal_id, edits[]` (from widget) | new proposal version |

Rules: no guessed weight; `null` score stays pending; total rows dropped; anything ambiguous becomes `questions[]` instead of a value.

## Confirm (destructiveHint: false, idempotentHint: true)

| Tool | Input | Behaviour |
|---|---|---|
| `confirm_proposal` | `proposal_id, expected_version, row_ids? (subset)` | Checks owner + scope `grades:write`, status `pending`, not expired, `expected_version` equals current data version, then writes all rows + `import_history` + `audit_log` in one transaction. Repeated calls return the same `import_id`. Returns `{import_id, rows_written, undo_proposal_hint}` |

`confirm_import`, `confirm_update` and `confirm_undo` from the brief map onto `confirm_proposal` with the proposal kind; keeping one confirm path means one set of checks to test.

## UI resources (MCP Apps)

| Resource | Linked to | Purpose |
|---|---|---|
| `ui://gradespace/review.html` | all `prepare_*` | Review widget: summary, editable rows, confirm, cancel, open in GradeSpace |
| `ui://gradespace/course-card.html` | `get_course_details`, `calculate_required_score` | Compact course card with trust labels |

Fallback when the host has no UI support: the tool result `content` carries a plain-text summary and `https://<app>/review/<proposal_id>`.
