import assert from "node:assert/strict";
import test from "node:test";
import { assetURL } from "../../apps/web/data/assets.ts";
import { Card } from "../../contracts/card.ts";

test("images accept HTTPS and retain bundled artwork", () => {
	for (const image of [
		"architecture",
		"coast",
		"mountain",
		"botanical",
		"https://images.example.org/photo.jpg?size=800",
	]) {
		assert.ok(assetURL(image));
		assert.ok(
			Card.safeParse({ id: "photo", type: "photo", title: "Photo", images: [image] }).success,
		);
	}
});
test("images reject non HTTPS and credentials", () => {
	for (const image of [
		"http://example.org/a.jpg",
		"javascript:alert(1)",
		"data:image/png;base64,AA",
		"https://user:pass@example.org/a",
		"missing",
		"https://",
	]) {
		assert.equal(assetURL(image), undefined);
		assert.equal(
			Card.safeParse({ id: "photo", type: "photo", title: "Photo", images: [image] }).success,
			false,
		);
	}
});
