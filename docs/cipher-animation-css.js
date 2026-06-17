/**
 * CipherSheet background animation — CSS/DOM implementation.
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
  const COUNT   = options.particleCount ?? 72;
  const primary   = options.palette?.primary   ?? [14, 128, 64];
  const dark      = options.palette?.dark       ?? [3, 44, 54];
  const secondary = options.palette?.secondary  ?? [92, 190, 127];

  const rgb  = (c) => c.join(', ');
  const rgba = (c, a) => `rgba(${rgb(c)}, ${a})`;

  // ── Ensure the element is a positioning context ──────────────────────────
  const existingPos = getComputedStyle(element).position;
  if (existingPos === 'static') element.style.position = 'relative';

  // ── Inject scoped stylesheet ──────────────────────────────────────────────
  const uid  = `csa-${Math.random().toString(36).slice(2, 8)}`;
  const sel  = `.${uid}`;
  const style = document.createElement('style');
  style.textContent = `
    ${sel} {
      --mx: 50%; --my: 46%;
      position: absolute; inset: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
      background:
        radial-gradient(circle 180px at var(--mx) var(--my), ${rgba(primary, .145)}, transparent 64%),
        radial-gradient(circle 260px at 12% 8%,  ${rgba(primary, .10)},  transparent 58%),
        radial-gradient(circle 260px at 92% 92%, ${rgba(dark,    .075)}, transparent 56%);
    }

    ${sel}::before {
      content: "";
      position: absolute; inset: -36%;
      opacity: .48;
      filter: blur(28px);
      background: conic-gradient(
        from 120deg at 48% 48%,
        ${rgba(primary,   0)},
        ${rgba(primary,   .22)},
        ${rgba(secondary, .15)},
        ${rgba(dark,      .12)},
        ${rgba(primary,   0)}
      );
      transform-origin: 52% 47%;
      animation: ${uid}-drift 20s cubic-bezier(.45,0,.2,1) infinite alternate;
    }

    ${sel}::after {
      content: "";
      position: absolute; inset: 0;
      opacity: .24;
      background-image:
        linear-gradient(${rgba(primary, .13)} 1px, transparent 1px),
        linear-gradient(90deg, ${rgba(primary, .13)} 1px, transparent 1px),
        linear-gradient(135deg, transparent 46%, ${rgba(dark, .04)} 48%, ${rgba(dark, .04)} 52%, transparent 54%);
      background-size: 36px 36px, 36px 36px, 72px 72px;
      background-position:
        calc(var(--mx) * -.018) calc(var(--my) * -.018),
        calc(var(--mx) * -.018) calc(var(--my) * -.018),
        center;
      animation: ${uid}-breathe 13s ease-in-out infinite;
    }

    ${sel} .csa-particle {
      position: absolute; left: 0; top: 0;
      width: 18px; height: 18px;
      display: grid; place-items: center;
      color: ${rgba(dark, 1)};
      font-family: "Roboto Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace;
      font-size: var(--size);
      font-weight: 650;
      line-height: 1;
      user-select: none;
      transform: translate3d(var(--x), var(--y), 0) rotate(var(--rot)) scale(var(--scale));
      opacity: calc(var(--alpha) / 1);
      will-change: transform, opacity;
      transition: color 650ms ease;
    }

    ${sel} .csa-particle.locked {
      color: ${rgba(primary, 1)};
    }

    ${sel} .csa-bit,
    ${sel} .csa-lock {
      grid-area: 1 / 1;
      transition: opacity 650ms ease, transform 650ms cubic-bezier(.2,.8,.2,1);
    }

    ${sel} .csa-particle.locked .csa-bit {
      opacity: 0;
      transform: translateY(-3px) scale(.72);
    }

    ${sel} .csa-lock {
      position: relative;
      width: 13px; height: 12px;
      border: 1.4px solid currentColor;
      border-radius: 3.5px;
      opacity: 0;
      transform: translateY(3px) scale(.68);
    }

    ${sel} .csa-particle.locked .csa-lock { opacity: 1; transform: translateY(0) scale(1); }

    ${sel} .csa-lock::before {
      content: "";
      position: absolute;
      left: 50%; bottom: 7px;
      width: 8px; height: 8px;
      border: 1.4px solid currentColor;
      border-bottom: 0;
      border-radius: 8px 8px 0 0;
      transform: translateX(-50%);
    }

    ${sel} .csa-lock::after {
      content: "";
      position: absolute;
      left: 50%; top: 4px;
      width: 2.5px; height: 4px;
      border-radius: 999px;
      background: currentColor;
      transform: translateX(-50%);
      opacity: .6;
    }

    @keyframes ${uid}-drift {
      0%   { transform: translate3d(-2%, -1%, 0) rotate(0deg)  scale(1);    }
      45%  { transform: translate3d( 2%,  1%, 0) rotate(42deg) scale(1.08); }
      100% { transform: translate3d(-1%,  2%, 0) rotate(78deg) scale(1.03); }
    }

    @keyframes ${uid}-breathe {
      0%,100% { transform: scale(1);     opacity: .19; }
      50%     { transform: scale(1.035); opacity: .30; }
    }

    @media (prefers-reduced-motion: reduce) {
      ${sel}::before, ${sel}::after,
      ${sel} .csa-particle, ${sel} .csa-bit, ${sel} .csa-lock {
        animation: none; transition: none;
      }
    }
  `;
  document.head.appendChild(style);

  // ── Build particle data ───────────────────────────────────────────────────
  const particles = Array.from({ length: COUNT }, (_, i) => ({
    bit:         Math.random() > 0.5 ? '1' : '0',
    x:           Math.random() * 108 - 4,   // % of bounds, resolved in render
    y:           Math.random() * 110 - 5,
    vx:          Math.random() * 0.05 - 0.018,
    vy:          Math.random() * -0.02 - 0.01,
    phase:       Math.random() * Math.PI * 2,
    wobble:      Math.random() * 0.24 + 0.1,
    size:        Math.random() * 9 + 15,
    alpha:       Math.random() * 0.12 + 0.06,
    lockedAlpha: Math.random() * 0.14 + 0.20,
    locked:      false,
    value:       Math.random() > 0.5 ? '1' : '0',
  }));

  // ── Build DOM ─────────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.setAttribute('aria-hidden', 'true');
  root.className = uid;

  const spanEls = particles.map((p, i) => {
    const span = document.createElement('span');
    span.className = 'csa-particle';
    span.style.cssText = `--x:0px;--y:0px;--size:${p.size}px;--alpha:${p.alpha};--scale:1;--rot:0deg`;
    const bit  = document.createElement('span');
    bit.className = 'csa-bit';
    bit.textContent = p.bit;
    const lock = document.createElement('span');
    lock.className = 'csa-lock';
    span.appendChild(bit);
    span.appendChild(lock);
    return span;
  });
  spanEls.forEach(s => root.appendChild(s));
  element.prepend(root);  // behind existing content

  // ── Pointer tracking ──────────────────────────────────────────────────────
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let bounds  = { width: element.clientWidth || 360, height: element.clientHeight || 520 };
  const pointer = { x: bounds.width / 2, y: bounds.height * 0.46, active: false };

  // Convert particle % coords to px now that we have bounds
  for (const p of particles) {
    p.x = (p.x / 100) * bounds.width;
    p.y = (p.y / 100) * bounds.height;
  }

  const onPointerMove = (e) => {
    const rect = element.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.active = true;
    root.style.setProperty('--mx', `${(pointer.x / rect.width)  * 100}%`);
    root.style.setProperty('--my', `${(pointer.y / rect.height) * 100}%`);
  };
  const onPointerLeave = () => {
    pointer.active = false;
    root.style.setProperty('--mx', '50%');
    root.style.setProperty('--my', '46%');
  };
  const onResize = () => {
    bounds.width  = element.clientWidth;
    bounds.height = element.clientHeight;
    if (!pointer.active) {
      pointer.x = bounds.width  / 2;
      pointer.y = bounds.height * 0.46;
    }
  };

  element.addEventListener('pointermove',  onPointerMove);
  element.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('resize', onResize);

  // ── RAF loop ──────────────────────────────────────────────────────────────
  const wrap = (v, max, margin) => {
    if (v < -margin) return max + margin;
    if (v > max + margin) return -margin;
    return v;
  };

  let raf = 0;
  const render = (time) => {
    const t      = time * 0.001;
    // Scale influence radius relative to element width so it feels consistent
    const radius = pointer.active ? Math.min(bounds.width, bounds.height) * 0.26 : 0;

    for (let i = 0; i < particles.length; i++) {
      const p  = particles[i];
      const el = spanEls[i];

      if (!prefersReduced) {
        p.x += p.vx * 16 + Math.sin(t * 0.42 + p.phase) * p.wobble * 0.045;
        p.y += p.vy * 16 + Math.cos(t * 0.36 + p.phase) * p.wobble * 0.035;
        p.x = wrap(p.x, bounds.width,  28);
        p.y = wrap(p.y, bounds.height, 28);
      }

      const dx       = p.x - pointer.x;
      const dy       = p.y - pointer.y;
      const dist     = Math.hypot(dx, dy);
      const influence = radius > 0 ? Math.max(0, 1 - dist / radius) : 0;
      const encrypted = influence > 0.18;

      if (encrypted !== p.locked) {
        p.locked = encrypted;
        el.classList.toggle('locked', encrypted);
        if (!encrypted && Math.random() < 0.34) {
          p.value = p.value === '0' ? '1' : '0';
          el.querySelector('.csa-bit').textContent = p.value;
        }
      }

      const angle  = Math.atan2(dy || 0.001, dx || 0.001);
      const repel  = influence * 7;
      const px     = p.x + Math.cos(angle) * repel;
      const py     = p.y + Math.sin(angle) * repel;
      const scale  = 1 + influence * 0.34;
      const alpha  = p.alpha + influence * 0.13;
      const rot    = Math.sin(t * 0.24 + p.phase) * 3;

      el.style.setProperty('--x',     `${px}px`);
      el.style.setProperty('--y',     `${py}px`);
      el.style.setProperty('--alpha', `${alpha}`);
      el.style.setProperty('--scale', `${scale}`);
      el.style.setProperty('--rot',   `${rot}deg`);
    }

    raf = requestAnimationFrame(render);
  };

  raf = requestAnimationFrame(render);

  // ── Teardown ──────────────────────────────────────────────────────────────
  return {
    destroy() {
      cancelAnimationFrame(raf);
      element.removeEventListener('pointermove',  onPointerMove);
      element.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', onResize);
      root.remove();
      style.remove();
    },
  };
}
