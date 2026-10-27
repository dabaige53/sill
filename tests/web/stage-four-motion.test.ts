/** Synthetic geometry and state only; no browser, media network or account data. */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents: `export * from './apps/web/interactions/ai-collapse.ts';export * from './apps/web/interactions/ai-context-motion.ts';export * from './apps/web/interactions/phone-search-motion.ts';`,
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	write: false,
	platform: "browser",
	format: "iife",
	globalName: "ReviewTest",
	alias: {
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
}).outputFiles[0].text;
function fixture(markup = "") {
	const dom = new JSDOM(markup, { runScripts: "outside-only", pretendToBeVisual: true });
	const w = dom.window as any;
	const animations: any[] = [];
	w.__motionAnimations = animations;
	w.matchMedia = () => ({ matches: false });
	w.eval(bundle);
	return { dom, w, api: w.ReviewTest, animations, document: w.document };
}
const rect = (left: number, top: number, width: number, height: number) => ({
	left,
	top,
	width,
	height,
	right: left + width,
	bottom: top + height,
});

test("AI collapse clips towards the clicked button and preserves unscaled content and draft", () => {
	const f = fixture(
		'<div id="ai-dock" style="border-radius:30px"><div class="ai-dock-surface"></div><div class="ai-dock-row"><input value="Keep draft"><span data-ai-context="one">Reference</span></div><button class="ai-dock-restore">AI</button></div>',
	);
	try {
		const node = f.document.querySelector("#ai-dock");
		node.getBoundingClientRect = () => rect(240, 700, 600, 60);
		const anchor = rect(790, 650, 36, 36);
		const target = f.api.anchoredBubble(anchor, 60);
		assert.equal(target.left + target.width / 2, anchor.left + anchor.width / 2);
		assert.equal(target.top + target.height / 2, anchor.top + anchor.height / 2);
		const captured = f.api.captureAIDock(node, null);
		node.getBoundingClientRect = () => target;
		const visual = f.api.animateAIDock(node, captured, true);
		assert.ok(visual.frame.isConnected);
		const shape = f.animations.find((animation) => "clipPath" in animation.frames[0]);
		assert.equal(shape.options.duration, 260);
		assert.equal(
			f.animations.some((animation) =>
				animation.frames.some((frame: any) => String(frame.transform).includes("scaleX")),
			),
			false,
		);
		assert.equal(visual.frame.querySelector("[id]"), null);
		assert.equal(visual.frame.querySelector("input").value, "Keep draft");
		assert.equal(visual.frame.querySelector("[data-ai-context]").textContent, "Reference");
		// A new gesture must sample the visible crop before the old visual is removed.
		visual.frame.getBoundingClientRect = () => rect(240, 638, 600, 122);
		visual.frame.style.clipPath = "inset(10px 20px 30px 40px round 30px)";
		const interrupted = f.api.captureAIDock(node, visual);
		assert.deepEqual(JSON.parse(JSON.stringify(interrupted.rect)), {
			left: 280,
			top: 648,
			width: 540,
			height: 82,
		});
		visual.cancel();
		assert.equal(visual.frame.isConnected, false);
		assert.equal(node.querySelector("input").value, "Keep draft");
		assert.equal(node.classList.contains("has-collapse-visual"), false);
	} finally {
		f.dom.window.close();
	}
});

test("AI reference fade and travel use independent durations and removal waits for travel", async () => {
	const f = fixture('<span id="chip">Reference</span>');
	try {
		const node = f.document.querySelector("#chip");
		const entry = f.api.contextMotion(node, true);
		assert.equal(f.animations[0].options.duration, 500);
		assert.equal(f.animations[1].options.duration, 180);
		entry.cancel();
		const exit = f.api.contextMotion(node, false);
		assert.equal(f.animations.at(-2).options.duration, 220);
		assert.equal(f.animations.at(-1).options.duration, 140);
		let done = false;
		void exit.finished.then(() => (done = true));
		f.animations.at(-1).finish();
		await Promise.resolve();
		assert.equal(done, false);
		f.animations.at(-2).finish();
		await exit.finished;
		assert.equal(done, true);
		node.getBoundingClientRect = () => rect(0, 30, 100, 20);
		f.api.reflowContext(node, rect(0, 0, 100, 20));
		assert.equal(f.animations.at(-1).options.duration, 280);
	} finally {
		f.dom.window.close();
	}
});

test("phone search follows the supplied choreography and reverses from the drawn header", () => {
	const f = fixture(
		'<div id="dock"><nav><button>Home</button><button>AI</button><button>Search</button></nav></div><dialog class="search"><div class="search-page-heading">Search</div><div class="search-header"><div class="search-pill"><input id="filter-search"><button class="search-clear"></button><button class="search-dictate"></button></div><button class="search-cancel">取消</button></div><div class="search-results-region"><section class="search-suggest"></section><div id="search-results"><div class="search-browse">Categories</div></div></div></dialog>',
	);
	try {
		const dialog = f.document.querySelector("dialog"),
			header = f.document.querySelector(".search-header"),
			input = f.document.querySelector("input");
		Object.defineProperty(f.w.performance, "now", { value: () => 0 });
		header.getBoundingClientRect = () =>
			rect(20, dialog.classList.contains("search-editing") ? 12 : 88, 350, 44);
		f.document.querySelector(".search-cancel").getBoundingClientRect = () => rect(330, 12, 40, 44);
		input.focus();
		f.api.transitionPhoneSearch(dialog, true);
		assert.equal(f.document.activeElement === input, true);
		const shift = f.animations.find(
			(animation) => animation.target === header && "transform" in animation.frames[0],
		);
		assert.equal(shift.options.duration, 410);
		assert.equal(shift.frames[0].transform, "translate(0px, 76px)");
		assert.deepEqual(Array.from(shift.options.ease), [0.2, 0.85, 0.22, 1]);
		assert.ok(
			!f.animations.some(
				(animation) => animation.target === f.document.querySelector(".search-suggest"),
			),
			"card suggestions wait for the keyboard; the header move does not carry them",
		);
		const nav = f.document.querySelector("#dock");
		for (const actor of [nav, f.document.querySelector(".search-browse")]) {
			const travel = f.animations.find(
				(animation) => animation.target === actor && "transform" in animation.frames[0],
			);
			assert.equal(
				travel.options.ease,
				"ease",
				"browse and navigation use the attachment's CSS default curve",
			);
		}
		assert.equal(nav.inert, true);
		assert.equal(f.document.querySelectorAll("nav button").length, 3);
		assert.equal(f.document.querySelector(".keyboard"), null);
		// Retarget a half-drawn header, without jumping to either static endpoint first.
		header.getBoundingClientRect = () => rect(20, 44, 350, 44);
		const pose = f.api.capturePhoneSearch(dialog);
		header.getBoundingClientRect = () =>
			rect(20, dialog.classList.contains("search-editing") ? 12 : 88, 350, 44);
		f.api.transitionPhoneSearch(dialog, false, pose);
		const reverse = f.animations.filter((animation) => animation.target === header).at(-1);
		assert.equal(reverse.frames[0].transform, "translate(0px, -44px)");
		assert.equal(nav.inert, false);
		f.api.resetPhoneSearch(dialog);
		assert.equal(nav.style.visibility, "");
	} finally {
		f.dom.window.close();
	}
});
