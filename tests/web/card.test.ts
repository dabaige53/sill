import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCard } from '../../apps/web/data/card-validation.ts';
import { cardHTML } from '../../apps/web/cards/templates.ts';
import { Store } from '../../apps/web/data/store.ts';
import { SeedCards, FreshCards } from '../../apps/web/data/cards.ts';
import { JSDOM } from 'jsdom';

const fixtures = JSON.parse(readFileSync(new URL('../../contracts/fixtures.json', import.meta.url), 'utf8'));
for (const sample of fixtures.valid) test(`Web accepts and preserves ${sample.name}`, () => assert.deepEqual(parseCard(sample.card), sample.card));
for (const sample of fixtures.invalid) test(`Web rejects ${sample.name}`, () => assert.throws(() => parseCard(sample.card)));
test('demo cards use the shared schema and unknown card types render generically', () => {
  for (const card of [...SeedCards, ...FreshCards]) assert.deepEqual(parseCard(card), card);
  Store.state = Store.fresh();
  const card = fixtures.valid.find(sample => sample.name === 'future-card').card;
  assert.match(cardHTML(card), /Synthetic future-card/);
  assert.deepEqual(parseCard(card).custom, { nested: ['preserve'] });
});
test('unknown card types cannot inject attributes or call renderer helper methods', () => {
  Store.state = Store.fresh();
  for (const type of ['__proto__', 'constructor', 'head', 'future\" onpointerenter=\"alert(1)']) {
    const card = parseCard({ id: 'future', type, title: 'Future' });
    const document = new JSDOM(cardHTML(card)).window.document;
    assert.equal(document.querySelector('article').getAttribute('onpointerenter'), null);
    assert.match(document.querySelector('h2').textContent, /Future/);
  }
});
