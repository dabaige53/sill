import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, relative, isAbsolute } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const errors = [];
const roots = new Set([
  '.git', '.github', '.claude', '.agents', '.gitignore', '.env.example', '.app.json',
  'AGENTS.md', 'README.md', 'GLOSSARY.md', 'pr.md', 'package.json', 'package-lock.json', 'plugin.json',
  'sill.config.example.json', 'requirements-sandbox.txt', 'index.html',
  'src', 'server', 'web', 'native', 'assets', 'design-system', 'docs', 'scripts',
  'tests', 'deploy', 'supabase', 'skills', 'node_modules', 'dist', '.sill',
  '.wrangler', '.sandbox-venv', '__pycache__', '.DS_Store',
  'worker-configuration.d.ts', 'sill.config.json',
]);
const isPrivateOrGenerated = name =>
  /^(?:node_modules|dist|\.sill|\.wrangler|\.sandbox-venv|tests\/artifacts|supabase\/\.temp)(?:\/|$)/.test(name) ||
  /(?:^|\/)__pycache__(?:\/|$)/.test(name) ||
  /(?:^|\/)(?:\.env(?:\..+)?|sill\.config\.json|\.DS_Store)$/.test(name) && !name.endsWith('/.env.example') && name !== '.env.example' ||
  /\.sqlite[^/]*(?:\/|$)/.test(name) || name === 'worker-configuration.d.ts';

for (const name of await readdir(root)) {
  if (!roots.has(name) && !/^\.env(?:\..+)?$/.test(name) && !/\.sqlite/.test(name)) {
    errors.push(`根目录文件缺少归属：${name}；请同步文件管理规范与允许列表。`);
  }
}

const guides = ['AGENTS.md', '.github/pull_request_template.md', 'pr.md', 'docs/agents/issue-tracker.md', 'docs/agents/triage-labels.md', 'docs/agents/domain.md', 'README.md', 'docs/README.md', 'docs/FILE-MANAGEMENT.md', 'scripts/README.md', 'tests/README.md'];
const linked = new Map();
for (const guide of guides) {
  const body = await readFile(resolve(root, guide), 'utf8');
  const targets = new Set();
  // 管理入口使用普通 Markdown 链接；不解析 HTML、引用式链接或锚点内容。
  for (const [, raw] of body.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const url = raw.trim().replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(url)) continue;
    const path = decodeURIComponent(url.split(/[?#]/)[0]);
    const target = resolve(dirname(resolve(root, guide)), path);
    const name = relative(root, target);
    if (name.startsWith('../') || name === '..' || isAbsolute(name)) {
      errors.push(`${guide}：本地链接超出仓库：${url}`);
      continue;
    }
    targets.add(name);
    try { await access(target); }
    catch { errors.push(`${guide}：本地链接不存在：${url}`); }
  }
  linked.set(guide, targets);
}

for (const [directory, guide] of [['docs', 'docs/README.md'], ['docs/agents', 'docs/README.md'], ['tests', 'tests/README.md']]) {
  for (const name of await readdir(resolve(root, directory))) {
    if (name.endsWith('.md') && name !== 'README.md' && !linked.get(guide).has(`${directory}/${name}`)) {
      errors.push(`${directory}/${name} 未列入 ${guide}。`);
    }
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
  const matches = new Set(ignored.stdout.trim().split('\n'));
  for (const name of ignoredPaths) if (!matches.has(name)) errors.push(`缺少本地文件忽略规则：${name}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('文件管理检查通过：根目录归属、文档导航、管理入口链接、Git 本地文件隔离。');
}
