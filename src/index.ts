/*
 * nico-toast: framework-agnostic toast library, inspired by sileo (https://github.com/hiaaryan/sileo) by Aaryan.
 * Original sileo © Aaryan, MIT License.
 */
import { createToast, dismissToast, type InternalOptions, store, updateToast } from './store';
import { destroyToaster, ensureToaster, refreshToaster } from './toaster';
import type { NicoConfig, NicoOptions, NicoPosition } from './types';

type Resolver<T> = NicoOptions | ((value: T) => NicoOptions);

/** Anything with a `subscribe` method (RxJS Observables, Svelte stores…). */
export interface Subscribable<T> {
  subscribe(observer: {
    next: (v: T) => void;
    error: (e: unknown) => void;
    complete: () => void;
  }): { unsubscribe(): void } | void;
}

export interface NicoPromiseOptions<T = unknown> {
  loading: NicoOptions;
  success: Resolver<T>;
  error: NicoOptions | ((err: unknown) => NicoOptions);
  action?: Resolver<T>;
  position?: NicoPosition;
}

const show = (o: InternalOptions) => {
  ensureToaster();
  return createToast(o);
};

const isSubscribable = <T>(v: unknown): v is Subscribable<T> =>
  !!v && typeof (v as Subscribable<T>).subscribe === 'function' && typeof (v as Promise<T>).then !== 'function';

const fromSubscribable = <T>(s: Subscribable<T>) =>
  new Promise<T>((resolve, reject) => {
    let done = false;
    let sub: { unsubscribe(): void } | void;
    sub = s.subscribe({
      next: (v) => {
        if (done) return;
        done = true;
        resolve(v);
        sub?.unsubscribe();
      },
      error: (e) => !done && ((done = true), reject(e)),
      complete: () => !done && ((done = true), reject(new Error('Completed without a value'))),
    });
    if (done) sub?.unsubscribe();
  });

const resolve = <T>(r: Resolver<T>, v: T) => (typeof r === 'function' ? r(v) : r);

export const nico = {
  show: (o: NicoOptions) => show({ ...o, state: o.type }),
  success: (o: NicoOptions) => show({ ...o, state: 'success' }),
  error: (o: NicoOptions) => show({ ...o, state: 'error' }),
  warning: (o: NicoOptions) => show({ ...o, state: 'warning' }),
  info: (o: NicoOptions) => show({ ...o, state: 'info' }),
  action: (o: NicoOptions) => show({ ...o, state: 'action' }),

  /** Loading → success / error. Accepts a Promise, a promise factory, or an Observable. */
  promise<T>(source: Promise<T> | (() => Promise<T>) | Subscribable<T>, opts: NicoPromiseOptions<T>): Promise<T> {
    const id = show({ ...opts.loading, state: 'loading', duration: null, position: opts.position });
    const p = typeof source === 'function' ? source() : isSubscribable<T>(source) ? fromSubscribable(source) : source;

    p.then((data) => {
      if (opts.action) updateToast(id, { ...resolve(opts.action, data), state: 'action', id });
      else updateToast(id, { ...resolve(opts.success, data), state: 'success', id });
    }).catch((err) => {
      const e = typeof opts.error === 'function' ? opts.error(err) : opts.error;
      updateToast(id, { ...e, state: 'error', id });
    });
    return p;
  },

  dismiss: dismissToast,

  clear: (position?: NicoPosition) =>
    store.update((prev) => (position ? prev.filter((t) => t.position !== position) : [])),

  /** Set global defaults. Safe to call anywhere, including during SSR. */
  configure(config: NicoConfig): void {
    store.config = { ...store.config, ...config };
    refreshToaster();
  },

  /** Remove all toasts and unmount (useful for tests / HMR). */
  destroy(): void {
    store.update(() => []);
    destroyToaster();
  },
};

export { NICO_POSITIONS } from './types';
export type {
  NicoButton,
  NicoConfig,
  NicoOffset,
  NicoOptions,
  NicoPosition,
  NicoState,
  NicoStyles,
  NicoTheme,
} from './types';
