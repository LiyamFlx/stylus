# Backlog

Tracked locally (not GitHub issues — repo is public, roadmap stays private
for now). Each item has a full implementation plan in
[`docs/superpowers/plans/`](docs/superpowers/plans/).

## Phase 3 — differentiation

- [ ] **#4 — Handwriting search.** Background OCR on save, index alongside
  strokes so search finds ink you never typed or converted.
  Plan: [`2026-07-15-handwriting-search.md`](docs/superpowers/plans/2026-07-15-handwriting-search.md)
- [ ] **#13 — AI auto-organization.** Suggest tags via a new `/api/refine`
  action, manual-trigger only.
  Plan: [`2026-07-15-ai-auto-organization.md`](docs/superpowers/plans/2026-07-15-ai-auto-organization.md)
- [ ] **#14 — AI page summaries.** One-line summary cached on `DocMeta`,
  shown in Sidebar, manual-trigger only.
  Plan: [`2026-07-15-ai-page-summaries.md`](docs/superpowers/plans/2026-07-15-ai-page-summaries.md)
- [ ] **#11 — Custom templates.** Save a page as a reusable template,
  user-scoped alongside the bundled manifest (IndexedDB blob + localStorage
  metadata, same pattern as image underlays).
  Plan: [`2026-07-15-custom-templates.md`](docs/superpowers/plans/2026-07-15-custom-templates.md)
- [ ] **#17 — Voice-to-text capture.** Web Speech API → existing
  scan/text-drop pipeline.
  Plan: [`2026-07-15-voice-to-text.md`](docs/superpowers/plans/2026-07-15-voice-to-text.md)
- [ ] **#18 — Sketch-to-diagram AI.** Vision model → shape primitives,
  explicit action on a lasso selection (requires #6, shipped).
  Plan: [`2026-07-15-sketch-to-diagram.md`](docs/superpowers/plans/2026-07-15-sketch-to-diagram.md)
- [ ] **#19 — Accessibility pass.** Focus-trap, `prefers-reduced-motion`,
  font-scaling.
  Plan: [`2026-07-15-accessibility-pass.md`](docs/superpowers/plans/2026-07-15-accessibility-pass.md)

## Done

See [`CHANGELOG.md`](CHANGELOG.md) for Phase 2 and earlier.
