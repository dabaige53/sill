/** Phone content starts one step larger; desktop sizes, controls and the shared settings stay as they are. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const foundation = JSON.parse(read("design-system/tokens/foundation.json"));
const tokensCSS = read("apps/web/styles/tokens.css");
const appearance = read("apps/web/styles/appearance.css");

const phoneBlock = () => {
	const start = appearance.indexOf("@media (max-width: 650px) {");
	assert.ok(start >= 0, "appearance has a phone block");
	let depth = 0;
	for (let i = appearance.indexOf("{", start); i < appearance.length; i++) {
		if (appearance[i] === "{") depth++;
		if (appearance[i] === "}" && --depth === 0) return appearance.slice(start, i + 1);
	}
	throw new Error("unterminated phone block");
};

test("the phone text start is one design token with the same value in the web stylesheet", () => {
	const token = foundation.density.tokens.find((t: any) => t.name === "text-phone-scale");
	assert.ok(token, "text-phone-scale is a design token");
	assert.equal(token.value, "1.07");
	assert.match(tokensCSS, new RegExp(`--text-phone-scale: ${token.value.replace(".", "\\.")};`));
});

test("only phone cards and previews multiply the shared text settings by the phone start", () => {
	const phone = phoneBlock();
	assert.match(
		phone,
		/\.feed-card \{\s*--content-text-scale: calc\(var\(--card-text-scale, 1\) \* var\(--text-phone-scale, 1\)\);/,
	);
	assert.match(
		phone,
		/\.preview-body \{\s*--content-text-scale: calc\(var\(--reader-text-scale, 1\) \* var\(--text-phone-scale, 1\)\);/,
	);
	// Preview text matches the reader body, so expanding keeps the same size.
	assert.match(
		phone,
		/\.preview-body \.preview-full \{\s*font-size: calc\(var\(--text-reader-body\) \* var\(--reader-text-scale, 1\)\);/,
	);
	// Desktop rules keep the plain setting; the reader body is never multiplied.
	const desktop = appearance.slice(0, appearance.indexOf("@media (max-width: 650px) {"));
	assert.doesNotMatch(desktop, /text-phone-scale/);
	assert.doesNotMatch(phone, /\.reader-body \{[^}]*text-phone-scale/);
});

test("navigation and controls do not use the phone text start", () => {
	for (const file of [
		"apps/web/styles/controls.css",
		"apps/web/styles/form-controls.css",
		"apps/web/styles/panels.css",
		"apps/web/styles/phone.css",
		"apps/web/styles/overlay-actions.css",
	])
		assert.doesNotMatch(read(file), /text-phone-scale/, file);
});
