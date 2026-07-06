/**
 * Brand chrome matching the Scanmarker product family.
 *
 * - Wordmark: lowercase "stylus", font-semibold, tracking-tight (same treatment
 *   as the "scanmarker" wordmark — weight 600, ~18px, tight tracking).
 * - Mark: a brand-orange (#e76f2c) rounded square (rx=8) with a white glyph,
 *   echoing Scanmarker's "R" mark — here a pen nib for Stylus.
 * - Subtitle + "A Scanmarker product" footer in muted ink.
 *
 * These float over the canvas (pointer-events: none) so they never intercept
 * drawing. They read as product chrome, not UI controls.
 */

/** The orange app mark — a pen nib glyph on a rounded square. */
export function StylusMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Stylus"
      role="img"
    >
      <rect width="32" height="32" rx="8" fill="#e76f2c" />
      {/* Pen nib pointing down-left, white on orange. */}
      <path
        d="M21.5 8.5 13 17l-1.6 4.1 4.1-1.6 8.5-8.5a1.8 1.8 0 0 0 0-2.5l-.0 0a1.8 1.8 0 0 0-2.5 0Z"
        fill="white"
      />
      <path
        d="m11.4 21.1-1.2 3 3-1.2"
        stroke="white"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Bottom-left product-family footer. */
export function BrandFooter() {
  return (
    <footer className="pointer-events-none absolute bottom-4 left-4 z-10 flex items-center gap-2 select-none sm:bottom-5 sm:left-6">
      <StylusMark size={22} />
      <div className="flex flex-col leading-none">
        <span className="text-[14px] font-semibold lowercase tracking-tight text-ink-700">
          stylus
        </span>
        <span className="mt-0.5 text-[10px] tracking-tight text-ink-400/70">
          A Scanmarker product
        </span>
      </div>
    </footer>
  );
}
