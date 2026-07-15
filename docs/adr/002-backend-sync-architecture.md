# 002. Backend, Auth, and Sync Architecture

## Status

Proposed — 2026-07-15. Design-only (Phase 1 item #02a of the 90-day roadmap).
No code ships against this ADR yet. Unblocks Phase 2 item #2 (sync MVP).

## Context

Stylus is currently a client-only PWA: React 18 + Vite, no framework-level
backend, one existing Vercel serverless function (`api/refine.ts`, calling
Claude via the Vercel AI Gateway with OIDC auth — no API key in code). All
document data — the doc/folder index, per-document or per-page stroke
arrays, text-item aux data, custom color palettes — lives exclusively in
`localStorage`, with image-underlay bitmaps in IndexedDB (added specifically
because images would exceed the localStorage quota; see
`src/lib/imageStore.ts`). There is no account system, no login, and no
cross-device or cross-tab coordination (`documents.ts` explicitly documents
"read-modify-write with no cross-tab coordination... last-write-wins" as an
accepted limitation of the current model).

The product audit (`docs/product-audit-2026-07-15.md`) identified this as
the single highest-leverage architectural gap: every feature in Phase 3
(handwriting search at scale, AI auto-organization, page summaries) and the
entire "researcher/professional" user segment are blocked on data
persisting somewhere other than one browser's local storage. This ADR
exists to lock in the shape of that backend *before* Phase 2 implementation
starts, so the sync MVP isn't built against a design that has to be
reworked once the harder questions (conflict resolution, offline contract)
get real answers.

Constraints this decision has to respect:

- **Don't regress the offline-first feel.** The product's current identity
  (works everywhere, no login required, no spinner before you can write) is
  a real strength documented favorably in the audit. Sync must be additive,
  not a replacement that makes the app unusable without a network.
- **Small surface area.** This is a Vite SPA with one serverless function
  today, not a Next.js app — the auth and storage choices should fit that
  shape rather than pull in a framework the app doesn't otherwise need.
- **MVP, not final architecture.** Per the roadmap, Phase 2 explicitly
  accepts last-write-wins; this ADR documents that ceiling honestly rather
  than over-designing conflict resolution nobody asked for yet.

## Decision

### Auth provider: Clerk

Clerk is the auth provider, using `@clerk/clerk-react` (the framework-agnostic
React SDK, not the Next.js-specific package — this is a Vite app).

**Why Clerk over Supabase Auth or Auth.js:**

- **Fits the existing deployment shape without adding one.** Supabase Auth
  is bundled with the Supabase platform — adopting it pulls in a second
  hosted platform alongside Vercel for no reason if Postgres/Supabase isn't
  otherwise the storage choice (see below, it isn't). Auth.js (NextAuth) is
  built around framework server-side session handling that assumes a
  Next.js or similar SSR app; retrofitting it onto a client-rendered Vite
  SPA with a thin serverless API is friction this project doesn't need to
  take on.
- **Client SDK matches the app's actual architecture.** Clerk's React SDK
  is designed to drop into any React app (Vite included) and handles the
  session/JWT lifecycle client-side, verified server-side via a standard
  JWT check in each Vercel function — the same shape `api/refine.ts`
  already uses for its own auth (OIDC token, verified server-side, no
  secret in client code).
- **This environment already has first-class Clerk tooling** (CLI, backend
  API skill, Next.js/custom-UI/webhooks/orgs skills) available for
  implementation and troubleshooting during Phase 2 — a practical
  cost-of-execution factor, not just a feature checklist.
- Supabase Auth was the closest alternative and is not a bad choice on
  technical merits — it's rejected here specifically because it implies
  Supabase-as-database too, and the storage decision below picks a
  different shape.

### Storage model

**Split by data shape and access pattern, matching the split the app
already uses locally** (index/metadata vs. hot-path ink data vs. binary
blobs) — this ADR extends that existing pattern to a server rather than
inventing a new one:

| Data | Where | Why |
|---|---|---|
| Account, doc/folder index, `DocMeta`, `Folder`, tags, pin state | Postgres (Vercel Marketplace — e.g. Neon or Supabase-as-a-database-only, not Supabase Auth) | Structured, relational (folder nesting, doc→folder, doc→user), needs real queries (search, "recent", "pinned") once volume grows past what a client-side scan handles well — see the audit's noted scaling ceiling on `searchDocuments`. |
| Stroke arrays (ink), per-page aux (text items, paper/template refs) | Same Postgres instance, as JSONB columns keyed by doc/page id | Strokes are already plain serializable JSON client-side (`useLocalStorage.ts`'s `PersistedDrawing`); no schema migration needed to move the *shape* of the data, only where it's written. JSONB avoids inventing a stroke-specific schema prematurely — normalize later only if query patterns demand it. |
| Image-underlay bitmaps | Vercel Blob | Already isolated from structured data locally (IndexedDB, not localStorage) for exactly the reason it should stay isolated on the server: binary blobs don't belong in a relational row, and Blob is the direct server-side analog of "large binary, not queried, fetched by reference." |
| Bundled page/cover templates | Unchanged — static assets in `public/templates`, shipped with the app | Not user data. No reason to move template *assets*; a future custom-template feature (audit item #11) would store user-created template *references* in Postgres alongside docs, reusing this same split. |

One Postgres instance covers structured metadata and ink together
(same trust boundary, same transaction needs — e.g., deleting a doc should
atomically remove its pages and their ink) rather than splitting ink into a
separate store; Blob is the only genuinely separate system, for the same
reason it already is locally.

### Sync protocol: local-first, write-local-first with background push

The client remains the source of truth for an in-progress editing session
— exactly as it is today. On every debounced save (the same 400ms
`useLocalStorage` cadence already in place), the client:

1. Writes to `localStorage`/IndexedDB immediately, unchanged from today.
2. Queues a background push to the server (fire-and-forget from the UI's
   perspective — drawing is never blocked on network).
3. On reconnect after an offline period, replays the queued pushes in
   order.

This is **not** a server-authoritative model (client always asks server
"can I write this?") — that would reintroduce the "spinner before you can
write" problem this ADR explicitly rejects. It's the same shape the app's
own `useLocalStorage.ts` already uses for local persistence (debounced,
non-blocking, flush-on-visibility-change), extended one hop further to a
server instead of stopping at the browser.

Pull direction: on app load (and on a coarse interval / tab-focus while
running), the client fetches the current server state for documents it
doesn't have a fresher local version of, using `updatedAt` as the
comparison — the same recency field the app already uses for "most
recently touched document" resolution in `App.tsx`'s mode-switching logic.

### Conflict resolution for MVP: last-write-wins, by document

**Explicitly accepted, not deferred as an oversight.** The unit of
conflict is a whole document's stroke array (or a whole page's, for
notebook mode) — whichever write reaches the server with the later
`updatedAt` wins entirely; the other is discarded server-side.

**The ceiling this creates, stated plainly:** if the same document is
edited offline on two devices during the same window and both come back
online, one device's edits are silently lost. This is a real, user-visible
data-loss scenario, not a cosmetic rough edge — it's the direct
continuation of the *already-accepted* local risk documented in
`documents.ts` ("two tabs mutating the index race and last-write-wins"),
now extended across devices instead of just across tabs. It is deliberately
in scope for MVP because:

- It only manifests under simultaneous multi-device offline editing of the
  *same* document — a narrower and rarer case than "sync exists at all,"
  which is the actual Phase 2 goal.
- Building real conflict resolution (CRDT-based merge, or even a manual
  "which version do you want" prompt) is a substantially larger effort that
  would delay shipping sync at all — and per the roadmap, every Phase 3
  differentiation feature is blocked on sync existing in some form first.
- The MVP failure mode (silent loss of one device's session) is bad but
  bounded — it cannot corrupt data, only overwrite it, and only for
  documents genuinely edited on two devices in the same offline window.

This ceiling is the specific thing a follow-up ADR should revisit once
sync MVP has real usage data on how often simultaneous multi-device
editing actually happens.

### Offline behavior contract

| Capability | Offline | Notes |
|---|---|---|
| Create, edit, delete documents/pages/strokes | Full | Unchanged from today — local write path is untouched. |
| OCR (Tesseract.js) | Full | Already fully client-side (WASM), no network dependency. |
| AI refine (Polish, Summarize, Ask, etc.) | Unavailable | Already requires the network today (`api/refine.ts`) — no regression, just an unchanged limitation. |
| Search | Full, local-only | Continues to scan local data as today; does not search content only present on another device until that device's data has synced down. |
| Cross-device sync | Queued, resumes on reconnect | Per the protocol above — never blocks local editing. |
| Sign-in | Not required to use the app | Signed-out users keep today's fully-local, no-account experience unchanged. Sign-in is opt-in, additive — the audit's free tier stays real and undiminished, matching the monetization sequencing already proposed (local-only free tier, sync as part of Pro). |

The existing `OfflineBadge` component (shipped this session, item #1's
sibling work) is the natural surface for a future "N changes waiting to
sync" state once the sync queue exists — no new offline-status UI pattern
needs inventing.

### Migration path from localStorage-only

1. **Sign-in is opt-in and non-destructive.** An anonymous user's existing
   local documents are never deleted or blocked by adding auth — signing in
   is a decision to *start* syncing, not a requirement to use the app.
2. **First sign-in on a device with existing local data**: the client
   pushes its full current local state (index + all docs' ink/aux) to the
   server as the initial sync, tagged as authoritative (nothing to merge
   against yet, since a fresh account has no server state).
3. **Subsequent sign-in on a second device**: the reverse — server state
   pulls down and becomes the local baseline, then normal sync resumes.
4. No client-side schema changes are required to *start* this migration —
   `DocMeta`, `PageMeta`, and `Stroke` are already plain serializable JSON,
   which is exactly why the storage model above stores ink as JSONB rather
   than a normalized schema: the wire format between "local" and "server"
   is identical from day one.

## Consequences

**Positive:**
- Sync becomes additive to the existing local-first architecture rather
  than a rewrite — the debounced-save, offline-first UX users already have
  is preserved, not replaced.
- The storage split mirrors a pattern the codebase already validated
  locally (structured metadata vs. hot-path JSON vs. binary blobs), so
  there's no new mental model to design from scratch.
- Signed-out usage remains fully functional and un-degraded, keeping the
  free tier honest per the audit's monetization sequencing.

**Negative / accepted tradeoffs:**
- Last-write-wins is a real, documented data-loss risk under simultaneous
  multi-device offline editing of the same document (see above) — accepted
  for MVP, not resolved by this ADR.
- Two systems now exist for "is this the latest version" (browser
  `localStorage` recency today, server `updatedAt` after this ships) —
  correctness depends on both agreeing, which is a new class of bug surface
  that doesn't exist in a client-only app.
- A new operational dependency (Postgres + Blob provisioning, auth token
  verification in every serverless function that now needs it) where none
  existed before — Phase 2 implementation cost is real, not just "flip a
  flag."

## Deferred

Explicitly out of scope for this ADR and for Phase 2's sync MVP:

- **Real conflict resolution** (CRDT/OT-based stroke merging, or a
  user-facing "resolve conflict" flow). Revisit once MVP usage data shows
  how often the last-write-wins ceiling is actually hit.
- **Real-time collaboration** (multiple users editing the same document
  live). Nothing in this ADR precludes it later — the Postgres-backed
  storage model is compatible with adding a real-time layer on top — but
  it is a distinct, larger feature not implied by "sync across a single
  user's devices."
- **Team/organization accounts.** This ADR covers individual-user sync
  only; the audit's education-tier packaging (item #20) explicitly waits
  on this ADR's account system existing first, but org-level sharing
  semantics are a separate design question.
- **Search-index architecture change.** Moving `searchDocuments` off its
  current on-demand client-side scan and onto a server-side index is
  implied as eventually necessary by the audit (item #4, handwriting
  search) but is not decided here — it depends on this ADR's storage model
  existing first, and should get its own ADR when Phase 3 reaches it.
- **Exact conflict/sync UI copy and error states.** This ADR fixes the
  protocol, not the pixels — toast/badge copy for sync failures, pending
  states, etc. is an implementation-time decision against the existing
  `Toaster`/`OfflineBadge` components, not an architectural one.
