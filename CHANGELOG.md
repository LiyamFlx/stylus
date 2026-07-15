# Changelog

All notable changes to Stylus are documented here. Dates reflect when work
landed on `main`, not necessarily individual feature-branch timestamps.

## 2026-07-15

### Added
- **Backend sync (ADR 002, MVP):** Clerk-based sign-in, Postgres (Neon)
  storage for documents/pages, `api/sync/*` push/pull routes, client-side
  sync queue with debounced push and a 15s retry loop, one-time migration of
  existing local data on first sign-in. Sign-in is fully opt-in — the app
  works exactly as before if you never sign in. Last-write-wins conflict
  resolution (documented, accepted limitation for this MVP).
- **Shape tool completion:** resize and rotate handles on selected shapes
  (previously only move/delete/duplicate worked).
- **Storage-usage warnings:** the sidebar surfaces a warning as local storage
  approaches the browser-origin quota, before a save silently fails.

### Changed
- **Eraser now splits strokes at contact points** instead of deleting the
  whole stroke — erasing through the middle of a long stroke leaves the two
  remaining ends as independent strokes, still a single undo step per drag.
- **Toolbar decluttered:** PNG / PDF / Markdown / text exports now live
  behind one **Export** menu; music mode, learning mode, and replay now live
  behind one **More** menu — cuts the always-visible button count roughly in
  half without removing any capability.

### Planned (Phase 3, not yet implemented)
Design docs for the next 7 features are in
[`docs/superpowers/plans/`](docs/superpowers/plans/):
handwriting search (background OCR indexing), AI-suggested tags, AI page
summaries, custom/user-saved templates, voice-to-text capture,
sketch-to-diagram (vision → shape primitives), and an accessibility pass
(focus-trap, reduced-motion, font-scaling). See
[`docs/product-audit-2026-07-15.md`](docs/product-audit-2026-07-15.md) for
the audit that scoped them.

## Earlier

Prior history predates this changelog; see `git log` for the full commit
history, including notebook page templates, text formatting (font/bold/
italic/align/resize), mobile touch-target and contrast fixes, and the
original P0/P1 canvas + OCR + export feature set described in the README's
original form.
