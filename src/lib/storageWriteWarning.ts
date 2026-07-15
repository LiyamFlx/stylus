import { toast } from './toast';

/**
 * Surfaces a localStorage write failure to the user (Phase 1 item #1).
 *
 * Previously these failures only hit `console.warn` — a save could fail
 * (quota exceeded, private-mode storage disabled) with zero user-facing
 * signal, so a user could keep writing for an entire session believing
 * everything was saved when nothing after the failure point actually was.
 *
 * Shared across documents.ts (index/aux/pages/folders) and
 * useLocalStorage.ts (the actual ink autosave — the highest-stakes path)
 * so a bad run doesn't produce a toast per failed write: autosave retries
 * every debounce cycle, and index writes can cascade across several keys
 * in one user action, so this is throttled to one toast per cooldown
 * window rather than one per call site.
 */
const COOLDOWN_MS = 15_000;
let lastWarnedAt = 0;

export function warnStorageWriteFailed(): void {
  const now = Date.now();
  if (now - lastWarnedAt < COOLDOWN_MS) return;
  lastWarnedAt = now;
  toast.error(
    "Couldn't save — your device's storage may be full. Free up space or export your notes to avoid losing new changes.",
    8000,
  );
}
