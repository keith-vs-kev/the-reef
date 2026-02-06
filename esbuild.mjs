import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
};

if (isWatch) {
  const ctx = await esbuild.context(extensionConfig);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(extensionConfig);
  console.log('Build complete');
}
