import { useState } from 'react';
import { BackspaceIcon } from './icons';

interface OnScreenKeyboardProps {
  onInput: (text: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  onClose: () => void;
}

const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const ROW_1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const ROW_2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
const ROW_3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];
const PUNCTUATION = ['.', ',', '?', '!', "'"];

/**
 * A tap-able QWERTY keyboard for typing text onto the canvas. Driven entirely
 * by pointer taps so it works on touch devices without a hardware keyboard.
 * `onMouseDown`/`preventDefault` keeps focus on the canvas so taps don't blur
 * the active text box.
 */
export function OnScreenKeyboard({
  onInput,
  onBackspace,
  onEnter,
  onClose,
}: OnScreenKeyboardProps) {
  const [shift, setShift] = useState(false);

  const press = (char: string) => {
    onInput(shift ? char.toUpperCase() : char);
  };

  const Key = ({
    label,
    onPress,
    grow = false,
    wide = false,
    active = false,
    ariaLabel,
  }: {
    label: React.ReactNode;
    onPress: () => void;
    grow?: boolean;
    wide?: boolean;
    active?: boolean;
    ariaLabel?: string;
  }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      // Prevent the tap from stealing focus / blurring the text box.
      onPointerDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={[
        'flex h-11 items-center justify-center rounded-md text-sm font-medium transition-colors select-none',
        grow ? 'flex-1' : 'min-w-[8.5%] flex-1',
        wide ? 'px-4' : '',
        active
          ? 'bg-brand-500 text-white'
          : 'bg-bg-muted text-ink-900 hover:bg-white/[0.08] active:bg-white/[0.12]',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <div
      role="group"
      aria-label="On-screen keyboard"
      className="pointer-events-auto w-full max-w-2xl rounded-panel border border-border bg-bg-subtle/95 p-2 shadow-pop backdrop-blur-pill"
    >
      <div className="mb-1 flex justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-brand-700">
          Keyboard
        </span>
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={onClose}
          className="text-[12px] font-medium text-ink-400 hover:text-ink-900"
        >
          Done
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex gap-1">
          {NUMBER_ROW.map((k) => (
            <Key key={k} label={k} onPress={() => press(k)} />
          ))}
        </div>
        <div className="flex gap-1">
          {ROW_1.map((k) => (
            <Key key={k} label={shift ? k.toUpperCase() : k} onPress={() => press(k)} />
          ))}
        </div>
        <div className="flex gap-1 px-[5%]">
          {ROW_2.map((k) => (
            <Key key={k} label={shift ? k.toUpperCase() : k} onPress={() => press(k)} />
          ))}
        </div>
        <div className="flex gap-1">
          <Key
            label="⇧"
            ariaLabel="Shift"
            active={shift}
            onPress={() => setShift((s) => !s)}
            wide
          />
          {ROW_3.map((k) => (
            <Key key={k} label={shift ? k.toUpperCase() : k} onPress={() => press(k)} />
          ))}
          <Key
            label={<BackspaceIcon size={18} />}
            ariaLabel="Backspace"
            onPress={onBackspace}
            wide
          />
        </div>
        <div className="flex gap-1">
          {PUNCTUATION.map((k) => (
            <Key key={k} label={k} onPress={() => onInput(k)} />
          ))}
          <Key label="space" ariaLabel="Space" onPress={() => onInput(' ')} grow />
          <Key label="return" ariaLabel="Return" onPress={onEnter} wide />
        </div>
      </div>
    </div>
  );
}
