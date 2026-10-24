import { AUTO_COLLAPSE_DELAY, AUTO_EXPAND_DELAY, DEFAULT_TOAST_DURATION, EXIT_DURATION } from './constants';
import type { NicoConfig, NicoItem, NicoOptions, NicoState } from './types';

export type InternalOptions = NicoOptions & { state?: NicoState };
type Listener = (toasts: NicoItem[]) => void;

/** @internal */
export const store = {
  toasts: [] as NicoItem[],
  listeners: new Set<Listener>(),
  config: {} as NicoConfig,

  update(fn: (prev: NicoItem[]) => NicoItem[]) {
    this.toasts = fn(this.toasts);
    for (const l of this.listeners) l(this.toasts);
  },
};

let counter = 0;
const genId = () => `${++counter}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const dismissToast = (id: string) => {
  const item = store.toasts.find((t) => t.id === id);
  if (!item || item.exiting) return;
  store.update((p) => p.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
  setTimeout(() => store.update((p) => p.filter((t) => t.id !== id)), EXIT_DURATION);
};

const resolveAutopilot = (o: InternalOptions, duration: number | null) => {
  if (o.autopilot === false || !duration || duration <= 0) return {};
  const cfg = typeof o.autopilot === 'object' ? o.autopilot : undefined;
  const clamp = (v: number) => Math.min(duration, Math.max(0, v));
  return {
    autoExpandDelayMs: clamp(cfg?.expand ?? AUTO_EXPAND_DELAY),
    autoCollapseDelayMs: clamp(cfg?.collapse ?? AUTO_COLLAPSE_DELAY),
  };
};

const merge = (o: InternalOptions): InternalOptions => ({
  ...store.config.options,
  ...o,
  styles: { ...store.config.options?.styles, ...o.styles },
});

const build = (m: InternalOptions, id: string, fallback?: NicoItem['position']): NicoItem => {
  const duration = m.duration === undefined ? DEFAULT_TOAST_DURATION : m.duration;
  return {
    ...m,
    id,
    instanceId: genId(),
    position: m.position ?? fallback ?? store.config.position ?? 'top-right',
    ...resolveAutopilot(m, duration),
  };
};

export const createToast = (o: InternalOptions): string => {
  const m = merge(o);
  const id = m.id ?? 'nico-default';
  const prev = store.toasts.find((t) => t.id === id && !t.exiting);
  const item = build(m, id, prev?.position);
  store.update((list) =>
    prev ? list.map((t) => (t.id === id ? item : t)) : [...list.filter((t) => t.id !== id), item],
  );
  return id;
};

export const updateToast = (id: string, o: InternalOptions) => {
  const existing = store.toasts.find((t) => t.id === id);
  if (!existing) return;
  const item = build(merge(o), id, existing.position);
  store.update((p) => p.map((t) => (t.id === id ? item : t)));
};
