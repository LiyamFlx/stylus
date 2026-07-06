import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hexToHsb, hsbToHex } from '../lib/color';
import type { HSB } from '../lib/color';

/** Chromium-only screen color sampler (not in lib.dom everywhere). */
interface EyeDropperResult { sRGBHex: string }
interface EyeDropperCtor { new (): { open: () => Promise<EyeDropperResult> } }

interface ColorWheelProps {
  color: string;
  onColorChange: (hex: string) => void;
  /** Called when the user finishes a wheel interaction — hook for saving to
   *  the per-doc custom palette. */
  onCommit?: (hex: string) => void;
}

const SIZE = 168;
const RING = 16; // hue ring thickness
const R_OUT = SIZE / 2;
const R_IN = R_OUT - RING;
/** Side of the inner saturation/brightness square. */
const SQ = Math.floor((R_IN - 6) * Math.SQRT2);
const SQ_OFF = (SIZE - SQ) / 2;

/**
 * HSB color wheel (Phase 3 item 3): hue ring + saturation/brightness square,
 * canvas-drawn. An alternate ColorPicker view — the swatch strip stays the
 * default; Notebook/Mobile never see this (palette override / minimal).
 */
export function ColorWheel({ color, onColorChange, onCommit }: ColorWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hsb, setHsb] = useState<HSB>(() => hexToHsb(color) ?? { h: 210, s: 0.8, b: 0.95 });
  const dragRef = useRef<'ring' | 'square' | null>(null);

  // External color changes (swatch click, eyedropper) resync the wheel.
  useEffect(() => {
    const next = hexToHsb(color);
    if (next) setHsb(next);
  }, [color]);

  const eyeDropperCtor = useMemo(
    () => (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper,
    [],
  );

  // Repaint the wheel bitmap when hue changes (ring is static; square depends
  // on hue).
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Hue ring.
    for (let deg = 0; deg < 360; deg += 2) {
      ctx.beginPath();
      ctx.strokeStyle = hsbToHex({ h: deg, s: 1, b: 1 });
      ctx.lineWidth = RING;
      const a0 = ((deg - 1.4) * Math.PI) / 180;
      const a1 = ((deg + 1.4) * Math.PI) / 180;
      ctx.arc(R_OUT, R_OUT, R_OUT - RING / 2, a0, a1);
      ctx.stroke();
    }

    // S/B square for the current hue: horizontal = saturation (white → hue),
    // vertical = brightness (top bright → bottom black).
    const base = hsbToHex({ h: hsb.h, s: 1, b: 1 });
    const gx = ctx.createLinearGradient(SQ_OFF, 0, SQ_OFF + SQ, 0);
    gx.addColorStop(0, '#ffffff');
    gx.addColorStop(1, base);
    ctx.fillStyle = gx;
    ctx.fillRect(SQ_OFF, SQ_OFF, SQ, SQ);
    const gy = ctx.createLinearGradient(0, SQ_OFF, 0, SQ_OFF + SQ);
    gy.addColorStop(0, 'rgba(0,0,0,0)');
    gy.addColorStop(1, '#000000');
    ctx.fillStyle = gy;
    ctx.fillRect(SQ_OFF, SQ_OFF, SQ, SQ);
  }, [hsb.h]);

  const apply = useCallback(
    (next: HSB) => {
      setHsb(next);
      onColorChange(hsbToHex(next));
    },
    [onColorChange],
  );

  const handlePoint = useCallback(
    (clientX: number, clientY: number, zone: 'ring' | 'square') => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (zone === 'ring') {
        const angle = (Math.atan2(y - R_OUT, x - R_OUT) * 180) / Math.PI;
        apply({ ...hsbRef.current, h: (angle + 360) % 360 });
      } else {
        const s = Math.min(1, Math.max(0, (x - SQ_OFF) / SQ));
        const b = 1 - Math.min(1, Math.max(0, (y - SQ_OFF) / SQ));
        apply({ ...hsbRef.current, s, b });
      }
    },
    [apply],
  );

  // Latest hsb for drag handlers without re-binding.
  const hsbRef = useRef(hsb);
  hsbRef.current = hsb;

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const dx = e.clientX - rect.left - R_OUT;
      const dy = e.clientY - rect.top - R_OUT;
      const r = Math.hypot(dx, dy);
      const zone = r >= R_IN - 2 && r <= R_OUT + 2 ? 'ring'
        : Math.abs(dx) <= SQ / 2 && Math.abs(dy) <= SQ / 2 ? 'square'
        : null;
      if (!zone) return;
      dragRef.current = zone;
      e.currentTarget.setPointerCapture(e.pointerId);
      handlePoint(e.clientX, e.clientY, zone);
    },
    [handlePoint],
  );

  const markers = useMemo(() => {
    const hueRad = (hsb.h * Math.PI) / 180;
    return {
      hue: {
        left: R_OUT + Math.cos(hueRad) * (R_OUT - RING / 2) - 5,
        top: R_OUT + Math.sin(hueRad) * (R_OUT - RING / 2) - 5,
      },
      sb: { left: SQ_OFF + hsb.s * SQ - 5, top: SQ_OFF + (1 - hsb.b) * SQ - 5 },
    };
  }, [hsb]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <canvas
          ref={canvasRef}
          role="slider"
          aria-label="Color wheel"
          aria-valuetext={color}
          style={{ width: SIZE, height: SIZE, touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={(e) => {
            if (dragRef.current) handlePoint(e.clientX, e.clientY, dragRef.current);
          }}
          onPointerUp={(e) => {
            if (!dragRef.current) return;
            dragRef.current = null;
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
            onCommit?.(hsbToHex(hsbRef.current));
          }}
        />
        {/* Markers */}
        <span aria-hidden className="pointer-events-none absolute h-[10px] w-[10px] rounded-full border-2 border-white shadow-soft" style={markers.hue} />
        <span aria-hidden className="pointer-events-none absolute h-[10px] w-[10px] rounded-full border-2 border-white shadow-soft" style={{ ...markers.sb, backgroundColor: color }} />
      </div>

      {eyeDropperCtor && (
        <button
          type="button"
          onClick={() => {
            void new eyeDropperCtor()
              .open()
              .then((r) => {
                onColorChange(r.sRGBHex);
                onCommit?.(r.sRGBHex);
              })
              .catch(() => { /* user dismissed */ });
          }}
          className="rounded-full border border-border-strong px-3 py-1 text-[11px] text-ink-400 transition-colors hover:border-ink-400 hover:text-ink-900"
        >
          Pick from screen
        </button>
      )}
    </div>
  );
}
