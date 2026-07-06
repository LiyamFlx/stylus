import { useCallback, useEffect, useRef, useState } from 'react';
import type { Stroke } from '../types';
import { buildTimeline, frameAt, timelineLength } from '../lib/replay';
import { drawStroke, renderAll } from '../lib/render';
import { inkBounds } from '../lib/geometry';
import { CloseIcon, PlayIcon, StopIcon } from './icons';

interface ReplayOverlayProps {
  strokes: Stroke[];
  onClose: () => void;
}

const SPEEDS = [1, 2, 4] as const;

/**
 * Stroke replay player (Phase 3 item 6). Full-screen overlay with its own
 * canvas — playback never touches the live drawing surface or its caches.
 * Render-only: reads existing stroke data (startedAt + per-point t), no new
 * capture. The document is fitted to the overlay before playing.
 */
export function ReplayOverlay({ strokes, onClose }: ReplayOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [progress, setProgress] = useState(0);

  const timelineRef = useRef(buildTimeline(strokes));
  const totalRef = useRef(timelineLength(timelineRef.current));
  const clockRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const paintFrame = useCallback((t: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    // Fit the whole drawing into the overlay (replay is a presentation, the
    // live view transform is irrelevant here). Full bounds — never culled.
    const b = inkBounds(strokes);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (b) {
      const pad = 24;
      const scale = Math.min(
        (w - pad * 2) / Math.max(b.maxX - b.minX, 1),
        (h - pad * 2) / Math.max(b.maxY - b.minY, 1),
        1.5,
      );
      const ox = (w - (b.maxX - b.minX) * scale) / 2 - b.minX * scale;
      const oy = (h - (b.maxY - b.minY) * scale) / 2 - b.minY * scale;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
    }

    const frame = frameAt(timelineRef.current, t);
    renderAll(ctx, frame.complete, w, h, { cull: null });
    if (frame.partial) drawStroke(ctx, frame.partial);
  }, [strokes]);

  // Playback loop.
  useEffect(() => {
    let raf: number;
    const tick = (now: number) => {
      if (playingRef.current) {
        const last = lastTickRef.current ?? now;
        clockRef.current = Math.min(
          clockRef.current + (now - last) * speedRef.current,
          totalRef.current,
        );
        paintFrame(clockRef.current);
        setProgress(totalRef.current > 0 ? clockRef.current / totalRef.current : 1);
        if (clockRef.current >= totalRef.current) setPlaying(false);
      }
      lastTickRef.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paintFrame]);

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const restart = useCallback(() => {
    clockRef.current = 0;
    setPlaying(true);
  }, []);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-bg" role="dialog" aria-label="Stroke replay">
      <canvas ref={canvasRef} className="h-full w-full" />

      <div className="absolute inset-x-0 bottom-4 flex justify-center">
        <div className="flex items-center gap-2 rounded-full border border-border bg-bg-muted/85 px-3 py-1.5 shadow-pop backdrop-blur-pill">
          <button
            type="button"
            aria-label={playing ? 'Pause replay' : progress >= 1 ? 'Replay again' : 'Resume replay'}
            onClick={() => (progress >= 1 ? restart() : setPlaying((p) => !p))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-700 hover:bg-white/[0.06]"
          >
            {playing ? <StopIcon size={18} /> : <PlayIcon size={18} />}
          </button>

          <div className="h-1 w-40 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
            <div className="h-full bg-brand-500 transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>

          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-label={`Playback speed ${s}x`}
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={[
                'rounded-full px-2 py-1 font-mono text-[11px]',
                speed === s ? 'bg-brand-500/20 text-brand-300' : 'text-ink-400 hover:text-ink-900',
              ].join(' ')}
            >
              {s}x
            </button>
          ))}

          <button
            type="button"
            aria-label="Close replay"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-400 hover:bg-white/[0.06] hover:text-ink-900"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
