// Generates src/styles.ts from src/styles.css so styles can be auto-injected,
// and copies the CSS to dist/ for people who prefer importing it directly.
// The CSS is minified in both places.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const src = readFileSync('src/styles.css', 'utf8');
const css = transformSync(src, { loader: 'css', minify: true }).code.trim();
writeFileSync(
  'src/styles.ts',
  `// AUTO-GENERATED from styles.css by scripts/gen-styles.mjs. Do not edit.\nexport const NICO_CSS = ${JSON.stringify(css)};\n`,
);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/styles.css', css);
