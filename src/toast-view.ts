import {
  BLUR_RATIO,
  DEFAULT_ROUNDNESS,
  HEADER_EXIT_MS,
  HEIGHT,
  MIN_EXPAND_RATIO,
  PILL_PADDING,
  SWAP_COLLAPSE_MS,
  SWIPE_DISMISS,
  SWIPE_MAX,
  WIDTH,
} from './constants';
import { STATE_ICONS } from './icons';
import { SPRING, SPRING_NO_BOUNCE, SpringAnimator } from './spring';
import type { NicoButton, NicoDir, NicoItem, NicoState, NicoStyles } from './types';

export type Align = 'left' | 'center' | 'right';
export type Edge = 'top' | 'bottom';

export interface ToastProps {
  fill: string;
  pill: Align;
  expand: Edge;
  dir?: NicoDir;
  canExpand: boolean;
}

export interface ToastCallbacks {
  onEnter: () => void;
  onLeave: () => void;
  onDismiss: () => void;
}

interface View {
  title: string;
  description?: string | HTMLElement;
  state: NicoState;
  icon?: string | HTMLElement | null;
  styles?: NicoStyles;
  button?: NicoButton;
  fill: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_EXPANDED = HEIGHT * MIN_EXPAND_RATIO;
let uid = 0;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function div(attr: string, extra: Record<string, string> = {}) {
  const el = document.createElement('div');
  el.setAttribute(attr, '');
  for (const [k, v] of Object.entries(extra)) el.setAttribute(k, v);
  return el;
}

const setAttr = (el: Element, name: string, value: string | number | boolean | null) =>
  value === null ? el.removeAttribute(name) : el.setAttribute(name, String(value));

const setClass = (el: Element, cls?: string) => (cls ? el.setAttribute('class', cls) : el.removeAttribute('class'));

/** Imperative, framework-free toast. One instance per toast id. */
export class ToastView {
  readonly el: HTMLButtonElement;

  private readonly filterId = `nico-gooey-${++uid}`;
  private readonly canvas: HTMLDivElement;
  private readonly svgEl: SVGSVGElement;
  private readonly filter: SVGFilterElement;
  private readonly blurEl: SVGFEGaussianBlurElement;
  private readonly pillRect: SVGRectElement;
  private readonly bodyRect: SVGRectElement;
  private readonly header: HTMLDivElement;
  private readonly stack: HTMLDivElement;
  private content: HTMLDivElement | null = null;
  private desc: HTMLDivElement | null = null;
  private currentLayer: { key: string; el: HTMLDivElement } | null = null;
  private prevLayerEl: HTMLDivElement | null = null;

  private readonly pillAnim: SpringAnimator;
  private readonly bodyAnim: SpringAnimator;

  private item!: NicoItem;
  private props!: ToastProps;
  private view!: View;
  private isExpanded = false;
  private ready = false;
  private pillWidth = 0;
  private contentHeight = 0;
  private roundness = DEFAULT_ROUNDNESS;
  private frozenExpanded = MIN_EXPANDED;
  private headerPad: number | null = null;

  private lastRefreshKey?: string;
  private appliedKey?: string;
  private pending: { key: string; view: View } | null = null;
  private lastAutoSig = '';

  private swapTimer?: ReturnType<typeof setTimeout>;
  private headerExitTimer?: ReturnType<typeof setTimeout>;
  private expandTimer?: ReturnType<typeof setTimeout>;
  private collapseTimer?: ReturnType<typeof setTimeout>;
  private rafs = new Set<number>();
  private stackRo: ResizeObserver;
  private descRo: ResizeObserver | null = null;
  private pointerStartY: number | null = null;
  private destroyed = false;

  constructor(item: NicoItem, props: ToastProps, private readonly cb: ToastCallbacks) {
    /* ------------------------------ Build DOM ------------------------------ */
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.setAttribute('data-nico-toast', '');

    this.canvas = div('data-nico-canvas');
    this.svgEl = svg('svg', { 'data-nico-svg': '', width: WIDTH });
    const title = svg('title');
    title.textContent = 'Notification';
    const defs = svg('defs');
    this.filter = svg('filter', {
      id: this.filterId,
      filterUnits: 'userSpaceOnUse',
      'color-interpolation-filters': 'sRGB',
    });
    this.blurEl = svg('feGaussianBlur', { in: 'SourceGraphic', result: 'blur' });
    this.filter.append(
      this.blurEl,
      svg('feColorMatrix', {
        in: 'blur',
        type: 'matrix',
        values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10',
        result: 'goo',
      }),
      svg('feComposite', { in: 'SourceGraphic', in2: 'goo', operator: 'atop' }),
    );
    defs.append(this.filter);
    const g = svg('g', { filter: `url(#${this.filterId})` });
    this.pillRect = svg('rect', { 'data-nico-pill': '' });
    this.bodyRect = svg('rect', { 'data-nico-body': '', y: HEIGHT, width: WIDTH });
    g.append(this.pillRect, this.bodyRect);
    this.svgEl.append(title, defs, g);
    this.canvas.append(this.svgEl);

    this.header = div('data-nico-header');
    this.stack = div('data-nico-header-stack');
    this.header.append(this.stack);
    this.el.append(this.canvas, this.header);

    this.pillAnim = new SpringAnimator(this.pillRect);
    this.bodyAnim = new SpringAnimator(this.bodyRect);

    /* ------------------------------ Listeners ------------------------------ */
    this.el.addEventListener('mouseenter', this.onEnter);
    this.el.addEventListener('mouseleave', this.onLeave);
    this.el.addEventListener('transitionend', this.onTransitionEnd);
    this.el.addEventListener('pointerdown', this.onPointerDown);

    this.stackRo = new ResizeObserver(() => this.raf(() => this.measurePill()));
    this.stackRo.observe(this.stack);

    this.update(item, props);

    this.raf(() => {
      this.measurePill();
      this.raf(() => {
        this.ready = true;
        this.render();
      });
    });
  }

  /* -------------------------------- Public -------------------------------- */

  update(item: NicoItem, props: ToastProps): void {
    if (this.destroyed) return;
    const first = !this.item;
    const prevFill = this.props?.fill;
    this.item = item;
    this.props = props;
    this.roundness = Math.max(0, item.roundness ?? DEFAULT_ROUNDNESS);

    if (item.instanceId !== this.lastRefreshKey) {
      this.lastRefreshKey = item.instanceId;
      const next = this.toView(item);
      clearTimeout(this.swapTimer);
      if (!first && this.isOpen()) {
        // Collapse first, then swap content.
        this.pending = { key: item.instanceId, view: next };
        this.isExpanded = false;
        this.swapTimer = setTimeout(() => this.applyPending(), SWAP_COLLAPSE_MS);
      } else {
        this.pending = null;
        this.applyView(next, item.instanceId, first);
      }
    } else if (prevFill !== props.fill) {
      this.view = { ...this.view, fill: props.fill };
      if (this.pending) this.pending.view = { ...this.pending.view, fill: props.fill };
    }

    this.syncAutopilot();
    this.render();
  }

  destroy(): void {
    this.destroyed = true;
    [this.swapTimer, this.headerExitTimer, this.expandTimer, this.collapseTimer].forEach((t) => clearTimeout(t));
    this.rafs.forEach((id) => cancelAnimationFrame(id));
    this.stackRo.disconnect();
    this.descRo?.disconnect();
    this.pillAnim.stop();
    this.bodyAnim.stop();
    this.detachSwipe();
    this.el.remove();
  }

  /* ------------------------------ View swaps ------------------------------ */

  private toView(it: NicoItem): View {
    const state = it.state ?? 'success';
    return {
      title: it.title ?? state,
      description: it.description,
      state,
      icon: it.icon,
      styles: it.styles,
      button: it.button,
      fill: this.props.fill,
    };
  }

  private applyView(next: View, key: string, first = false): void {
    this.view = next;
    this.appliedKey = key;

    const k = `${next.state}-${next.title}`;
    if (!first && this.currentLayer?.key === k) {
      this.fillLayer(this.currentLayer.el, next);
    } else {
      if (this.currentLayer && !first) {
        this.prevLayerEl?.remove();
        const old = this.currentLayer.el;
        old.setAttribute('data-layer', 'prev');
        old.setAttribute('data-exiting', 'true');
        this.prevLayerEl = old;
        clearTimeout(this.headerExitTimer);
        this.headerExitTimer = setTimeout(() => {
          this.prevLayerEl?.remove();
          this.prevLayerEl = null;
        }, HEADER_EXIT_MS);
      }
      const el = div('data-nico-header-inner', { 'data-layer': 'current' });
      this.fillLayer(el, next);
      this.stack.prepend(el);
      this.currentLayer = { key: k, el };
    }

    this.renderContent();
    this.syncAutopilot();
    this.render();
    this.raf(() => this.measurePill());
  }

  private applyPending(): void {
    clearTimeout(this.swapTimer);
    const p = this.pending;
    if (!p || this.destroyed) return;
    this.pending = null;
    this.applyView(p.view, p.key);
  }

  private fillLayer(el: HTMLDivElement, v: View): void {
    const badge = div('data-nico-badge', { 'data-state': v.state });
    setClass(badge, v.styles?.badge);
    if (v.icon instanceof HTMLElement) badge.append(v.icon.cloneNode(true));
    else badge.innerHTML = v.icon || STATE_ICONS[v.state];

    const title = document.createElement('span');
    title.setAttribute('data-nico-title', '');
    title.setAttribute('data-state', v.state);
    setClass(title, v.styles?.title);
    title.textContent = v.title;

    el.replaceChildren(badge, title);
  }

  private renderContent(): void {
    const v = this.view;
    if (!this.hasDesc()) {
      this.content?.remove();
      this.content = this.desc = null;
      this.descRo?.disconnect();
      this.descRo = null;
      this.contentHeight = 0;
      return;
    }

    if (!this.content || !this.desc) {
      this.content = div('data-nico-content');
      this.desc = div('data-nico-description');
      this.content.append(this.desc);
      this.el.append(this.content);
      const desc = this.desc;
      this.descRo = new ResizeObserver(() =>
        this.raf(() => {
          if (desc.scrollHeight !== this.contentHeight) {
            this.contentHeight = desc.scrollHeight;
            this.render();
          }
        }),
      );
      this.descRo.observe(desc);
    }

    setClass(this.desc, v.styles?.description);
    const nodes: Node[] = [];
    if (v.description instanceof HTMLElement) nodes.push(v.description);
    else if (v.description) nodes.push(document.createTextNode(v.description));

    if (v.button) {
      const btn = document.createElement('a');
      btn.href = '#';
      btn.setAttribute('role', 'button');
      btn.setAttribute('data-nico-button', '');
      btn.setAttribute('data-state', v.state);
      setClass(btn, v.styles?.button);
      btn.textContent = v.button.title;
      const onClick = v.button.onClick;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      nodes.push(btn);
    }
    this.desc.replaceChildren(...nodes);
  }

  /* -------------------------------- Render -------------------------------- */

  private hasDesc = () => !!this.view.description || !!this.view.button;
  private isOpen = () => this.hasDesc() && this.isExpanded && this.view.state !== 'loading';

  private render(): void {
    if (this.destroyed) return;
    const { pill, expand } = this.props;
    const hasDesc = this.hasDesc();
    const open = this.isOpen();
    const blur = this.roundness * BLUR_RATIO;
    const margin = blur * 2;

    const raw = hasDesc ? Math.max(MIN_EXPANDED, HEIGHT + this.contentHeight) : MIN_EXPANDED;
    if (open) this.frozenExpanded = raw;
    const expanded = open ? raw : this.frozenExpanded;
    const svgHeight = hasDesc ? Math.max(expanded, MIN_EXPANDED) : HEIGHT;
    const pillW = Math.max(this.pillWidth || HEIGHT, HEIGHT);
    const pillX = pill === 'right' ? WIDTH - pillW : pill === 'center' ? (WIDTH - pillW) / 2 : 0;

    const el = this.el;
    setAttr(el, 'data-ready', this.ready);
    setAttr(el, 'data-expanded', open);
    setAttr(el, 'data-exiting', !!this.item.exiting);
    setAttr(el, 'data-edge', expand);
    setAttr(el, 'data-position', pill);
    setAttr(el, 'data-state', this.view.state);
    setAttr(el, 'dir', this.props.dir ?? null);

    const shift = expand === 'bottom' ? 3 : -3;
    el.style.setProperty('--_h', `${open ? expanded : HEIGHT}px`);
    el.style.setProperty('--_pw', `${pillW}px`);
    el.style.setProperty('--_px', `${pillX}px`);
    el.style.setProperty('--_ht', `translateY(${open ? shift : 0}px) scale(${open ? 0.9 : 1})`);
    el.style.setProperty('--_co', `${open ? 1 : 0}`);

    setAttr(this.canvas, 'data-edge', expand);
    setAttr(this.header, 'data-edge', expand);
    if (this.content) {
      setAttr(this.content, 'data-edge', expand);
      setAttr(this.content, 'data-visible', open);
    }

    setAttr(this.svgEl, 'height', svgHeight);
    setAttr(this.svgEl, 'viewBox', `0 0 ${WIDTH} ${svgHeight}`);
    setAttr(this.filter, 'x', -margin);
    setAttr(this.filter, 'y', -margin);
    setAttr(this.filter, 'width', WIDTH + margin * 2);
    setAttr(this.filter, 'height', svgHeight + margin * 2);
    setAttr(this.blurEl, 'stdDeviation', blur);
    for (const r of [this.pillRect, this.bodyRect]) {
      setAttr(r, 'rx', this.roundness);
      setAttr(r, 'ry', this.roundness);
      setAttr(r, 'fill', this.view.fill);
    }

    this.pillAnim.to(
      { x: pillX, width: pillW, height: open ? HEIGHT + blur * 3 : HEIGHT },
      this.ready ? SPRING : null,
    );
    this.bodyAnim.to(
      { height: open ? Math.max(0, expanded - HEIGHT) : 0, opacity: open ? 1 : 0 },
      this.ready ? (open ? SPRING : SPRING_NO_BOUNCE) : null,
    );
  }

  private measurePill(): void {
    if (this.destroyed) return;
    if (this.headerPad === null) {
      const cs = getComputedStyle(this.header);
      this.headerPad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    }
    const inner = this.currentLayer?.el;
    if (!inner) return;
    const w = inner.scrollWidth + this.headerPad + PILL_PADDING;
    if (w > PILL_PADDING && w !== this.pillWidth) {
      this.pillWidth = w;
      this.render();
    }
  }

  private raf(fn: () => void): void {
    const id = requestAnimationFrame(() => {
      this.rafs.delete(id);
      fn();
    });
    this.rafs.add(id);
  }

  /* ------------------------------- Autopilot ------------------------------ */

  private syncAutopilot(): void {
    const hasDesc = this.hasDesc();
    const allow = this.view.state === 'loading' ? false : this.props.canExpand;
    const exiting = !!this.item.exiting;
    const e = this.item.autoExpandDelayMs;
    const c = this.item.autoCollapseDelayMs;

    const sig = [hasDesc, allow, exiting, e, c, this.appliedKey].join('|');
    if (sig === this.lastAutoSig) return;
    this.lastAutoSig = sig;
    if (!hasDesc) return;

    clearTimeout(this.expandTimer);
    clearTimeout(this.collapseTimer);
    if (exiting || !allow) {
      this.isExpanded = false;
      return;
    }
    if (e == null && c == null) return;

    const setOpen = (v: boolean) => {
      this.isExpanded = v;
      this.render();
    };
    if ((e ?? 0) > 0) this.expandTimer = setTimeout(() => setOpen(true), e);
    else this.isExpanded = true;
    if ((c ?? 0) > 0) this.collapseTimer = setTimeout(() => setOpen(false), c);
  }

  /* -------------------------------- Events -------------------------------- */

  private onEnter = () => {
    this.cb.onEnter();
    if (this.hasDesc()) {
      this.isExpanded = true;
      this.render();
    }
  };

  private onLeave = () => {
    this.cb.onLeave();
    this.isExpanded = false;
    this.render();
  };

  private onTransitionEnd = (e: TransitionEvent) => {
    if (e.propertyName !== 'height' && e.propertyName !== 'transform') return;
    if (this.isOpen() || !this.pending) return;
    this.applyPending();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.item.exiting) return;
    if ((e.target as HTMLElement).closest('[data-nico-button]')) return;
    this.pointerStartY = e.clientY;
    this.el.setPointerCapture(e.pointerId);
    this.el.addEventListener('pointermove', this.onPointerMove, { passive: true });
    this.el.addEventListener('pointerup', this.onPointerUp, { passive: true });
    this.el.addEventListener('pointercancel', this.onPointerUp, { passive: true });
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.pointerStartY === null) return;
    const dy = e.clientY - this.pointerStartY;
    this.el.style.transform = `translateY(${Math.min(Math.abs(dy), SWIPE_MAX) * (dy > 0 ? 1 : -1)}px)`;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.pointerStartY === null) return;
    const dy = e.clientY - this.pointerStartY;
    this.pointerStartY = null;
    this.el.style.transform = '';
    this.detachSwipe();
    if (Math.abs(dy) > SWIPE_DISMISS) this.cb.onDismiss();
  };

  private detachSwipe(): void {
    this.el.removeEventListener('pointermove', this.onPointerMove);
    this.el.removeEventListener('pointerup', this.onPointerUp);
    this.el.removeEventListener('pointercancel', this.onPointerUp);
  }
}
