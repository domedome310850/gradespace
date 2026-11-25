# Multi-university delivery plan (2026-11-25)

Owner decision: defer authentication redesign. Preserve existing login, account flow, student IDs and grade JSON. This is a development sequencing decision, not permission to expose private data. Develop public catalog, theme and AI review components independently. Do not connect new private chat/file storage or server-side AI writes until ownership/access control is resolved. No production migrations or deployment in this PR.

## Phase 1: public academic foundation (this PR)
- Extract existing embedded catalog and 53 term plans into data/staging/cu-legacy-catalog.json. Stable course IDs include institution and exact course code; no inference of ownership from prefix.
- Keep original JSON payload and source blob SHA for reproducibility. Status legacy_unverified means not approved for publication; existing dates and templates are historical context, not current offerings or universal grading policies.
- Run node scripts/export-academic-catalog.mjs to regenerate, then node tests/academic-catalog.mjs. The CI check detects source/staging drift and invalid references.
- Next: ingest official CU/TU source documents as separate records, with curriculum version, document URL, page, effective date, extraction time, verification state. Do not overwrite conflicting legacy records; review first.
- Proposed entities: institutions, recursive academic units, programs, curriculum versions, options (major/minor/track), courses and versions, terms, offerings, requirement groups, grade policies/symbols and source evidence. Course codes unique per institution, not globally. Curriculum-specific requirements and grade rules must be versioned.

## Next small PRs (do not change authentication)
1. V3 mobile course layout review: PR #16, check CI, inspect screenshots before merge.
2. Academic profile and adaptive appearance: independent local preview setting; CU/CBS blue and subtle pink, TU red/yellow, neutral/default and custom colors; readable contrast in light/dark. Do not alter existing course colors or silently switch academic rules when changing appearance.
3. Public catalog browser and curriculum filters: verified/unverified coverage labels, search, paginated results, unknown curriculum fallback, 300–599 rule only if verified for that curriculum/version. No hard-coded single-university assumptions in new modules.
4. AI chat and bulk review: implement client-side preview with synthetic fixtures; reuse existing deterministic grade engine, explicit course selection, batch edit, duplicate/conflict checks, pending vs zero, unknown weights, preview and undo. Do not infer weight from raw max. Include source file/page references.
5. Upload infrastructure prototype: client queue, progressive previews, retry/cancel, long-image slicing; target 50 MB original files and 10–50 attachments per job, subject to verified storage/model limits. No unlimited resource promise. Split provider requests by bytes and parts; don't send huge Base64 JSON. Use synthetic attachments until private ownership is resolved.
6. Grade/curriculum policy engine: versioned GPA symbols and fractional credits, repeated courses, prerequisites, credit allocation, completion tests; do not apply unverified policy automatically.
7. More institutions/faculties, degree progress, semester planner, accessibility, Thai/English, device PWA tests and data coverage reporting.

## Deferred
Authentication redesign, private persistent AI conversations/uploads, account migration and new AI server-side writes. Keep production grade data unchanged. Production release of features handling private records remains gated on appropriate authorization, storage isolation, rate limits, data retention and user consent; no bypass via email-only lookup.

## Acceptance
Use current main as base for each PR; no merge without owner approval. Browser CI on 390 and 1280; add 320 and 768 for new responsive UI. Grade calculations and saved data regression tests; snapshot import tests. Verify actual deployment separately. No logo assets until use rights checked.