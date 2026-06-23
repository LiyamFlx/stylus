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
function StylusMark({ size = 28 }: { size?: number }) {
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

/** Top-left wordmark + subtitle. */
export function BrandHeader() {
  return (
    <header className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-1 select-none sm:left-6 sm:top-6">
      <div className="flex items-center gap-2.5">
        <StylusMark size={28} />
        <span className="text-[18px] font-semibold lowercase tracking-tight text-ink-900">
          stylus
        </span>
      </div>
      {/* Hidden until there's clearly room on the left of the centered toolbar
          pill, so the two never collide. */}
      <p className="ml-[38px] hidden text-[12px] leading-snug text-ink-400 2xl:block">
        Write every thought. On every device.
      </p>
    </header>
  );
}

/** Bottom-left product-family footer. */
export function BrandFooter() {
  return (
    <footer className="pointer-events-none absolute bottom-4 left-4 z-10 select-none sm:bottom-5 sm:left-6">
      <p className="text-[11px] tracking-tight text-ink-400/70">
        A Scanmarker product
      </p>
    </footer>
  );
}
