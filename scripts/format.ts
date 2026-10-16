import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
if (!process.argv.includes('--apple')) execFileSync(resolve(root, 'node_modules/.bin/biome'), ['check', '--reporter=summary', ...(check ? [] : ['--write', '--linter-enabled=false']), '.'], { cwd: root, stdio: 'inherit' });
const swiftFiles: string[] = [];
async function collect(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.name.endsWith('.swift')) swiftFiles.push(path);
  }
}
if (!process.argv.includes('--web')) {
  await collect(resolve(root, 'apps/apple'));
  swiftFiles.push(resolve(root, 'contracts/design/SillClient.swift'));
  execFileSync('swift', ['format', check ? 'lint' : 'format', ...(check ? ['--strict'] : ['--in-place']), '--configuration', resolve(root, '.swift-format'), ...swiftFiles], { cwd: root, stdio: 'inherit' });
}
