/** Analytic damped-spring tween for SVG attributes (Motion-style duration + bounce). */
export interface SpringConfig {
  duration: number;
  bounce: number;
}

export const SPRING: SpringConfig = { duration: 0.6, bounce: 0.25 };
export const SPRING_NO_BOUNCE: SpringConfig = { duration: 0.6, bounce: 0 };

function progress(t: number, { duration, bounce }: SpringConfig): number {
  if (t >= duration) return 1;
  const zeta = Math.min(1, Math.max(0.05, 1 - bounce));
  if (zeta >= 1) {
    const x = (9.23 / duration) * t;
    return 1 - (1 + x) * Math.exp(-x);
  }
  const w = 6.9 / (zeta * duration);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  const decay = Math.exp(-zeta * w * t);
  return 1 - decay * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const NON_NEGATIVE = new Set(['width', 'height', 'opacity']);

export class SpringAnimator {
  private current: Record<string, number> = {};
  private from: Record<string, number> = {};
  private target: Record<string, number> = {};
  private config = SPRING;
  private start = 0;
  private raf = 0;

  constructor(private readonly el: Element) {}

  /** Animate to `target`; `null` config jumps instantly. */
  to(target: Record<string, number>, config: SpringConfig | null): void {
    const keys = Object.keys(target);
    if (Object.keys(this.target).length && keys.every((k) => this.target[k] === target[k])) return;
    this.target = { ...target };

    if (!config || reducedMotion() || !Object.keys(this.current).length) {
      this.stop();
      this.current = { ...target };
      this.write();
      return;
    }
    this.config = config;
    this.from = { ...this.current };
    this.start = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (now: number) => {
    const t = (now - this.start) / 1000;
    const p = progress(t, this.config);
    for (const k of Object.keys(this.target)) {
      const from = this.from[k] ?? this.target[k];
      this.current[k] = from + (this.target[k] - from) * p;
    }
    this.write();
    this.raf = t >= this.config.duration ? 0 : requestAnimationFrame(this.tick);
  };

  private write(): void {
    for (const [k, v] of Object.entries(this.current)) {
      this.el.setAttribute(k, String(NON_NEGATIVE.has(k) ? Math.max(0, v) : v));
    }
  }
}
