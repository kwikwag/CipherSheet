import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, DragEvent, PointerEvent } from 'react';
import { Box, Button, Link } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useKeyOps } from '../../hooks/useKeyOps';
import type { KeyConflict } from '../../hooks/useKeyOps';
import { KeyConflictDialog } from './KeyConflictDialog';

const logoUrl = new URL('../../../../../docs/branding/logo.svg', import.meta.url).href;

interface Particle {
  bit: '0' | '1';
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  wobble: number;
  size: number;
  alpha: number;
  lockedAlpha: number;
  delay: number;
  duration: number;
}

export function KeyOnboarding() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setupNewKeypair, loadKeyFile } = useKeyOps();
  const [conflict, setConflict] = useState<KeyConflict | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const particles = useMemo<Particle[]>(() => (
    Array.from({ length: 72 }, (_, index) => ({
      bit: Math.random() > 0.5 ? '1' : '0',
      x: Math.random() * 108 - 4,
      y: Math.random() * 110 - 5,
      vx: Math.random() * 0.05 - 0.018,
      vy: Math.random() * -0.02 - 0.01,
      phase: Math.random() * Math.PI * 2,
      wobble: Math.random() * 0.24 + 0.1,
      size: Math.random() * 6 + 10,
      alpha: Math.random() * 0.12 + 0.06,
      lockedAlpha: Math.random() * 0.14 + 0.20,
      delay: index * -0.42,
      duration: Math.random() * 10 + 16,
    }))
  ), []);

  const handleGenerate = async () => {
    const c = await setupNewKeypair();
    if (c) setConflict(c);
  };

  const handleFile = async (file: File) => {
    const c = await loadKeyFile(file);
    if (c) setConflict(c);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await handleFile(file);
  };

  const handleConflictConfirm = async () => {
    if (!conflict) return;
    const proceed = conflict.proceed;
    setConflict(null);
    await proceed();
  };

  const handlePointerMove = (e: PointerEvent<HTMLElement>) => {
    updateAnimationPointer(e.clientX, e.clientY, true);
  };

  const handlePointerLeave = () => {
    updateAnimationPointer(0, 0, false);
  };

  const updateAnimationPointer = (clientX: number, clientY: number, active: boolean) => {
    const surface = surfaceRef.current;
    const animation = animationRef.current as AnimationElement | null;
    if (!surface || !animation?.csSetPointer) return;
    const rect = surface.getBoundingClientRect();
    animation.csSetPointer(clientX - rect.left, clientY - rect.top, rect.width, rect.height, active);
  };

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    if (!surfaceRef.current?.contains(e.relatedTarget as Node | null)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleFile(file);
  };

  return (
    <Box
      ref={surfaceRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        isolation: 'isolate',
        display: 'grid',
        placeItems: 'center',
        px: 3,
        py: 4,
        background:
          'radial-gradient(circle at 50% -10%, rgba(14, 128, 64, 0.10), transparent 38%), linear-gradient(180deg, #FFFFFF 0%, #F4F8F6 100%)',
      }}
    >
      <CipherAnimation refEl={animationRef} particles={particles} />

      <Box sx={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 272, textAlign: 'center' }}>
        <Box
          component="img"
          src={logoUrl}
          alt="CipherSheet"
          sx={{
            width: 74,
            height: 74,
            display: 'block',
            mx: 'auto',
            mb: 2.5,
            filter:
              'drop-shadow(0 16px 30px rgba(14, 128, 64, 0.20)) drop-shadow(0 3px 10px rgba(3, 44, 54, 0.08))',
          }}
        />
        <Button
          variant="contained"
          size="large"
          startIcon={<AddIcon />}
          onClick={handleGenerate}
          fullWidth
          sx={{
            minHeight: 42,
            borderRadius: 999,
            boxShadow: '0 12px 26px rgba(14, 128, 64, 0.22)',
          }}
        >
          Generate key
        </Button>
        <Box
          sx={{
            mt: 1.5,
            typography: 'caption',
            color: 'text.secondary',
          }}
        >
          Or drop to{' '}
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={() => fileInputRef.current?.click()}
            sx={{ font: 'inherit', fontWeight: 600, verticalAlign: 'baseline' }}
          >
            import
          </Link>
          {' '}an existing key
        </Box>
      </Box>

      <input
        ref={fileInputRef}
        type="file"
        accept=".ciphersheet-key,.json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <KeyConflictDialog
        conflict={conflict}
        onConfirm={handleConflictConfirm}
        onClose={() => setConflict(null)}
      />
      {isDragOver && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            pointerEvents: 'none',
            border: '2px dashed',
            borderColor: 'primary.main',
            bgcolor: 'rgba(14, 128, 64, 0.08)',
          }}
        />
      )}
    </Box>
  );
}

interface AnimationElement extends HTMLDivElement {
  csSetPointer?: (x: number, y: number, width: number, height: number, active: boolean) => void;
}

interface CipherAnimationProps {
  refEl: React.RefObject<HTMLDivElement | null>;
  particles: Particle[];
}

function CipherAnimation({ refEl, particles }: CipherAnimationProps) {
  const particleRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const root = refEl.current as AnimationElement | null;
    if (!root) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bounds = { width: root.clientWidth || 360, height: root.clientHeight || 520 };
    const pointer = { x: bounds.width / 2, y: bounds.height * 0.46, active: false };
    const runtime = particles.map((particle, index) => ({
      ...particle,
      x: (particle.x / 100) * bounds.width,
      y: (particle.y / 100) * bounds.height,
      el: particleRefs.current[index],
      locked: false,
      value: particle.bit,
    }));

    root.csSetPointer = (x, y, width, height, active) => {
      bounds.width = width;
      bounds.height = height;
      pointer.x = active ? x : bounds.width / 2;
      pointer.y = active ? y : bounds.height * 0.46;
      pointer.active = active;
      root.style.setProperty('--mx', active ? `${(pointer.x / bounds.width) * 100}%` : '50%');
      root.style.setProperty('--my', active ? `${(pointer.y / bounds.height) * 100}%` : '46%');
    };

    const wrap = (value: number, max: number, margin: number) => {
      if (value < -margin) return max + margin;
      if (value > max + margin) return -margin;
      return value;
    };

    let raf = 0;
    const render = (time: number) => {
      const t = time * 0.001;
      const radius = pointer.active ? 92 : 0;

      for (const particle of runtime) {
        if (!particle.el) continue;

        if (!prefersReducedMotion) {
          particle.x += particle.vx * 16 + Math.sin(t * 0.42 + particle.phase) * particle.wobble * 0.045;
          particle.y += particle.vy * 16 + Math.cos(t * 0.36 + particle.phase) * particle.wobble * 0.035;
          particle.x = wrap(particle.x, bounds.width, 28);
          particle.y = wrap(particle.y, bounds.height, 28);
        }

        const dx = particle.x - pointer.x;
        const dy = particle.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        const influence = radius > 0 ? Math.max(0, 1 - distance / radius) : 0;
        const encrypted = influence > 0.18;

        if (encrypted !== particle.locked) {
          particle.locked = encrypted;
          particle.el.classList.toggle('locked', encrypted);
          if (!encrypted && Math.random() < 0.34) {
            particle.value = particle.value === '0' ? '1' : '0';
            particle.el.querySelector('.cs-bit')!.textContent = particle.value;
          }
        }

        const angle = Math.atan2(dy || 0.001, dx || 0.001);
        const repel = influence * 7;
        const x = particle.x + Math.cos(angle) * repel;
        const y = particle.y + Math.sin(angle) * repel;
        const scale = 1 + influence * 0.34;
        const alpha = particle.alpha + influence * 0.13;

        particle.el.style.setProperty('--x', `${x}px`);
        particle.el.style.setProperty('--y', `${y}px`);
        particle.el.style.setProperty('--alpha', `${alpha}`);
        particle.el.style.setProperty('--locked-alpha', `${particle.lockedAlpha}`);
        particle.el.style.setProperty('--scale', `${scale}`);
        particle.el.style.setProperty('--rot', `${Math.sin(t * 0.24 + particle.phase) * 3}deg`);
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      delete root.csSetPointer;
    };
  }, [particles, refEl]);

  return (
    <div className="cs-animation" ref={refEl} aria-hidden="true">
      <style>{`
        .cs-animation,
        .cs-animation::before,
        .cs-animation::after {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .cs-animation {
          --mx: 50%;
          --my: 46%;
          z-index: 0;
          overflow: hidden;
          background:
            radial-gradient(circle 180px at var(--mx) var(--my), rgba(14, 128, 64, .145), transparent 64%),
            radial-gradient(circle 260px at 12% 8%, rgba(25, 180, 87, .10), transparent 58%),
            radial-gradient(circle 260px at 92% 92%, rgba(3, 44, 54, .075), transparent 56%);
        }

        .cs-animation::before {
          content: "";
          inset: -36%;
          opacity: .48;
          filter: blur(28px);
          background:
            conic-gradient(
              from 120deg at 48% 48%,
              rgba(14, 128, 64, 0),
              rgba(14, 128, 64, .22),
              rgba(92, 190, 127, .15),
              rgba(3, 44, 54, .12),
              rgba(14, 128, 64, 0)
            );
          transform-origin: 52% 47%;
          animation: cs-cipher-drift 20s cubic-bezier(.45, 0, .2, 1) infinite alternate;
        }

        .cs-animation::after {
          content: "";
          opacity: .24;
          background-image:
            linear-gradient(rgba(14, 128, 64, .13) 1px, transparent 1px),
            linear-gradient(90deg, rgba(14, 128, 64, .13) 1px, transparent 1px),
            linear-gradient(135deg, transparent 46%, rgba(3, 44, 54, .04) 48%, rgba(3, 44, 54, .04) 52%, transparent 54%);
          background-size: 36px 36px, 36px 36px, 72px 72px;
          background-position:
            calc(var(--mx) * -.018) calc(var(--my) * -.018),
            calc(var(--mx) * -.018) calc(var(--my) * -.018),
            center;
          animation: cs-lattice-breathe 13s ease-in-out infinite;
        }

        .cs-particle {
          position: absolute;
          left: 0;
          top: 0;
          width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
          color: rgba(3, 44, 54, var(--alpha));
          font-family: "Roboto Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace;
          font-size: var(--size);
          font-weight: 650;
          line-height: 1;
          user-select: none;
          transform: translate3d(var(--x), var(--y), 0) rotate(var(--rot)) scale(var(--scale));
          transition: color 650ms ease;
          opacity: .78;
          will-change: transform;
        }

        .cs-particle.locked {
          color: rgba(14, 128, 64, var(--locked-alpha));
        }

        .cs-bit,
        .cs-lock {
          grid-area: 1 / 1;
          transition:
            opacity 650ms ease,
            transform 650ms cubic-bezier(.2, .8, .2, 1);
        }

        .cs-particle.locked .cs-bit {
          opacity: 0;
          transform: translateY(-3px) scale(.72);
        }

        .cs-lock {
          position: relative;
          width: 13px;
          height: 12px;
          border: 1.4px solid currentColor;
          border-radius: 3.5px;
          opacity: 0;
          transform: translateY(3px) scale(.68);
        }

        .cs-particle.locked .cs-lock {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        .cs-lock::before {
          content: "";
          position: absolute;
          left: 50%;
          bottom: 7px;
          width: 8px;
          height: 8px;
          border: 1.4px solid currentColor;
          border-bottom: 0;
          border-radius: 8px 8px 0 0;
          transform: translateX(-50%);
        }

        .cs-lock::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 4px;
          width: 2.5px;
          height: 4px;
          border-radius: 999px;
          background: currentColor;
          transform: translateX(-50%);
          opacity: .6;
        }

        @keyframes cs-cipher-drift {
          0%   { transform: translate3d(-2%, -1%, 0) rotate(0deg) scale(1); }
          45%  { transform: translate3d(2%, 1%, 0) rotate(42deg) scale(1.08); }
          100% { transform: translate3d(-1%, 2%, 0) rotate(78deg) scale(1.03); }
        }

        @keyframes cs-lattice-breathe {
          0%, 100% { transform: scale(1); opacity: .19; }
          50%      { transform: scale(1.035); opacity: .30; }
        }

        @media (prefers-reduced-motion: reduce) {
          .cs-animation::before,
          .cs-animation::after,
          .cs-particle,
          .cs-bit,
          .cs-lock {
            animation: none;
            transition: none;
          }
        }
      `}</style>
      {particles.map((particle, index) => (
        <span
          key={index}
          ref={el => { particleRefs.current[index] = el; }}
          className="cs-particle"
          style={{
            '--x': `${particle.x}px`,
            '--y': `${particle.y}px`,
            '--size': `${particle.size}px`,
            '--alpha': `${particle.alpha}`,
            '--locked-alpha': `${particle.lockedAlpha}`,
            '--scale': '1',
            '--rot': '0deg',
          } as CSSProperties}
        >
          <span className="cs-bit">{particle.bit}</span>
          <span className="cs-lock" />
        </span>
      ))}
    </div>
  );
}
