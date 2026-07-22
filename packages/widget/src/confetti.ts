/**
 * Dependency-free canvas confetti for the CONGRATULATIONS moment. Honors
 * prefers-reduced-motion and the white-label confetti-display token (the
 * caller checks the token; we check the media query).
 */
export function burstConfetti(host: HTMLElement, colors: string[]): void {
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  });
  host.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  const scale = Math.min(devicePixelRatio || 1, 2);
  canvas.width = host.clientWidth * scale;
  canvas.height = host.clientHeight * scale;
  ctx.scale(scale, scale);

  interface Bit {
    x: number;
    y: number;
    vx: number;
    vy: number;
    w: number;
    h: number;
    rot: number;
    vrot: number;
    color: string;
  }
  const w = host.clientWidth;
  const h = host.clientHeight;
  const bits: Bit[] = [];
  for (let i = 0; i < 120; i++) {
    bits.push({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.35,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 9 - 3,
      w: 4 + Math.random() * 5,
      h: 6 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.3,
      color: colors[i % colors.length],
    });
  }
  const started = performance.now();
  const tick = (now: number) => {
    const elapsed = now - started;
    ctx.clearRect(0, 0, w, h);
    for (const b of bits) {
      b.vy += 0.25; // gravity
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vrot;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 2600);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (elapsed < 2600) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}
