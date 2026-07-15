-- ADR 002: backend sync architecture — MVP schema.
--
-- Two tables, matching the split the client already makes locally:
-- `documents` mirrors the canvas/mobile-mode single-array doc shape plus
-- doc-level metadata (DocMeta); `pages` mirrors notebook-mode's per-page
-- stroke storage (PageMeta + that page's own strokes). A canvas/mobile doc
-- has rows only in `documents`; a notebook doc has one `documents` row
-- (metadata) plus one `pages` row per page (its ink lives there, not in
-- documents.strokes — kept NULL for notebook docs to avoid storing ink
-- twice).
--
-- `meta`/`strokes` are JSONB, not a normalized schema: DocMeta, PageMeta,
-- and Stroke[] are already plain serializable JSON client-side (see
-- src/lib/documents.ts, src/types.ts) — this is a direct wire-format match,
-- not a redesign. Normalize later only if query patterns demand it (see
-- ADR 002, Deferred).
--
-- Last-write-wins (ADR 002's accepted MVP conflict resolution) is enforced
-- IN the upsert's WHERE clause below, not in application code — a push
-- with an older updated_at than what's already stored is a silent no-op at
-- the database level, not a race the API route has to reason about.

CREATE TABLE IF NOT EXISTS documents (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  updated_at  BIGINT NOT NULL,
  meta        JSONB NOT NULL,
  strokes     JSONB
);

CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents (user_id);

CREATE TABLE IF NOT EXISTS pages (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  updated_at   BIGINT NOT NULL,
  meta         JSONB NOT NULL,
  strokes      JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS pages_document_id_idx ON pages (document_id);
CREATE INDEX IF NOT EXISTS pages_user_id_idx ON pages (user_id);

-- Migration bookkeeping (ADR 002 "Migration" section): a one-time flag so
-- the push-all-local-on-first-sign-in path never re-runs on a later
-- sign-in from the same account. Keyed by user_id, not stored on a `users`
-- table — Clerk already owns the user record; this is sync-specific state
-- the app needs, not user profile data.
CREATE TABLE IF NOT EXISTS sync_state (
  user_id     TEXT PRIMARY KEY,
  synced_at   BIGINT NOT NULL
);
