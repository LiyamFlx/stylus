import type { RecognitionStatus } from '../hooks/useRecognition';
import { CloseIcon, SpinnerIcon } from './icons';

interface TextPanelProps {
  open: boolean;
  status: RecognitionStatus;
  text: string;
  error: string | null;
  onClose: () => void;
}

/**
 * Slide-up panel anchored to the bottom of the viewport showing the result of
 * handwriting recognition. Renders nothing when closed so it never blocks
 * pointer events to the canvas.
 */
export function TextPanel({ open, status, text, error, onClose }: TextPanelProps) {
  if (!open) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-3">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-panel p-4 shadow-2xl backdrop-blur-pill">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Recognized text
          </h2>
          <button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-300 hover:bg-white/10"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {status === 'loading' && (
          <div className="flex items-center gap-2 py-2 text-sm text-zinc-300">
            <SpinnerIcon size={16} />
            Recognizing…
          </div>
        )}

        {status === 'error' && (
          <p className="py-1 text-sm text-red-400">{error}</p>
        )}

        {status === 'success' &&
          (text.length > 0 ? (
            <p className="select-text whitespace-pre-wrap break-words text-base leading-relaxed text-zinc-50">
              {text}
            </p>
          ) : (
            <p className="py-1 text-sm text-zinc-400">
              No text was recognized. Try writing more clearly.
            </p>
          ))}
      </div>
    </div>
  );
}
