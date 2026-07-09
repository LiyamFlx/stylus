# Quick Note — Feature Plan

Source: user's feature wishlist (Notes Writer-style app). Current state: Quick
Note is mode `'mobile'` in `MODE_CONFIGS` (`src/lib/modes.ts`), rendered by the
shared `Workspace.tsx` canvas engine — same ink/text-box system as Canvas and
Notebook, just reconfigured (minimal toolbar, text-first default tool, PNG/PDF
export with native share-sheet). There is no folder/tag system anywhere in the
app; `DocMeta` (`src/lib/documents.ts`) is a flat list.

Decisions locked in:
- Keep the shared canvas/text-box engine — don't fork a separate editor.
- Build the organization data model first (Phase 0) since search, folders,
  notebooks-of-notes all depend on it; retrofitting later is more expensive.

## Phase 0 — Organization data model (foundation, no user-visible UI yet)

Everything else in "stay organized" depends on this existing.

- Extend `DocMeta` (`src/lib/documents.ts`) with `folderId?: string` and
  `tags?: string[]`.
- Add a `Folder` type: `{ id, name, parentId?: string, createdAt }` — parentId
  enables nested folders/subfolders (Sections > Departments > Classes, etc.)
  without a separate tree structure.
- Migrate existing docs: default `folderId: undefined` = "unfiled".
- Storage: extend whatever persistence `useDocuments.ts` already uses (check
  before assuming IndexedDB vs localStorage vs filesystem).

**Why first:** Sidebar, search, and "notebooks/projects" folder UI all read
from this shape. Building folders UI before the data model exists means
rebuilding it twice.

## Phase 1 — Organization UI (quick, high-visible payoff)

- `Sidebar.tsx`: replace flat list with folder tree (collapsible), drag doc
  into folder, create/rename/delete folder, right-click → move to folder.
- Tag chips on doc cards; filter sidebar by tag.
- "New Folder" alongside existing "New Doc" entry point.

**Why second:** Directly unlocks the "unlimited notebooks, folders,
subfolders" ask with the smallest new-surface-area addition (UI only, no new
engine work) — visible win right after the invisible Phase 0 work.

## Phase 2 — Search & find/replace

- Full-text search across doc titles + text-box contents (extract text from
  Workspace's text-box model; PDF-embedded text out of scope until Phase 5).
  Index at save-time to avoid scanning every doc on each keystroke.
- Search UI: overlay/palette (title, folder, tag, content match snippet).
  Reuses folder metadata from Phase 0 for scoping ("search in this folder").
- Find & replace scoped to the currently open note.

**Why third:** This is the single most-requested "power user" feature in the
list ("Search, Find and Replace" gets its own heading) and is now cheap
because Phase 0 gave every doc a stable, filterable shape.

## Phase 3 — Writing tools (word-processor lite)

- Live counters: characters, words, sentences, reading time — computed from
  existing text-box content, pure UI addition, no new data model.
- Markdown shortcuts in text boxes (bold/italic/heading via `**`/`_`/`#`
  triggers) — scope to Markdown only first; skip full RTF (highlight,
  footnotes, superscript) until real demand shows up, since RTF is a much
  bigger text-model lift on top of the current text-box engine.
- Basic paragraph controls: alignment, line spacing (if the current text-box
  component doesn't already expose these — check before building).

**Why fourth:** Cheapest features per the "capture your thoughts" pillar;
word count and markdown formatting are additive to the existing text-box
component, no architecture change.

## Phase 4 — Export & sync formats

- Expand existing PNG/PDF export to add Markdown (.md) and plain text (.txt)
  — straightforward since Phase 3 gives you real markdown-annotated text.
- Sync/share: audit what's realistic on this stack (iCloud/Dropbox/Google
  Drive integrations are native-app features — evaluate whether this is a PWA
  or has native shell access before committing; if web-only, scope down to
  "export + share-sheet" rather than promising background sync).

**Why fifth:** Depends on Phase 3's markdown model existing; sync claims need
a feasibility check against the actual deployment target (Vercel web app)
before scoping further — flag this as a decision point, not a build task.

## Phase 5 — PDF & scan workflows (largest lift, sequence last)

- PDF annotation (highlight, underline, comments) on top of existing PDF
  export — this is a new capability (reading + overlaying existing PDFs), not
  an extension of current export-only PDF support.
- Camera scan-to-PDF: needs device camera access; evaluate feasibility for
  web/PWA vs requiring a native wrapper.
- Merge PDFs / rearrange pages: standalone utility, can ship independently of
  scan.

**Why last:** Biggest net-new engineering (PDF parsing/rendering library,
camera access, page-manipulation UI) with the least dependency on anything
built in Phases 0–4 — safe to defer without blocking earlier value, and worth
doing only after cheaper wins are shipped and validated.

## Explicitly deferred / out of scope for now

- Scrivener sync, custom notebook cover design, LaTeX/ePub export, voice
  notes, MLA/APA formatting, WebDAV/Box integration — niche relative to
  effort; revisit only if a specific phase above surfaces demand.

## Suggested execution order

Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5. Each phase is
shippable independently; nothing later blocks on Phase 4/5, so those can slip
without holding up the rest.
