/**
 * CipherSheet background animation — Canvas 2D implementation.
 *
 * Renders everything to a single <canvas> element: no per-particle DOM nodes,
 * no CSS variable mutations. The lock icon is drawn with canvas paths;
 * lock/unlock transitions are lerped in JS.
 *
 * Usage:
 *   const anim = mountCipherAnimation(element);
 *   anim.destroy(); // stop and remove
 *
 * Optional second argument (all fields optional):
 *   mountCipherAnimation(element, {
 *     particleCount: 72,
 *     palette: {
 *       primary:   [14, 128, 64],   // RGB for green particles / glows
 *       dark:      [3, 44, 54],     // RGB for dark-teal accents
 *       secondary: [92, 190, 127],  // RGB for conic secondary sweep
 *     },
 *   });
 */
export function mountCipherAnimation(element, options = {}) {
  const COUNT     = options.particleCount ?? 72;
  const primary   = options.palette?.primary   ?? [14, 128, 64];
  const dark      = options.palette?.dark       ?? [3, 44, 54];
  const secondary = options.palette?.secondary  ?? [92, 190, 127]; // used for glow gradient

  const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

  // ── Ensure the element is a positioning context ───────────────────────────
  if (getComputedStyle(element).position === 'static') element.style.position = 'relative';

  // ── Canvas setup ──────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    position: 'absolute', inset: '0',
    width: '100%', height: '100%',
    pointerEvents: 'none',
    zIndex: '0',
  });
  canvas.setAttribute('aria-hidden', 'true');
  element.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let dpr = window.devicePixelRatio || 1;
  let W = 0, H = 0;

  // Declared before resize so resize can update it
  const pointer = { x: 0, y: 0, active: false };

  const resize = () => {
    dpr = window.devicePixelRatio || 1;
    W   = element.clientWidth;
    H   = element.clientHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!pointer.active) { pointer.x = W / 2; pointer.y = H * 0.46; }
  };
  resize();

  // ── Particle data — positions in CSS px, same as the CSS version ─────────
  const particles = Array.from({ length: COUNT }, () => ({
    bit:         Math.random() > 0.5 ? '1' : '0',
    x:           (Math.random() * 108 - 4) / 100 * W,
    y:           (Math.random() * 110 - 5) / 100 * H,
    vx:          Math.random() * 0.05 - 0.018,
    vy:          Math.random() * -0.02 - 0.01,
    phase:       Math.random() * Math.PI * 2,
    wobble:      Math.random() * 0.24 + 0.1,
    size:        Math.random() * 9 + 15,
    alpha:       Math.random() * 0.12 + 0.06,
    lockedAlpha: Math.random() * 0.14 + 0.20,
    lockT:       0,    // 0 = fully unlocked, 1 = fully locked
    value:       Math.random() > 0.5 ? '1' : '0',
  }));

  // ── Pointer tracking ──────────────────────────────────────────────────────
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const onPointerMove = (e) => {
    const rect  = element.getBoundingClientRect();
    pointer.x      = e.clientX - rect.left;
    pointer.y      = e.clientY - rect.top;
    pointer.active = true;
  };
  const onPointerLeave = () => {
    pointer.active = false;
    pointer.x      = W / 2;
    pointer.y      = H * 0.46;
  };

  element.addEventListener('pointermove',  onPointerMove);
  element.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('resize', resize);

  // ResizeObserver catches the element settling to its final size after layout,
  // which window 'resize' misses on initial load.
  const ro = new ResizeObserver(() => resize());
  ro.observe(element);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const wrap = (v, max, margin) => {
    if (v < -margin) return max + margin;
    if (v > max + margin) return -margin;
    return v;
  };

  const lerp = (a, b, t) => a + (b - a) * t;

  // Draw a lock icon centred at (0,0), sized to fit ~size px
  const drawLock = (ctx, size) => {
    const s   = size * 0.85;   // scale factor
    const bw  = s * 0.72;     // body width
    const bh  = s * 0.62;     // body height
    const br  = s * 0.18;     // body corner radius
    const sw  = s * 0.40;     // shackle width
    const sh  = s * 0.40;     // shackle height
    const lw  = s * 0.09;     // line width

    ctx.lineWidth = lw;

    // Shackle (arc above body)
    ctx.beginPath();
    ctx.arc(0, -bh * 0.5 - sh * 0.1, sw * 0.5, Math.PI, 0);
    ctx.stroke();

    // Body (rounded rectangle)
    const x = -bw * 0.5, y = -bh * 0.5 + sh * 0.08;
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, br);
    ctx.stroke();

    // Keyhole dot
    ctx.beginPath();
    ctx.arc(0, y + bh * 0.42, lw * 1.2, 0, Math.PI * 2);
    ctx.fill();
  };

  // ── Background layer (gradient + grid) — redrawn each frame ──────────────
  // These are cheap canvas ops; avoids a separate canvas or CSS pseudo-element.
  let driftAngle = 0;

  const drawBackground = (t) => {
    ctx.clearRect(0, 0, W, H);

    // Slow-drifting conic-ish glow (approximated with two radial gradients)
    driftAngle = prefersReduced ? 0 : (t * 0.012) % (Math.PI * 2);
    const driftX = W * (0.48 + Math.cos(driftAngle) * 0.04);
    const driftY = H * (0.47 + Math.sin(driftAngle) * 0.03);

    const g1 = ctx.createRadialGradient(driftX, driftY, 0, driftX, driftY, Math.min(W, H) * 0.68);
    g1.addColorStop(0,   rgba(primary, 0.09));
    g1.addColorStop(0.4, rgba(secondary, 0.045));
    g1.addColorStop(1,   rgba(dark, 0));
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);

    // Corner accents
    const g2 = ctx.createRadialGradient(W * 0.12, H * 0.08, 0, W * 0.12, H * 0.08, W * 0.42);
    g2.addColorStop(0,   rgba(primary, 0.08));
    g2.addColorStop(1,   rgba(primary, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);

    const g3 = ctx.createRadialGradient(W * 0.92, H * 0.92, 0, W * 0.92, H * 0.92, W * 0.42);
    g3.addColorStop(0,   rgba(dark, 0.06));
    g3.addColorStop(1,   rgba(dark, 0));
    ctx.fillStyle = g3;
    ctx.fillRect(0, 0, W, H);

    // Pointer glow
    if (pointer.active) {
      const r  = Math.min(W, H) * 0.26;
      const gp = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, r);
      gp.addColorStop(0,   rgba(primary, 0.12));
      gp.addColorStop(1,   rgba(primary, 0));
      ctx.fillStyle = gp;
      ctx.fillRect(0, 0, W, H);
    }

    // Grid overlay
    const breathe = prefersReduced ? 0.24 : 0.24 + Math.sin(t * 0.077) * 0.055;
    const gridSize = 36;
    const offX = pointer.active ? pointer.x * -0.018 : 0;
    const offY = pointer.active ? pointer.y * -0.018 : 0;

    ctx.save();
    ctx.globalAlpha = breathe;
    ctx.strokeStyle = rgba(primary, 0.13);
    ctx.lineWidth   = 1 / dpr;  // physical 1px

    ctx.beginPath();
    for (let x = (offX % gridSize + gridSize) % gridSize; x <= W; x += gridSize) {
      ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    for (let y = (offY % gridSize + gridSize) % gridSize; y <= H; y += gridSize) {
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();
    ctx.restore();
  };

  // ── RAF loop ──────────────────────────────────────────────────────────────
  const LOCK_SPEED   = 0.065;  // lerp rate toward locked state per frame
  const UNLOCK_SPEED = 0.045;

  let raf = 0;
  const render = (time) => {
    const t      = time * 0.001;
    const radius = pointer.active ? Math.min(W, H) * 0.26 : 0;

    drawBackground(t);

    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    for (const p of particles) {
      if (!prefersReduced) {
        p.x += p.vx * 16 + Math.sin(t * 0.42 + p.phase) * p.wobble * 0.045;
        p.y += p.vy * 16 + Math.cos(t * 0.36 + p.phase) * p.wobble * 0.035;
        p.x = wrap(p.x, W, 28);
        p.y = wrap(p.y, H, 28);
      }

      const dx       = p.x - pointer.x;
      const dy       = p.y - pointer.y;
      const dist     = Math.hypot(dx, dy);
      const influence = radius > 0 ? Math.max(0, 1 - dist / radius) : 0;
      const targetT   = influence > 0.18 ? 1 : 0;

      const speed   = targetT > p.lockT ? LOCK_SPEED : UNLOCK_SPEED;
      const prevT   = p.lockT;
      p.lockT       = prefersReduced ? targetT : lerp(p.lockT, targetT, speed);

      // Flip the bit shortly after fully unlocking
      if (prevT > 0.1 && p.lockT < 0.05 && Math.random() < 0.34) {
        p.value = p.value === '0' ? '1' : '0';
      }

      const angle  = Math.atan2(dy || 0.001, dx || 0.001);
      const repel  = influence * 7;
      const drawX  = p.x + Math.cos(angle) * repel;
      const drawY  = p.y + Math.sin(angle) * repel;
      const scale  = 1 + influence * 0.34;
      const rot    = Math.sin(t * 0.24 + p.phase) * (Math.PI / 60);  // ~3 deg

      ctx.save();
      ctx.translate(drawX, drawY);
      ctx.rotate(rot);
      ctx.scale(scale, scale);

      // Interpolate colour between dark (unlocked) and primary (locked)
      const r = Math.round(lerp(dark[0], primary[0], p.lockT));
      const g = Math.round(lerp(dark[1], primary[1], p.lockT));
      const b = Math.round(lerp(dark[2], primary[2], p.lockT));
      const alpha = (p.alpha + influence * 0.13) * 0.78;
      ctx.fillStyle   = `rgba(${r},${g},${b},${alpha})`;
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;

      if (p.lockT < 0.98) {
        // Draw digit
        ctx.globalAlpha = 1 - p.lockT;
        ctx.font = `650 ${p.size}px "Roboto Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace`;
        ctx.fillText(p.value, 0, 0);
      }

      if (p.lockT > 0.02) {
        // Draw lock icon
        ctx.globalAlpha = p.lockT;
        ctx.translate(0, 1);
        drawLock(ctx, p.size);
      }

      ctx.restore();
    }

    ctx.restore();
    raf = requestAnimationFrame(render);
  };

  raf = requestAnimationFrame(render);

  // ── Teardown ──────────────────────────────────────────────────────────────
  return {
    destroy() {
      cancelAnimationFrame(raf);
      element.removeEventListener('pointermove',  onPointerMove);
      element.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', resize);
      ro.disconnect();
      canvas.remove();
    },
  };
}
