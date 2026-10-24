import { DEFAULT_TOAST_DURATION, THEME_FILLS } from './constants';
import { dismissToast, store } from './store';
import { NICO_CSS } from './styles';
import { ToastView } from './toast-view';
import type { NicoItem, NicoOffsetValue, NicoPosition } from './types';

const STYLE_ID = 'nico-styles';
const pillAlign = (p: NicoPosition) => (p.includes('right') ? 'right' : p.includes('center') ? 'center' : 'left');
const expandDir = (p: NicoPosition) => (p.startsWith('top') ? 'bottom' : 'top');
const timeoutKey = (t: NicoItem) => `${t.id}:${t.instanceId}`;

/** Owns the DOM: one viewport per position, one ToastView per toast. */
class Toaster {
  private root: HTMLElement;
  private viewports = new Map<NicoPosition, HTMLElement>();
  private views = new Map<string, ToastView>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private hovering = false;
  private hoveredId?: string;
  private mq = window.matchMedia?.('(prefers-color-scheme: dark)');

  constructor() {
    if (store.config.injectStyles !== false && !document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = NICO_CSS;
      document.head.append(style);
    }
    this.root = document.createElement('div');
    this.root.setAttribute('data-nico-root', '');
    (store.config.container ?? document.body).append(this.root);

    store.listeners.add(this.sync);
    this.mq?.addEventListener('change', this.refresh);
    this.sync(store.toasts);
  }

  destroy(): void {
    store.listeners.delete(this.sync);
    this.mq?.removeEventListener('change', this.refresh);
    this.clearTimers();
    this.views.forEach((v) => v.destroy());
    this.views.clear();
    this.root.remove();
  }

  refresh = () => this.sync(store.toasts);

  private theme(): 'light' | 'dark' | null {
    const t = store.config.theme;
    if (!t) return null;
    if (t === 'system') return this.mq?.matches ? 'dark' : 'light';
    return t;
  }

  private sync = (list: NicoItem[]) => {
    const theme = this.theme();
    const fallbackFill = theme ? THEME_FILLS[theme] : '#FFFFFF';
    let latest: string | undefined;
    for (let i = list.length - 1; i >= 0; i--) if (!list[i].exiting) { latest = list[i].id; break; }
    const active = this.hoveredId ?? latest;

    // Group by position.
    const groups = new Map<NicoPosition, NicoItem[]>();
    for (const t of list) {
      const pos = t.position ?? store.config.position ?? 'top-right';
      groups.get(pos)?.push(t) ?? groups.set(pos, [t]);
    }

    // Remove views for toasts that are gone.
    const ids = new Set(list.map((t) => t.id));
    for (const [id, view] of this.views) {
      if (!ids.has(id)) {
        view.destroy();
        this.views.delete(id);
      }
    }

    for (const [pos, items] of groups) {
      const vp = this.viewport(pos, theme);
      items.forEach((item, i) => {
        const props = {
          fill: item.fill ?? fallbackFill,
          pill: pillAlign(pos),
          expand: expandDir(pos),
          dir: item.dir ?? store.config.dir,
          canExpand: active === undefined || active === item.id,
        } as const;
        let view = this.views.get(item.id);
        if (view) view.update(item, props);
        else {
          view = new ToastView(item, props, {
            onEnter: () => this.onEnter(item.id),
            onLeave: () => this.onLeave(),
            onDismiss: () => dismissToast(item.id),
          });
          this.views.set(item.id, view);
        }
        if (vp.children[i] !== view.el) vp.insertBefore(view.el, vp.children[i] ?? null);
      });
    }

    // Drop empty viewports.
    for (const [pos, vp] of this.viewports) {
      if (!groups.has(pos)) {
        vp.remove();
        this.viewports.delete(pos);
      }
    }

    // Timers.
    const keys = new Set(list.map(timeoutKey));
    for (const [key, t] of this.timers) {
      if (!keys.has(key)) {
        clearTimeout(t);
        this.timers.delete(key);
      }
    }
    this.schedule(list);
  };

  private viewport(pos: NicoPosition, theme: 'light' | 'dark' | null): HTMLElement {
    let vp = this.viewports.get(pos);
    if (!vp) {
      vp = document.createElement('section');
      vp.setAttribute('data-nico-viewport', '');
      vp.setAttribute('data-position', pos);
      vp.setAttribute('aria-live', 'polite');
      this.root.append(vp);
      this.viewports.set(pos, vp);
    }
    theme ? vp.setAttribute('data-theme', theme) : vp.removeAttribute('data-theme');

    const offset = store.config.offset;
    vp.style.top = vp.style.bottom = vp.style.left = vp.style.right = '';
    if (offset !== undefined) {
      const o = typeof offset === 'object' ? offset : { top: offset, right: offset, bottom: offset, left: offset };
      const px = (v: NicoOffsetValue) => (typeof v === 'number' ? `${v}px` : v);
      if (pos.startsWith('top') && o.top != null) vp.style.top = px(o.top);
      if (pos.startsWith('bottom') && o.bottom != null) vp.style.bottom = px(o.bottom);
      if (pos.endsWith('left') && o.left != null) vp.style.left = px(o.left);
      if (pos.endsWith('right') && o.right != null) vp.style.right = px(o.right);
    }
    return vp;
  }

  private schedule(items: NicoItem[]): void {
    if (this.hovering) return;
    for (const item of items) {
      if (item.exiting || item.duration === null) continue;
      const key = timeoutKey(item);
      if (this.timers.has(key)) continue;
      const dur = item.duration ?? DEFAULT_TOAST_DURATION;
      if (dur > 0) this.timers.set(key, setTimeout(() => dismissToast(item.id), dur));
    }
  }

  private clearTimers(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
  }

  private onEnter(id: string): void {
    this.hoveredId = id;
    if (!this.hovering) {
      this.hovering = true;
      this.clearTimers();
    }
    this.refresh();
  }

  private onLeave(): void {
    this.hoveredId = undefined;
    this.hovering = false;
    this.refresh();
  }
}

/* ---------------------------- Lazy, SSR-safe mount ---------------------------- */

let toaster: Toaster | null = null;
const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

/** Mount on first use in the browser. No-op during SSR. */
export function ensureToaster(): void {
  if (toaster || !isBrowser()) return;
  if (document.body) toaster = new Toaster();
  else document.addEventListener('DOMContentLoaded', () => ensureToaster(), { once: true });
}

export function refreshToaster(): void {
  toaster?.refresh();
}

export function destroyToaster(): void {
  toaster?.destroy();
  toaster = null;
}
