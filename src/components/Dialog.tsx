import { useEffect, useRef, useState } from 'react';
import { buzz } from '../lib/haptics';
import { TrashIcon } from './icons';

/**
 * In-app modal dialogs that match the Stylus dark theme, replacing the
 * browser-native `window.confirm` / `window.prompt` (which can't be styled).
 *
 * Both share a centered card on a dimmed backdrop, focus the primary action /
 * input on open, close on Escape, and confirm on Enter.
 */

interface Backdrop {
  onClose: () => void;
  children: React.ReactNode;
  labelledBy: string;
}

function Backdrop({ onClose, children, labelledBy }: Backdrop) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />
      <div className="relative w-full max-w-sm rounded-panel border border-border bg-bg-subtle p-5 shadow-pop">
        {children}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Render the confirm button in the danger style (e.g. for deletes). */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <Backdrop onClose={onCancel} labelledBy="confirm-title">
      <div className="flex items-start gap-3">
        <span
          className={[
            'mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg',
            danger ? 'bg-danger/15 text-danger' : 'bg-brand-500/15 text-brand-300',
          ].join(' ')}
        >
          <TrashIcon size={17} />
        </span>
        <div className="min-w-0">
          <h2 id="confirm-title" className="text-[15px] font-semibold text-ink-900">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-400">{message}</p>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-white/[0.06]"
        >
          {cancelLabel}
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={() => {
            if (danger) buzz(); // Android haptic tick; silent no-op elsewhere
            onConfirm();
          }}
          className={[
            'rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors',
            danger ? 'bg-danger hover:bg-danger/90' : 'bg-brand-500 hover:bg-brand-600',
          ].join(' ')}
        >
          {confirmLabel}
        </button>
      </div>
    </Backdrop>
  );
}

interface PromptDialogProps {
  open: boolean;
  title: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Called with the trimmed value when confirmed (only if non-empty). */
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  open,
  title,
  initialValue = '',
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reseed the field each time the dialog opens.
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      // Defer focus+select until the input is mounted.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open, initialValue]);

  if (!open) return null;

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
    else onCancel();
  };

  return (
    <Backdrop onClose={onCancel} labelledBy="prompt-title">
      <h2 id="prompt-title" className="text-[15px] font-semibold text-ink-900">
        {title}
      </h2>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        className="mt-3 w-full rounded-lg border border-border bg-bg-muted px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500"
      />
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-white/[0.06]"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={submit}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
        >
          {confirmLabel}
        </button>
      </div>
    </Backdrop>
  );
}
