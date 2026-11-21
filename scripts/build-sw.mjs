import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

export function getBuildId() {
  if (process.env.BUILD_ID) return process.env.BUILD_ID;
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'production-build';
  }
}

export function buildServiceWorker(buildId = getBuildId()) {
  const templatePath = resolve(root, 'public/sw.template.js');
  const outPath = resolve(root, 'public/sw.js');
  const template = readFileSync(templatePath, 'utf8');
  const content = template.replaceAll('__SW_BUILD_ID__', buildId);
  writeFileSync(outPath, content, 'utf8');
  console.log(`[sw-build] Generated public/sw.js with build ID: ${buildId}`);
  return buildId;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildServiceWorker();
}
