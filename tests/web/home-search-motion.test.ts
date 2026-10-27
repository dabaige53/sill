/** Measured condition flight and icon swaps, without a browser or workspace data. */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const source = buildSync({
	stdin: {
		contents:
			"export {searchChoiceOrigin,flySearchChoice,syncSearchIcon} from './apps/web/views/home-search-motion.ts';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "SearchMotion",
	alias: {
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
}).outputFiles[0].text;

test("condition icons travel from the chosen row; icon swaps use the reference spring and keyboard picks stay immediate", () => {
	const dom = new JSDOM(
		'<div id="field"><span class="home-search-leading"><span data-search-icon="search"></span><span data-search-icon="condition"></span></span><button data-action="home-hash" data-extra="tag:Work"><span class="home-option-icon"></span></button><button class="home-search-token" data-extra="tag"><span class="home-condition-icon"></span></button></div>',
		{ url: "https://search.test", runScripts: "outside-only", pretendToBeVisual: true },
	);
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: false });
	w.eval(source);
	w.__motionAnimations = [];
	const field = w.document.querySelector("#field");
	field.querySelector(".home-option-icon").getBoundingClientRect = () => ({
		left: 25,
		top: 100,
		width: 16,
		height: 16,
	});
	field.querySelector(".home-condition-icon").getBoundingClientRect = () => ({
		left: 75,
		top: 30,
		width: 12,
		height: 12,
	});
	try {
		const { searchChoiceOrigin, flySearchChoice, syncSearchIcon } = w.SearchMotion;
		const from = searchChoiceOrigin(field, "tag:Work");
		flySearchChoice(field, "tag", from);
		const flight = w.__motionAnimations.at(-1);
		assert.equal(flight.options.duration, 280);
		assert.deepEqual([...flight.options.ease], [0.32, 0.72, 0, 1]);
		assert.match(flight.frames[0].transform, /translate\(-50px, 70px\) scale\(1\.333/);
		syncSearchIcon(field, false);
		syncSearchIcon(field, true);
		assert.equal(field.querySelector(".home-search-leading").dataset.selected, "true");
		assert.equal(w.__motionAnimations.at(-1).options.duration, 300);
		assert.equal(w.__motionAnimations.at(-1).options.bounce, 0);
		const count = w.__motionAnimations.length;
		w.document.documentElement.dataset.inputModality = "keyboard";
		flySearchChoice(field, "tag", from);
		syncSearchIcon(field, false);
		assert.equal(w.__motionAnimations.length, count);
		assert.equal(field.querySelector("[data-search-icon=search]").style.opacity, "1");
	} finally {
		dom.window.close();
	}
});
