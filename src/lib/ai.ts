/**
 * Client for the Stylus AI studio. Talks to the `/api/refine` serverless
 * function, which runs Claude through the Vercel AI Gateway. No mock fallback —
 * a failed call surfaces as a real error in the studio.
 */

export type RefineAction =
  | 'polish'
  | 'grammar'
  | 'summarize'
  | 'todo'
  | 'formal'
  | 'casual'
  | 'ask'
  | 'translate';

export interface RefineActionDef {
  key: RefineAction;
  label: string;
}

/** Refine chips, in display order. Mirrors the api/refine.ts prompt set. */
export const REFINE_ACTIONS: RefineActionDef[] = [
  { key: 'polish', label: 'Polish' },
  { key: 'grammar', label: 'Fix grammar' },
  { key: 'summarize', label: 'Summarize' },
  { key: 'todo', label: 'To-do list' },
  { key: 'formal', label: 'Formal' },
  { key: 'casual', label: 'Casual' },
];

/**
 * Labels for actions not shown as studio chips but triggered from the selection
 * toolbar (Ask Stylus, Translate).
 */
const EXTRA_LABELS: Partial<Record<RefineAction, string>> = {
  ask: 'Ask Stylus',
  translate: 'Translate',
};

/** Map an action key to its human label. */
export function refineLabel(key: RefineAction): string {
  return (
    REFINE_ACTIONS.find((a) => a.key === key)?.label ?? EXTRA_LABELS[key] ?? key
  );
}

/** Hard ceiling on a single refine call, so "Thinking…" can't hang forever. */
const REFINE_TIMEOUT_MS = 20_000;

/**
 * Refine `text` with the given action via the real AI backend.
 * @throws Error with a user-facing message when the call fails.
 */
export async function refine(
  action: RefineAction,
  text: string,
  signal?: AbortSignal,
): Promise<string> {
  // Always time-box the request. Compose the caller's abort signal (supersede /
  // unmount) with a timeout so a stuck fetch can never hang indefinitely.
  const timeout = AbortSignal.timeout(REFINE_TIMEOUT_MS);
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch('/api/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, text }),
      signal: composed,
    });
  } catch {
    // A timeout abort lands here too — surface it as a clear message rather than
    // the generic network one when the caller's own signal wasn't the cause.
    if (timeout.aborted && !signal?.aborted) {
      throw new Error('The AI service took too long to respond. Please try again.');
    }
    throw new Error('Network error — could not reach the AI service.');
  }

  let data: { result?: string; error?: string } = {};
  try {
    data = (await res.json()) as { result?: string; error?: string };
  } catch {
    // Non-JSON response (e.g. the SPA fallback HTML when /api isn't running).
    throw new Error(
      res.ok
        ? 'Unexpected response from the AI service.'
        : `AI service error (${res.status}).`,
    );
  }

  if (!res.ok || !data.result) {
    throw new Error(data.error || `AI service error (${res.status}).`);
  }
  return data.result;
}
