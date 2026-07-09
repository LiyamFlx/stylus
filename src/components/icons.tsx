/**
 * Minimal inline SVG icon set. Each icon inherits `currentColor` and fills the
 * given size box so it scales cleanly in the toolbar pill.
 */
interface IconProps {
  size?: number;
  className?: string;
}

function svgProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
}

export const PenIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </svg>
);

/** Small downward caret — a dropdown affordance (e.g. the pen-type picker). */
export const ChevronDownIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const EraserIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M20 20H7L3 16a2 2 0 010-3l9-9a2 2 0 013 0l5 5a2 2 0 010 3l-7 7" />
    <path d="M11 6l7 7" />
  </svg>
);

export const UndoIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h11a5 5 0 015 5v0a5 5 0 01-5 5H9" />
  </svg>
);

export const RedoIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9a5 5 0 00-5 5v0a5 5 0 005 5h6" />
  </svg>
);

export const TrashIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
  </svg>
);

export const TextIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M4 7V5h16v2" />
    <path d="M12 5v14" />
    <path d="M9 19h6" />
  </svg>
);

export const ImageIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

export const FileIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

export const PaperIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h8" />
  </svg>
);

export const CopyIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 012-2h8" />
  </svg>
);

export const CheckIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const TypeIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M4 7V4h16v3" />
    <path d="M9 20h6" />
    <path d="M12 4v16" />
  </svg>
);

export const PlusIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const EditIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

export const UserIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1" />
  </svg>
);

export const KeyboardIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
  </svg>
);

export const BackspaceIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M21 5H8L2 12l6 7h13a1 1 0 001-1V6a1 1 0 00-1-1z" />
    <path d="M17 9l-5 6M12 9l5 6" />
  </svg>
);

export const DocumentIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h5" />
  </svg>
);

export const MenuIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M3 12h18M3 6h18M3 18h18" />
  </svg>
);

export const CloseIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const SpinnerIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)} className={`animate-spin ${className ?? ''}`}>
    <path d="M21 12a9 9 0 11-6.219-8.56" />
  </svg>
);

export const LassoIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M7 3C4 3 2 5 2 8c0 4 3 6 6 8 1 .6 2 1.3 2 2" />
    <path d="M10 18c0 1.1 1.8 2 4 2s4-.9 4-2-1.8-2-4-2" />
    <path d="M21 8c0-3-2-5-5-5-2 0-3.5 1-4.5 2.5" />
    <path d="M12 10c-1 1.5-1.5 3-1 5" />
  </svg>
);

export const MusicIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

/** Speedometer — Learning Mode velocity audio-braking. */
export const GaugeIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M12 14a1 1 0 0 0 1-1l3-5-5 3a1 1 0 0 0 1 3z" />
    <path d="M4.5 18a8 8 0 1 1 15 0" />
  </svg>
);

export const PlayIcon = ({ size = 20, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <path d="M8 5v14l11-7z" />
  </svg>
);

export const StopIcon = ({ size = 20, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export const DuplicateIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    <path d="M12 11v4M10 13h4" />
  </svg>
);

export const SparkleIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15l-1.7-4L6 9.3l4.3-1.7z" />
    <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />
  </svg>
);

export const GlobeIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
  </svg>
);

export const LockIcon = ({ size = 20, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </svg>
);

export const UnlockIcon = ({ size = 20, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 017.7-1.5" />
  </svg>
);

export const FocusIcon = ({ size = 20, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M8 3H5a2 2 0 00-2 2v3" />
    <path d="M16 3h3a2 2 0 012 2v3" />
    <path d="M8 21H5a2 2 0 01-2-2v-3" />
    <path d="M16 21h3a2 2 0 002-2v-3" />
  </svg>
);

export const FolderIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  </svg>
);

/** Small rightward caret — collapsed-folder disclosure affordance. */
export const ChevronRightIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const SearchIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);
