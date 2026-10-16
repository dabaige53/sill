import { readdir, readFile, access, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, relative, isAbsolute } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const errors = [];
const roots = new Set<any>([
  '.git', '.github', '.claude', '.agents', '.gitignore', '.env.example', '.app.json', '.ruff_cache',
  'AGENTS.md', 'README.md', 'GLOSSARY.md', 'pr.md', 'package.json', 'package-lock.json',
  'plugin.json', 'biome.json', 'tsconfig.json', '.swift-format', '.git-blame-ignore-revs',
  'apps', 'server', 'contracts', 'design-system', 'docs', 'scripts', 'tests',
  'deploy', 'supabase', 'skills', 'assets', 'node_modules', 'dist', '.sill',
  '.wrangler', '.sandbox-venv', '__pycache__', '.DS_Store',
]);
const privateRoots = new Set(['worker-configuration.d.ts', 'sill.config.json']);
const isPrivateOrGenerated = (name?: any) =>
  /^(?:node_modules|dist|\.sill|\.wrangler|\.sandbox-venv|tests\/artifacts|supabase\/\.temp)(?:\/|$)/.test(name) ||
  /^(?:apps\/apple\/(?:\.build|\.swiftpm)|\.ruff_cache)(?:\/|$)/.test(name) ||
  /(?:^|\/)__pycache__(?:\/|$)/.test(name) ||
  /(?:^|\/)(?:\.env(?:\..+)?|sill\.config\.json|\.DS_Store)$/.test(name) && !name.endsWith('/.env.example') && name !== '.env.example' ||
  /\.sqlite[^/]*(?:\/|$)/.test(name) || name === 'worker-configuration.d.ts';
const walk = async (directory?: any) => {
  const files = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const name = `${directory}/${entry.name}`;
    if (isPrivateOrGenerated(name)) continue;
    files.push(...(entry.isDirectory() ? await walk(name) : [name]));
  }
  return files;
};

for (const name of await readdir(root)) {
  if (!roots.has(name) && !privateRoots.has(name) && !/^\.env(?:\..+)?$/.test(name) && !/\.sqlite/.test(name)) {
    errors.push(`根目录文件缺少归属：${name}；请同步文件管理规范与允许列表。`);
  }
}
const navigation = await readFile(resolve(root, 'docs/README.md'), 'utf8');
const documentFiles = await walk('docs');
const currentFiles = documentFiles.filter((name?: any) => /^docs\/(?:product|design|guides|agents)\/.*\.md$/.test(name));
for (const name of documentFiles) {
  const metadata = await stat(resolve(root, name));
  if (/\.(?:zip|tar|tgz|gz|7z)$/i.test(name)) errors.push(`文档目录不保留打包文件：${name}`);
  if (metadata.size > 2 * 1024 * 1024) errors.push(`文档或证据超过 2 MB：${name}`);
  if (!name.endsWith('.md')) continue;
  const body = await readFile(resolve(root, name), 'utf8');
  if (currentFiles.includes(name)) {
    if (!/更新：\d{4}-\d{2}-\d{2}/.test(body.slice(0, 300))) errors.push(`现行文档缺少更新日期：${name}`);
    if (!navigation.includes(`(${relative('docs', name)})`)) errors.push(`现行文档未列入导航：${name}`);
  }
  if (name.startsWith('docs/archive/') && !/(?:已被 .*替代|不再适用：)/.test(body.slice(0, 300))) errors.push(`归档文档缺少替代说明：${name}`);
  if (/^docs\/[^/]+\.md$/.test(name) && name !== 'docs/README.md') errors.push(`文档仍平铺在 docs 根目录：${name}`);
}
for (const entry of await readdir(resolve(root, 'docs/records'), { withFileTypes: true })) {
  const name = `docs/records/${entry.name}`;
  if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}-.+/.test(entry.name)) {
    errors.push(`记录目录名称不合规：${name}`);
    continue;
  }
  try { await access(resolve(root, name, 'README.md')); }
  catch { errors.push(`记录缺少 README.md：${name}`); }
  if (!navigation.includes(`(records/${entry.name}/README.md)`)) errors.push(`记录未列入导航：${name}`);
}
const guides = new Set<any>([
  'AGENTS.md', '.github/pull_request_template.md', 'pr.md', 'README.md',
  'docs/README.md', 'scripts/README.md', 'tests/README.md', ...currentFiles,
]);
for (const guide of guides) {
  const body = await readFile(resolve(root, guide), 'utf8');
  for (const [, raw] of body.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const url = raw.trim().replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(url)) continue;
    const target = resolve(dirname(resolve(root, guide)), decodeURIComponent(url.split(/[?#]/)[0]));
    const name = relative(root, target);
    if (name.startsWith('../') || name === '..' || isAbsolute(name)) {
      errors.push(`${guide}：本地链接超出仓库：${url}`);
      continue;
    }
    try { await access(target); }
    catch { errors.push(`${guide}：本地链接不存在：${url}`); }
  }
}
const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
if (tracked.error || tracked.status !== 0) {
  errors.push('无法读取 Git 文件清单；请在完整 Git 仓库内运行。');
} else {
  for (const name of tracked.stdout.split('\0').filter(Boolean)) {
    if (isPrivateOrGenerated(name)) errors.push(`本地数据或生成目录中的文件已纳入 Git：${name}`);
  }
}
for (const directory of ['apps', 'server']) {
  try { await access(resolve(root, directory)); } catch { continue; }
  for (const name of await walk(directory)) {
    if (!/\.(?:ts|tsx|swift)$/.test(name)) continue;
    const body = await readFile(resolve(root, name), 'utf8');
    for (const [, target] of body.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)) {
      if (!target.startsWith('.')) continue;
      const destination = relative(root, resolve(root, dirname(name), target));
      const sourceUnit = name.split('/').slice(0, 2).join('/');
      const targetUnit = destination.split('/').slice(0, 2).join('/');
      if (/^(?:apps|server)\//.test(destination) && sourceUnit !== targetUnit) errors.push(`违反端之间依赖方向：${name} → ${target}`);
    }
  }
}
const ignoredPaths = [
  '.env', '.env.local', 'sill.config.json', '.sill/local/cards.json', 'sample.sqlite',
  'node_modules/sample', 'dist/sample', 'tests/artifacts/sample', '__pycache__/sample',
  '.sandbox-venv/sample', '.wrangler/sample', 'supabase/.temp/sample', 'worker-configuration.d.ts',
];
const ignored = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
  cwd: root, encoding: 'utf8', input: ignoredPaths.join('\n') + '\n',
});
if (ignored.error || ![0, 1].includes(ignored.status)) {
  errors.push('无法检查 Git 忽略规则。');
} else {
  const matches = new Set<any>(ignored.stdout.trim().split('\n'));
  for (const name of ignoredPaths) if (!matches.has(name)) errors.push(`缺少本地文件忽略规则：${name}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('文件管理检查通过：目录归属、文档有效性、导航、链接、证据、依赖方向与本地文件隔离。');
}
