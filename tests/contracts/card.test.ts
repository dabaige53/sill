import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Card } from "../../contracts/card.ts";
import { cardFixtures as fixtures } from "../../contracts/card-fixtures.ts";
import { LocalRepository } from "../../server/local/repository.ts";

for (const sample of fixtures.valid)
	test(`accept and preserve ${sample.name}`, () =>
		assert.deepEqual(Card.parse(sample.card), sample.card));
for (const sample of fixtures.invalid)
	test(`reject ${sample.name}`, () => assert.equal(Card.safeParse(sample.card).success, false));
