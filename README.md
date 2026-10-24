# nico-toast

Gooey, physics-based toast notifications for **any** framework: Angular, React, Next.js, Vue, Nuxt, Svelte, SvelteKit, Solid, Astro or plain JS.

Inspired by [sileo](https://github.com/hiaaryan/sileo) by [Aaryan](https://github.com/hiaaryan) (MIT). It has zero runtime dependencies and is SSR-safe. Styles are injected automatically.

## Install

```bash
npm install nico-toast
```

## Use it anywhere

```ts
import { nico } from 'nico-toast';

nico.success({ title: 'Saved', description: 'Your changes are live.' });
nico.error({ title: 'Upload failed', description: 'Max size is 10 MB.' });
nico.warning({ title: 'Session expiring' });
nico.info({ title: 'Sync scheduled' });

nico.action({
  title: 'Row deleted',
  description: 'You can undo this for 6 seconds.',
  button: { title: 'Undo', onClick: () => restore() },
});

// Promise, promise factory, or Observable (e.g. Angular HttpClient)
await nico.promise(fetch('/api/save', { method: 'POST' }), {
  loading: { title: 'Saving' },
  success: { title: 'Saved' },
  error: (err) => ({ title: 'Save failed', description: String(err) }),
});
```

There is no `<Toaster />` to mount. The toaster attaches itself to `document.body` on the first toast. To change the defaults, call `configure` once:

```ts
nico.configure({
  position: 'top-right',   // top-left | top-center | top-right | bottom-left | bottom-center | bottom-right
  theme: 'system',         // 'light' | 'dark' | 'system' (omit for a white toast)
  dir: 'rtl',              // 'ltr' | 'rtl' | 'auto' (omit to inherit from the page)
  offset: { top: 72 },     // e.g. clear a fixed header
  options: { roundness: 16 },
});
```

## Framework setup

**Angular**: configure once in your root component.
```ts
import { nico } from 'nico-toast';
export class AppComponent {
  constructor() { nico.configure({ position: 'top-right', theme: 'light' }); }
}
```

**React / Next.js (App Router)**: call `nico` from client code (event handlers, effects). To configure, use a tiny client component in your root layout.
```tsx
'use client';
import { useEffect } from 'react';
import { nico } from 'nico-toast';
export function NicoSetup() {
  useEffect(() => nico.configure({ position: 'top-right', theme: 'system' }), []);
  return null;
}
```

**Vue**: put this in `main.ts`.
```ts
import { nico } from 'nico-toast';
nico.configure({ position: 'bottom-right' });
```

**Nuxt**: create `plugins/nico.client.ts`.
```ts
import { nico } from 'nico-toast';
export default defineNuxtPlugin(() => {
  nico.configure({ position: 'top-right', theme: 'system' });
  return { provide: { nico } };
});
```

**Svelte / SvelteKit**: configure in `+layout.svelte` inside `onMount`, or call `nico` directly from handlers.

**Plain HTML**
```html
<script type="module">
  import { nico } from 'https://esm.sh/nico-toast';
  nico.success({ title: 'Hello' });
</script>
```

## Options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | `string` | `'nico-default'` | Toasts with the same id morph into each other. Use different ids to stack. |
| `title` | `string` | state name | |
| `description` | `string \| HTMLElement` | | Strings are rendered as text, which is XSS-safe. |
| `position` | `NicoPosition` | configured default | |
| `dir` | `'ltr' \| 'rtl' \| 'auto'` | configured default | Text direction. Without one the toast inherits the page's, e.g. `<html dir="rtl">`. |
| `duration` | `number \| null` | `6000` | `null` = sticky |
| `icon` | `string \| HTMLElement \| null` | state icon | String is **trusted** SVG/HTML markup. |
| `fill` | `string` | theme-based | Toast shape colour |
| `roundness` | `number` | `16` | |
| `autopilot` | `boolean \| { expand, collapse }` | `true` | Auto expand/collapse timing (ms) |
| `button` | `{ title, onClick }` | | Action button |
| `styles` | `{ title, description, badge, button }` | | Extra class names |

Other methods are `nico.dismiss(id)`, `nico.clear(position?)` and `nico.destroy()`. Use `destroy()` for tests and HMR.

## Styling and CSP

The CSS is injected as a `<style id="nico-styles">` tag. If your Content-Security-Policy blocks inline styles, import the file instead and disable injection:

```ts
import 'nico-toast/styles.css';
nico.configure({ injectStyles: false });
```

You can theme it with CSS variables: `--nico-state-success`, `--nico-state-error`, `--nico-state-warning`, `--nico-state-info`, `--nico-state-action`, `--nico-duration`.

## Develop / publish

```bash
npm install
npm run build        # dist/ (ESM + .d.ts + styles.css)
npm pack             # nico-toast-0.1.0.tgz → npm install ./nico-toast-0.1.0.tgz
npm publish          # public npm, or set publishConfig.registry for a private registry
```

Edit styles in `src/styles.css`. `src/styles.ts` is generated during the build.

## License

MIT. Inspired by [sileo](https://github.com/hiaaryan/sileo), the original design and code by Aaryan.
