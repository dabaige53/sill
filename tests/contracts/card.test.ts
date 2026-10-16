import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Card, normalizeCard } from '../../contracts/card.ts';
import { LocalRepository } from '../../server/local/repository.ts';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixtures = JSON.parse(readFileSync(new URL('../../contracts/fixtures.json', import.meta.url), 'utf8'));
const migrationFixtures = JSON.parse(readFileSync(new URL('../../contracts/migration-fixtures.json', import.meta.url), 'utf8')) as {
  cases: { name: string; input: Record<string, any>; expected: Record<string, any> }[];
};
for (const sample of migrationFixtures.cases) {
  test(`migration accepts and preserves ${sample.name}`, () => {
    const original = structuredClone(sample.input);
    const normalized = normalizeCard(sample.input as Parameters<typeof normalizeCard>[0]);
    assert.deepEqual(normalized, sample.expected);
    assert.deepEqual(Card.parse(normalized), sample.expected);
    assert.deepEqual(sample.input, original);
  });
  test(`legacy file reads without rewriting and saves ${sample.name}`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'sill-migration-'));
    const file = join(directory, 'cards.json');
    const original = JSON.stringify({
      revision: 3,
      state: { cards: [sample.input], items: {}, seconds: 0, preferences: {} },
    }, null, 2) + '\n';
    writeFileSync(file, original);
    try {
      const repository = new LocalRepository(file);
      assert.equal(readFileSync(file, 'utf8'), original);
      const card = repository.snapshot().state.cards[0];
      assert.deepEqual(card, sample.expected);
      const edited = { ...card, title: card.title + ' edited' };
      repository.apply({ expectedRevision: 3, operations: [{ op: 'card.upsert', card: edited, before: card }] });
      const restarted = new LocalRepository(file);
      assert.deepEqual(restarted.snapshot().state.cards[0], { ...sample.expected, title: edited.title });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}
for (const sample of fixtures.valid) test(`accept and preserve ${sample.name}`, () => assert.deepEqual(Card.parse(sample.card), sample.card));
for (const sample of fixtures.invalid) test(`reject ${sample.name}`, () => assert.equal(Card.safeParse(sample.card).success, false));
test('source migration preserves sender, unknown fields and the original input', () => {
  const old = { id: 'mail', type: 'mail', title: 'Message', source: 'Sender', kind: 'mail', extra: { version: 3 } };
  const original = structuredClone(old);
  assert.deepEqual(normalizeCard(old), { id: 'mail', type: 'mail', title: 'Message', sender: 'Sender', sources: [{ name: '邮件', kind: 'mail' }], extra: { version: 3 } });
  assert.deepEqual(old, original);
  assert.deepEqual(normalizeCard({ id: 'agent', type: 'note', title: 'Result', source: 'OpenClaw', kind: 'ai' }).sources, [{ name: 'OpenClaw', kind: 'agent' }]);
});
test('reading old data does not rewrite its file; saving retains future fields', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sill-contract-'));
  const file = join(directory, 'cards.json');
  const state = { cards: [{ id: 'old', type: 'future-card', title: 'Old', source: 'RSS', kind: 'rss', custom: { value: 4 } }], items: {}, seconds: 0, preferences: {} };
  const original = JSON.stringify({ revision: 3, state });
  writeFileSync(file, original);
  try {
    const repository = new LocalRepository(file);
    assert.equal(readFileSync(file, 'utf8'), original);
    const card = repository.snapshot().state.cards[0];
    repository.apply({ expectedRevision: 3, operations: [{ op: 'card.upsert', card: { ...card, title: 'New' }, before: card }] });
    assert.deepEqual(repository.snapshot().state.cards[0].custom, { value: 4 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
