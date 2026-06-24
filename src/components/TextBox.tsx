import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { TextStyles, FontFamily } from '../types/extensions';
import { DEFAULT_TEXT_STYLES, FONT_FAMILY_CSS } from '../types/extensions';

const FONT_SIZES: TextStyles['fontSize'][] = [12, 16, 24, 36, 48];
const FONT_FAMILIES: { label: string; value: FontFamily }[] = [
  { label: 'Sans', value: 'inter' },
  { label: 'Mono', value: 'mono' },
  { label: 'Serif', value: 'serif' },
];

// Must match pen color presets in existing Toolbar
const COLOR_PRESETS = [
  '#fafafa', '#e76f2c', '#ef4444', '#f59e0b',
  '#22c55e', '#3b82f6', '#a855f7', '#ec4899',
];

interface TextBoxProps {
  position: { x: number; y: number };
  initialStyles?: TextStyles;
  onCommit: (text: string, styles: TextStyles) => void;
  onCancel: () => void;
}

export function TextBox({
  position,
  initialStyles = DEFAULT_TEXT_STYLES,
  onCommit,
  onCancel,
}: TextBoxProps): React.ReactElement {
  const [text, setText] = useState('');
  const [styles, setStyles] = useState<TextStyles>(initialStyles);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus textarea on mount
  useLayoutEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const updateStyle = <K extends keyof TextStyles>(
    key: K,
    value: TextStyles[K]
  ) => setStyles((prev) => ({ ...prev, [key]: value }));

  const commit = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      onCancel();
      return;
    }
    onCommit(trimmed, styles);
  }, [text, styles, onCommit, onCancel]);

  // Keyboard handling
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
        return;
      }
      // Shift+Enter → newline (default textarea behavior, no override needed)
    },
    [commit, onCancel]
  );

  // Click outside → commit
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        commit();
      }
    };
    // Delay so the triggering canvas click doesn't immediately commit
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [commit]);

  const fontCss = FONT_FAMILY_CSS[styles.fontFamily];

  return (
    <div
      ref={containerRef}
      className="absolute z-30 flex flex-col gap-1"
      style={{ left: position.x, top: position.y }}
    >
      {/* Mini toolbar */}
      <div className="flex items-center gap-1 bg-zinc-900/95 border border-zinc-700 rounded-lg px-2 py-1.5 shadow-xl backdrop-blur-sm">
        {/* Font size */}
        <select
          value={styles.fontSize}
          onChange={(e) =>
            updateStyle(
              'fontSize',
              Number(e.target.value) as TextStyles['fontSize']
            )
          }
          className="bg-zinc-800 text-zinc-200 text-xs rounded px-1 py-0.5 border border-zinc-700 cursor-pointer"
          aria-label="Font size"
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>

        {/* Bold */}
        <button
          onClick={() => updateStyle('bold', !styles.bold)}
          className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
            styles.bold
              ? 'bg-brand-500 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
          aria-label="Bold"
          aria-pressed={styles.bold}
        >
          B
        </button>

        {/* Font family */}
        <div className="flex gap-0.5">
          {FONT_FAMILIES.map((f) => (
            <button
              key={f.value}
              onClick={() => updateStyle('fontFamily', f.value)}
              className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                styles.fontFamily === f.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
              aria-label={f.label}
              aria-pressed={styles.fontFamily === f.value}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-zinc-700 mx-0.5" />

        {/* Color swatches */}
        <div className="flex gap-0.5">
          {COLOR_PRESETS.map((color) => (
            <button
              key={color}
              onClick={() => updateStyle('color', color)}
              className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${
                styles.color === color
                  ? 'border-white scale-110'
                  : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Color ${color}`}
              aria-pressed={styles.color === color}
            />
          ))}
        </div>
      </div>

      {/* Text input */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder="Type here… (Enter to place, Esc to cancel)"
        className="
          min-w-[200px] max-w-[480px] resize-none overflow-hidden
          bg-zinc-900/80 border border-zinc-600 rounded-lg
          px-3 py-2 text-zinc-100 placeholder-zinc-500
          outline-none focus:border-brand-500
          shadow-xl backdrop-blur-sm
          transition-[border-color]
        "
        style={{
          fontSize: `${styles.fontSize}px`,
          fontFamily: fontCss,
          fontWeight: styles.bold ? 700 : 400,
          color: styles.color,
          lineHeight: 1.4,
        }}
        // Auto-grow height
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight}px`;
        }}
        aria-label="Text input"
        spellCheck
      />

      {/* Hint */}
      <p className="text-zinc-600 text-[10px] pl-1 select-none">
        Enter to place · Shift+Enter for new line · Esc to cancel
      </p>
    </div>
  );
}
