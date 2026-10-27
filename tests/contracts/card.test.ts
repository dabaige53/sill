import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Card, normalizeCard } from "../../contracts/card.ts";
import { cardFixtures as fixtures } from "../../contracts/card-fixtures.ts";
import { LocalRepository } from "../../server/local/repository.ts";

const migrationFixtures = JSON.parse(
	readFileSync(new URL("../../contracts/migration-fixtures.json", import.meta.url), "utf8"),
) as {
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
}

test("legacy files read without rewriting and save every migration fixture in one batch", () => {
	const directory = mkdtempSync(join(tmpdir(), "sill-migration-"));
	const file = join(directory, "cards.json");
	const inputs = migrationFixtures.cases.map((sample) => sample.input);
	const expected = migrationFixtures.cases.map((sample) => sample.expected);
	const original =
		JSON.stringify(
			{
				revision: 3,
				state: { cards: inputs, items: {}, seconds: 0, preferences: {} },
			},
			null,
			2,
		) + "\n";
	writeFileSync(file, original);
	try {
		const repository = new LocalRepository(file);
		assert.equal(readFileSync(file, "utf8"), original);
		const cards = repository.snapshot().state.cards;
		assert.deepEqual(cards, expected);
		const edited = cards.map((card) => ({ ...card, title: card.title + " edited" }));
		repository.apply({
			expectedRevision: 3,
			operations: edited.map((card, index) => ({
				op: "card.upsert",
				card,
				before: cards[index],
			})),
		});
		const restarted = new LocalRepository(file);
		assert.deepEqual(
			restarted.snapshot().state.cards,
			expected.map((card) => ({
				...card,
				title: card.title + " edited",
			})),
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

for (const sample of fixtures.valid)
	test(`accept and preserve ${sample.name}`, () =>
		assert.deepEqual(Card.parse(sample.card), sample.card));
for (const sample of fixtures.invalid)
	test(`reject ${sample.name}`, () => assert.equal(Card.safeParse(sample.card).success, false));
