// ─── Toolbar.tsx PATCH ───────────────────────────────────────────────────────
// Add these imports and the <InputMethodGroup /> component to your Toolbar.tsx.
// Insert <InputMethodGroup /> in the toolbar pill between existing tools and
// the convert/export buttons.
//
// Layout target:
//   [pen][eraser][undo][redo] | [T][scanner][stylus] | [convert][export]
// ─────────────────────────────────────────────────────────────────────────────

import type { UseTextToolReturn } from '../hooks/useTextTool';
import type { UseScanmarkerScannerReturn } from '../hooks/useScanmarkerScanner';
import type { UseBluetoothStylusReturn } from '../hooks/useBluetoothStylus';

// ─── Icon components (inline SVG, 20×20, 2px stroke, Lucide-style) ────────────

function IconText(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4 5h12M10 5v10M7 15h6" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconScanner(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3" y="7" width="14" height="6" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M6 10h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 4h3M14 4h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconStylus(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M14 3L17 6L8 15L4 16L5 12L14 3Z" stroke="currentColor"
        strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconBattery({ level }: { level: number }): React.ReactElement {
  const isLow = level < 20;
  return (
    <span
      className={`text-[10px] font-mono tabular-nums ${isLow ? 'text-amber-400' : 'text-zinc-400'}`}
      title={`Battery: ${level}%`}
    >
      {level}%
    </span>
  );
}

// ─── Shared toolbar button ─────────────────────────────────────────────────────

interface ToolbarBtnProps {
  label: string;
  tooltip: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: React.ReactNode;
  pulse?: boolean;
  danger?: boolean;
}

function ToolbarBtn({
  label, tooltip, active, onClick, children, badge, pulse, danger,
}: ToolbarBtnProps): React.ReactElement {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        aria-label={label}
        title={tooltip}
        className={`
          relative w-8 h-8 flex items-center justify-center rounded-lg
          transition-colors duration-150
          ${active
            ? 'text-brand-500 bg-brand-500/10'
            : danger
              ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60'
          }
          ${pulse ? 'animate-pulse' : ''}
        `}
      >
        {children}
        {badge && (
          <span className="absolute -top-1 -right-1">{badge}</span>
        )}
      </button>
    </div>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

function Divider(): React.ReactElement {
  return <div className="w-px h-5 bg-zinc-700 mx-0.5 shrink-0" />;
}

// ─── Input Method Group ────────────────────────────────────────────────────────
// Drop this component into Toolbar.tsx and render it in the pill.

interface InputMethodGroupProps {
  textTool: UseTextToolReturn;
  scanner: UseScanmarkerScannerReturn;
  stylus: UseBluetoothStylusReturn;
}

export function InputMethodGroup({
  textTool,
  scanner,
  stylus,
}: InputMethodGroupProps): React.ReactElement {
  return (
    <>
      <Divider />

      {/* T — Text tool (always visible) */}
      <ToolbarBtn
        label="Text tool"
        tooltip={textTool.isActive ? 'Click canvas to place text (Esc to cancel)' : 'Type text onto canvas (T)'}
        active={textTool.isActive}
        onClick={() => textTool.isActive ? textTool.deactivate() : textTool.activate()}
      >
        <IconText />
      </ToolbarBtn>

      {/* Scanner — WebHID only; hidden if unsupported */}
      {scanner.isWebHIDAvailable && (
        <ScannerButton scanner={scanner} />
      )}

      {/* Stylus — Web Bluetooth only; hidden if unsupported */}
      {stylus.isWebBluetoothAvailable && (
        <StylusButton stylus={stylus} />
      )}

      <Divider />
    </>
  );
}

// ─── Scanner button ────────────────────────────────────────────────────────────

function ScannerButton({
  scanner,
}: {
  scanner: UseScanmarkerScannerReturn;
}): React.ReactElement {
  const handleClick = () => {
    if (scanner.isConnected) {
      scanner.toggleScanMode();
    } else {
      scanner.connect();
    }
  };

  const tooltip = (() => {
    if (!scanner.isConnected) return 'Connect Scanmarker';
    const name = scanner.deviceName ?? 'Scanmarker';
    const bat = scanner.battery !== null ? ` · ${scanner.battery}%` : '';
    if (scanner.isScanning) return `Scanning…${bat}`;
    return `${name}${bat} · Click to toggle scan mode`;
  })();

  return (
    <ToolbarBtn
      label="Scanmarker scanner"
      tooltip={tooltip}
      active={scanner.isConnected}
      pulse={scanner.isScanning}
      onClick={handleClick}
    >
      <IconScanner />
      {scanner.battery !== null && scanner.isConnected && (
        <IconBattery level={scanner.battery} />
      )}
    </ToolbarBtn>
  );
}

// ─── Stylus button ─────────────────────────────────────────────────────────────

function StylusButton({
  stylus,
}: {
  stylus: UseBluetoothStylusReturn;
}): React.ReactElement {
  const handleClick = () => {
    if (stylus.isConnected) {
      stylus.disconnect();
    } else {
      stylus.connect();
    }
  };

  const tooltip = (() => {
    if (!stylus.isConnected) return 'Connect Bluetooth Stylus';
    const name = stylus.deviceName ?? 'Stylus Pen';
    const bat = stylus.battery !== null ? ` · ${stylus.battery}%` : '';
    return `${name}${bat}${stylus.isLowBattery ? ' ⚠ Low battery' : ''}`;
  })();

  return (
    <ToolbarBtn
      label="Bluetooth stylus pen"
      tooltip={tooltip}
      active={stylus.isConnected}
      danger={stylus.isLowBattery && stylus.isConnected}
      onClick={handleClick}
    >
      <IconStylus />
      {stylus.isLowBattery && stylus.isConnected && (
        <span className="absolute -top-1 -right-1 text-amber-400 text-[10px]">!</span>
      )}
    </ToolbarBtn>
  );
}
