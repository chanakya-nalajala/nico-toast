import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  sourcemap: false,
  minify: true,
  clean: true,
  target: 'es2020',
  treeshake: true,
  dts: { compilerOptions: { removeComments: true } },
});
