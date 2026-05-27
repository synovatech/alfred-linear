import * as esbuild from 'esbuild';
import { copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [resolve(__dirname, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: resolve(__dirname, 'workflow-folder/js/main.js'),
  external: [],
});

console.log('Built: workflow-folder/js/main.js');

for (const file of ['info.plist', 'icon.png']) {
  copyFileSync(
    resolve(__dirname, 'workflow', file),
    resolve(__dirname, 'workflow-folder', file),
  );
  console.log(`Copied: workflow/${file}`);
}
