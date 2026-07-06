import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface TextInputProxyHandle {
  focus: () => void;
}

interface TextInputProxyProps {
  /** Full text of the active text item (controlled). */
  value: string;
  /** Full-value replacement — IME composition, autocorrect, swipe-typing and
   *  emoji all reduce to "the textarea's value changed". */
  onChange: (next: string) => void;
  /** Escape → finish editing. */
  onDone: () => void;
}

/**
 * Hidden textarea that owns ALL text entry for canvas text items
 * (Phase 2 prerequisite).
 *
 * Replaces per-character `keydown` synthesis, which broke IME composition
 * (CJK), dead keys (é, ü), autocorrect, swipe-typing and emoji — and which
 * mobile virtual keyboards often don't trigger at all. With a real focused
 * textarea the browser handles composition, and focusing it is what summons
 * the native OS keyboard on phones.
 *
 * Visually hidden but NOT display:none/visibility:hidden — those block focus,
 * and no focus means no mobile keyboard.
 */
export const TextInputProxy = forwardRef<TextInputProxyHandle, TextInputProxyProps>(
  function TextInputProxy({ value, onChange, onDone }, ref) {
    const el = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(
      ref,
      () => ({ focus: () => el.current?.focus({ preventScroll: true }) }),
      [],
    );

    // Autofocus on mount; the parent remounts this (keyed by text-item id) so
    // each newly placed/selected box summons the keyboard.
    useEffect(() => {
      el.current?.focus({ preventScroll: true });
    }, []);

    return (
      <textarea
        ref={el}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onDone();
          }
          // Enter inserts a newline natively — no synthesis.
        }}
        aria-label="Type into the selected text box"
        data-testid="text-input-proxy"
        autoCapitalize="sentences"
        spellCheck={false}
        rows={1}
        className="fixed bottom-24 left-1/2 z-0 h-px w-px -translate-x-1/2 resize-none border-0 bg-transparent p-0 opacity-0"
      />
    );
  },
);
