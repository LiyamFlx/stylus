const COLORS = ['#e76f2c', '#fa9f70', '#ffe3d0', '#fdc4a0'];

/**
 * Fire a one-shot confetti burst from a screen point (defaults to center).
 * Dependency-free: appends absolutely-positioned particles to <body>, animates
 * them with rAF under gravity, and removes them after ~1.6s. No-op outside the
 * browser.
 */
export function fireConfetti(originX?: number, originY?: number, count = 90): void {
  if (typeof document === 'undefined') return;
  const cx = originX ?? window.innerWidth / 2;
  const cy = originY ?? window.innerHeight / 2;

  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden;';
  document.body.appendChild(container);

  interface P {
    el: HTMLElement;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rot: number;
    vr: number;
  }
  const particles: P[] = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const size = 6 + Math.random() * 6;
    el.style.cssText = `position:absolute;width:${size}px;height:${size * 0.6}px;background:${COLORS[i % COLORS.length]};border-radius:1px;will-change:transform;`;
    container.appendChild(el);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 6 + Math.random() * 9;
    particles.push({
      el,
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 20,
    });
  }

  const gravity = 0.35;
  const start = performance.now();
  function frame(now: number): void {
    const elapsed = now - start;
    for (const p of particles) {
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg)`;
    }
    if (elapsed < 1600) {
      requestAnimationFrame(frame);
    } else {
      container.remove();
    }
  }
  requestAnimationFrame(frame);
}
