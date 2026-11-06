/** AI conversation rules: heights, statuses, history groups, the phone page and the desktop box. */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { nextHeight } from "../../apps/web/data/ai-conversation.ts";
import { installReactBrowserAPIs } from "./react-browser-fixture.ts";

// @wu-test type=behavior | scope=nextHeight | protects=Keep the AI box collapsed when no session exists
test("without a session the box never grows", () => {
	for (const event of ["open", "full", "shrink", "escape"] as const)
		assert.equal(nextHeight("line", event, false), "line");
});

const bundle = buildSync({
	stdin: {
		contents:
			"export {PanelViews} from './apps/web/interactions/panels-components.tsx'; export {Panels} from './apps/web/interactions/panels.ts'; export {AppController} from './apps/web/views/app.ts'; export {Store} from './apps/web/data/store.ts'; export {AIDock} from './apps/web/views/shell.tsx'; export {renderView} from './apps/web/views/react-renderer.ts'; export {createElement} from 'react';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	// The app imports images for Vite; tests need no pixels.
	loader: { ".png": "empty" },
	alias: {
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
		// The bare "motion" alias would otherwise capture the React entry as a subpath.
		"motion/react": path.resolve(
			import.meta.dirname,
			"../../node_modules/motion/dist/es/react.mjs",
		),
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "AITest",
	logLevel: "silent",
}).outputFiles[0].text;

function fixture(desktop = true) {
	const dom = new JSDOM(`<!doctype html><div id="dock"></div>`, {
		url: "http://ai.test/",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.matchMedia = (q: string) => ({
		matches: desktop ? q.includes("min-width") : q.includes("max-width"),
		addEventListener() {},
	});
	w.structuredClone = structuredClone;
	w.ResizeObserver = class {
		observe() {}
		disconnect() {}
	};
	installReactBrowserAPIs(w);
	w.eval(bundle);
	const { Store } = w.AITest;
	Store.load();
	Store.state.cards = [
		{ id: "task-1", type: "task", title: "Task one" },
		{ id: "mail-1", type: "mail", title: "Mail one" },
	];
	return { dom, w, Store };
}

// @wu-test type=behavior | scope=AIDock collapse and restore | protects=Preserve the visible shell and draft when collapse is reversed
test("tapping restore during collapse keeps the drawn shell until reversal and preserves the draft", async () => {
	const f = fixture();
	try {
		const { w } = f;
		w.__motionAnimations = [];
		w.HTMLElement.prototype.setPointerCapture = () => {};
		w.HTMLElement.prototype.getBoundingClientRect = function () {
			const box = this.matches?.("[data-ai-collapse-visual]")
				? [
						parseFloat(this.style.left),
						parseFloat(this.style.top),
						parseFloat(this.style.width),
						parseFloat(this.style.height),
					]
				: this.matches?.(".ai-dock-tools button")
					? [810, 710, 36, 36]
					: this.matches?.(".ai-dock.is-collapsed")
						? [798, 698, 60, 60]
						: [200, 700, 640, 60];
			return {
				left: box[0],
				top: box[1],
				width: box[2],
				height: box[3],
				right: box[0] + box[2],
				bottom: box[1] + box[3],
			};
		};
		const host = w.document.getElementById("dock");
		w.AITest.renderView(host, w.AITest.createElement(w.AITest.AIDock));
		const input = w.document.querySelector("#ai-dock-input");
		input.value = "Keep my draft";
		w.document.querySelector(".ai-dock-tools button").click();
		await Promise.resolve();
		const visual = w.document.querySelector("[data-ai-collapse-visual]");
		assert.ok(visual);
		visual.style.clipPath = "inset(0px 300px 0px 0px round 30px)";
		const restore = w.document.querySelector("#ai-dock .ai-dock-restore");
		const down = new w.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 820 });
		Object.defineProperty(down, "pointerId", { value: 1 });
		restore.dispatchEvent(down);
		assert.equal(
			visual.isConnected,
			true,
			"a tap must not complete the collapse before reversing it",
		);
		restore.dispatchEvent(new w.MouseEvent("pointerup", { bubbles: true, button: 0 }));
		restore.click();
		await Promise.resolve();
		assert.equal(visual.isConnected, false);
		assert.ok(w.document.querySelector("[data-ai-collapse-visual]"));
		assert.equal(w.document.querySelector("#ai-dock-input"), input);
		assert.equal(input.value, "Keep my draft");
		assert.equal(w.document.querySelector("#ai-dock").classList.contains("is-collapsed"), false);
		w.AITest.renderView(host, null);
	} finally {
		f.dom.window.close();
	}
});
