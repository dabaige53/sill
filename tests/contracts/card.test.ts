import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Card, normalizeCard } from '../../contracts/card.ts';
import { LocalRepository } from '../../server/local-state.mjs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixtures = JSON.parse(readFileSync(new URL('../../contracts/fixtures.json', import.meta.url), 'utf8'));
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
