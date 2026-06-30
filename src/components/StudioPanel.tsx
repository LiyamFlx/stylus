import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecognitionStatus } from '../hooks/useRecognition';
import { REFINE_ACTIONS, refine, refineLabel } from '../lib/ai';
import type { RefineAction } from '../lib/ai';
import { CheckIcon, CloseIcon, CopyIcon, SpinnerIcon } from './icons';

interface StudioPanelProps {
  open: boolean;
  /** OCR lifecycle from useRecognition. */
  status: RecognitionStatus;
  /** Recognized text once OCR succeeds. */
  text: string;
  /** OCR error message, if recognition failed. */
  recognitionError: string | null;
  /**
   * When set, auto-run this refine action once recognition succeeds (used by
   * the selection toolbar's Ask Stylus / Translate one-tap actions).
   */
  autoAction?: RefineAction | null;
  onClose: () => void;
}

/**
 * Stylus AI studio. Shows the recognized handwriting (editable), then refines
 * it with Claude through the real `/api/refine` backend (Polish, grammar,
 * summarize, to-do, formal, casual). Docks right on desktop, bottom-sheet on
 * mobile. Mounts only while open so it never blocks pointer events to the
 * canvas.
 */
export function StudioPanel({
  open,
  status,
  text,
  recognitionError,
  autoAction,
  onClose,
}: StudioPanelProps) {
  // Editable recognized text. Seeded from OCR, kept in a ref for the textarea.
  const [draft, setDraft] = useState('');
  const [activeAction, setActiveAction] = useState<RefineAction | null>(null);
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const lastAction = useRef<RefineAction | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync the editable draft when a fresh OCR result lands.
  useEffect(() => {
    if (status === 'success') setDraft(text);
  }, [status, text]);

  // Reset transient AI state each time the panel opens/closes.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setActiveAction(null);
      setAiResult('');
      setAiLoading(false);
      setAiError(null);
      setCopied(false);
      lastAction.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  const runAction = useCallback(
    async (key: RefineAction) => {
      lastAction.current = key;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setActiveAction(key);
      setAiLoading(true);
      setAiResult('');
      setAiError(null);
      setCopied(false);
      try {
        const out = await refine(key, draft, controller.signal);
        if (lastAction.current !== key) return; // superseded
        setAiResult(out);
      } catch (err) {
        if (controller.signal.aborted) return;
        setAiError(err instanceof Error ? err.message : 'Refinement failed.');
      } finally {
        if (lastAction.current === key) setAiLoading(false);
      }
    },
    [draft],
  );

  // One-tap actions from the selection toolbar: once OCR succeeds and the draft
  // is seeded, auto-run the requested action a single time per open.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (!open) {
      autoRanRef.current = false;
      return;
    }
    if (autoAction && status === 'success' && draft && !autoRanRef.current) {
      autoRanRef.current = true;
      void runAction(autoAction);
    }
  }, [open, autoAction, status, draft, runAction]);

  const regenerate = useCallback(() => {
    if (lastAction.current) void runAction(lastAction.current);
  }, [runAction]);

  const copyResult = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(aiResult);
      setCopied(true);
    } catch {
      // Clipboard blocked — no-op.
    }
  }, [aiResult]);

  const replaceResult = useCallback(() => {
    setDraft(aiResult);
    setAiResult('');
    setActiveAction(null);
    setAiError(null);
  }, [aiResult]);

  if (!open) return null;

  return (
    <div
      className={[
        'absolute z-30 flex flex-col bg-bg-subtle shadow-pop',
        // Bottom sheet on mobile, right dock on desktop.
        'inset-x-0 bottom-0 max-h-[84vh] rounded-t-panel border-t border-border',
        'sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:max-h-none sm:w-[408px]',
        'sm:max-w-[calc(100vw-2rem)] sm:rounded-panel sm:border',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-brand-500/15 text-brand-300">
            <SparkleIcon size={13} />
          </span>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-eyebrow text-brand-700">
            Stylus AI
          </span>
        </div>
        <button
          type="button"
          aria-label="Close studio"
          onClick={onClose}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-white/[0.06] hover:text-ink-900"
        >
          <CloseIcon size={17} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
        {status === 'loading' && (
          <div className="flex items-center gap-2 py-2 text-sm text-ink-400">
            <SpinnerIcon size={16} />
            Recognizing handwriting…
          </div>
        )}

        {status === 'error' && (
          <p className="py-1 text-sm text-danger">{recognitionError}</p>
        )}

        {status === 'success' && (
          <>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-eyebrow text-ink-400">
              Recognized text
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              placeholder="No text recognized — type or edit here…"
              className="w-full resize-y rounded-lg border border-border bg-bg px-3.5 py-3 text-[15px] leading-relaxed text-ink-800 outline-none transition-colors focus:border-brand-500"
            />

            <p className="mb-2 mt-[18px] text-[10.5px] font-semibold uppercase tracking-eyebrow text-ink-400">
              Refine with Claude
            </p>
            <div className="flex flex-wrap gap-[7px]">
              {REFINE_ACTIONS.map((a) => {
                const active = activeAction === a.key;
                return (
                  <button
                    key={a.key}
                    type="button"
                    disabled={aiLoading || draft.trim().length === 0}
                    onClick={() => void runAction(a.key)}
                    className={[
                      'rounded-full border px-[13px] py-2 text-[13px] font-medium transition-colors',
                      'disabled:cursor-not-allowed disabled:opacity-40',
                      active
                        ? 'border-brand-500/60 bg-brand-500/15 text-brand-300'
                        : 'border-border-strong text-ink-700 hover:border-brand-500 hover:text-ink-900',
                    ].join(' ')}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>

            {aiLoading && (
              <div className="mt-[18px] rounded-lg border border-border bg-bg p-4">
                <div className="flex items-center gap-2 text-sm text-ink-400">
                  <SpinnerIcon size={15} />
                  <span>{refineLabel(activeAction ?? 'polish')}…</span>
                </div>
                <div className="mt-3.5 flex flex-col gap-2.5">
                  <Shimmer className="w-full" />
                  <Shimmer className="w-[92%]" />
                  <Shimmer className="w-[74%]" />
                </div>
              </div>
            )}

            {aiError && !aiLoading && (
              <div className="mt-[18px] rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
                {aiError}
                {lastAction.current && (
                  <button
                    type="button"
                    onClick={regenerate}
                    className="ml-2 underline underline-offset-2 hover:text-ink-900"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {!aiLoading && !aiError && aiResult.length > 0 && (
              <div className="mt-[18px] overflow-hidden rounded-lg border border-border bg-bg">
                <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
                  <span className="font-mono text-[10.5px] font-medium uppercase tracking-wide text-brand-300">
                    {refineLabel(activeAction ?? 'polish')}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      title="Regenerate"
                      onClick={regenerate}
                      className="flex items-center gap-1 rounded-full border border-border-strong px-2.5 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-ink-400 hover:text-ink-900"
                    >
                      <RegenIcon size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyResult()}
                      className="flex items-center gap-1 rounded-full border border-border-strong px-2.5 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-ink-400 hover:text-ink-900"
                    >
                      {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={replaceResult}
                      className="rounded-full bg-brand-500 px-[11px] py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-brand-600"
                    >
                      Replace
                    </button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap px-3.5 py-3.5 text-[15px] leading-relaxed text-ink-900">
                  {aiResult}
                </p>
              </div>
            )}

            <p className="mt-4 flex items-center gap-1.5 text-[11px] text-ink-400/80">
              <span className="h-[5px] w-[5px] rounded-full bg-brand-500" />
              Powered by Claude · runs on every device
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-[11px] animate-pulse rounded-md bg-bg-muted ${className}`}
    />
  );
}

function SparkleIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15l-1.7-4L6 9.3l4.3-1.7z" />
    </svg>
  );
}

function RegenIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 11-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
