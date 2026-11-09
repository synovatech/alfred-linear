import * as esbuild from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// `workflow-folder` is a tracked symlink to the live Alfred workflow, so every checkout
// shares it. Only the main checkout (where `.git` is a directory) installs into it; a
// linked worktree (`.git` is a file) or a machine without the workflow (e.g. CI) builds
// into dist/workflow instead, so branch code never replaces the installed workflow.
const gitPath = resolve(__dirname, '.git');
const isMainCheckout = existsSync(gitPath) && statSync(gitPath).isDirectory();
const liveDir = resolve(__dirname, 'workflow-folder');
const outDir = isMainCheckout && existsSync(liveDir) ? liveDir : resolve(__dirname, 'dist/workflow');
const outLabel = relative(__dirname, outDir);

mkdirSync(resolve(outDir, 'js'), { recursive: true });

await esbuild.build({
  entryPoints: [resolve(__dirname, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: resolve(outDir, 'js/main.js'),
  external: [],
});

console.log(`Built: ${outLabel}/js/main.js`);

for (const file of ['info.plist', 'icon.png']) {
  copyFileSync(resolve(__dirname, 'workflow', file), resolve(outDir, file));
  console.log(`Copied: workflow/${file} → ${outLabel}/${file}`);
}
