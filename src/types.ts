export type NicoState = 'success' | 'loading' | 'error' | 'warning' | 'info' | 'action';

export interface NicoStyles {
  title?: string;
  description?: string;
  badge?: string;
  button?: string;
}

export interface NicoButton {
  title: string;
  onClick: () => void;
}

export const NICO_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

export type NicoPosition = (typeof NICO_POSITIONS)[number];

/** Text direction. `auto` picks it from the toast's text. */
export type NicoDir = 'ltr' | 'rtl' | 'auto';

export interface NicoOptions {
  /** Toasts sharing an id morph into each other. Omit to reuse the single default toast. */
  id?: string;
  title?: string;
  /** Plain text (rendered safely as text) or a DOM element for rich content. */
  description?: string | HTMLElement;
  type?: NicoState;
  position?: NicoPosition;
  /** Text direction. Defaults to the configured `dir`, else inherited from the page. */
  dir?: NicoDir;
  /** Auto-dismiss in ms. `null` = sticky. Default 6000. */
  duration?: number | null;
  /** Custom badge icon: trusted SVG/HTML markup string or a DOM element. */
  icon?: string | HTMLElement | null;
  styles?: NicoStyles;
  /** Fill colour of the toast shape. */
  fill?: string;
  /** Corner radius in px. Default 16. */
  roundness?: number;
  autopilot?: boolean | { expand?: number; collapse?: number };
  button?: NicoButton;
}

export type NicoOffsetValue = number | string;
export type NicoOffset =
  | NicoOffsetValue
  | Partial<Record<'top' | 'right' | 'bottom' | 'left', NicoOffsetValue>>;

export type NicoTheme = 'light' | 'dark' | 'system';

export interface NicoConfig {
  /** Default position. Default `top-right`. */
  position?: NicoPosition;
  /** Default text direction. Omit to inherit from the page (e.g. `<html dir="rtl">`). */
  dir?: NicoDir;
  /** Inverted contrast theme for the toast shape. Omit for a white toast. */
  theme?: NicoTheme;
  offset?: NicoOffset;
  /** Defaults merged into every toast. */
  options?: Partial<NicoOptions>;
  /** Inject the stylesheet automatically. Set false if you import `styles.css` yourself (e.g. strict CSP). Default true. */
  injectStyles?: boolean;
  /** Where to mount. Default `document.body`. */
  container?: HTMLElement;
}

/** @internal */
export interface NicoItem extends NicoOptions {
  id: string;
  instanceId: string;
  state?: NicoState;
  exiting?: boolean;
  autoExpandDelayMs?: number;
  autoCollapseDelayMs?: number;
}
