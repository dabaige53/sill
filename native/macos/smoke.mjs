import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { once } from 'node:events';
const runtime = resolve(process.argv[2] || 'dist/macos/Sill.app/Contents/Resources/runtime');
const temp = await mkdtemp(resolve(tmpdir(), 'sill-native-smoke-'));
let child;
let stderr = ''; 
async function start() {
  child = spawn(resolve(runtime, 'service-lock'), [resolve(temp, 'cards.json.lock'), resolve(runtime, 'node'), resolve(runtime, 'launch.mjs'), resolve(temp, 'cards.json')], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const [output] = await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw Error('Service exited before ready: ' + stderr); })]);
  const port = Number(String(output).trim());
  assert.ok(Number.isInteger(port) && port > 0, 'Service did not start: ' + String(output) + stderr);
  return `http://127.0.0.1:${port}`;
}
async function stop() { if (child.exitCode !== null || child.signalCode !== null) return; const exited = once(child, 'exit'); child.kill(); await exited; }
try {
  let base = await start();
  const second = spawn(resolve(runtime, 'service-lock'), [resolve(temp, 'cards.json.lock'), resolve(runtime, 'node'), resolve(runtime, 'launch.mjs'), resolve(temp, 'cards.json')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let secondOutput = '';
  second.stdout.on('data', chunk => { secondOutput += chunk; });
  const [secondCode] = await once(second, 'exit');
  assert.notEqual(secondCode, 0, 'second repository process must be rejected');
  assert.match(secondOutput, /另一个进程/);

  const state = async () => (await fetch(base + '/api/local/state')).json();
  const apply = async (revision, operations) => {
    const response = await fetch(base + '/api/local/operations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: revision, operations }) });
    return { status: response.status, value: await response.json() };
  };
  assert.equal((await state()).revision, 0);
  const card = { id: 'native-test', type: 'note', title: '原生笔记', body: ['正文'], points: ['保留已有字段'], tags: ['测试'] };
  let result = await apply(0, [{ op: 'card.upsert', card }]);
  assert.equal(result.status, 200);
  const revision = result.value.revision;
  result = await apply(revision, [{ op: 'item.patch', id: card.id, values: { bookmarked: true, later: true, read: true } }]);
  assert.equal(result.status, 200);
  const draft = { id: card.id, title: '未保存的草稿', body: '草稿正文', revision, original: Buffer.from(JSON.stringify(card)).toString('base64') };
  await writeFile(resolve(temp, 'draft.json'), JSON.stringify(draft));
  result = await apply(revision, [{ op: 'card.upsert', card: { ...card, title: draft.title } }]);
  assert.equal(result.status, 409);
  assert.equal(JSON.parse(await readFile(resolve(temp, 'draft.json'))).title, draft.title);
  assert.equal((await state()).state.cards[0].title, card.title);
  const killed = once(child, 'exit'); child.kill('SIGKILL'); await killed;
  base = await start(); // The kernel must release a crashed owner without manual data changes.
  let snapshot = await state();
  assert.equal(snapshot.state.items[card.id].bookmarked, true);
  assert.deepEqual(snapshot.state.cards[0].points, card.points);
  result = await apply(snapshot.revision, [{ op: 'card.upsert', card: { ...snapshot.state.cards[0], title: '合并后的笔记' } }]);
  assert.equal(result.status, 200);
  assert.deepEqual(result.value.state.cards[0].points, card.points);
  result = await apply(result.value.revision, [{ op: 'card.delete', id: card.id }]);
  assert.equal(result.status, 200);
  assert.equal(result.value.state.cards.length, 0);
  await stop(); base = await start();
  assert.equal((await state()).state.cards.length, 0);
  console.log('PASS: bundled service startup, exclusive second-instance rejection, stale lock recovery, CRUD, item states, restart, revision conflict, retained draft, preserved card fields');
} finally { if (child?.exitCode === null) await stop(); await rm(temp, { recursive: true, force: true }); }
