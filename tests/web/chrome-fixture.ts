/** Bars that tuck away while reading, IME-safe search and quiet search results. */
import path from "node:path";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { installReactBrowserAPIs } from "./react-browser-fixture.ts";

export const bundle = buildSync({
	stdin: {
		contents:
			"export {ChromeAutoHide, toolbarTips} from './apps/web/interactions/chrome.ts'; export {Panels} from './apps/web/interactions/panels.ts'; export {AppController} from './apps/web/views/app.ts'; export {Store} from './apps/web/data/store.ts';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	alias: {
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "ChromeTest",
}).outputFiles[0].text;

export function fixture() {
	const dom = new JSDOM(
		`<!doctype html><div id="scroll"></div><div id="bar"><button id="bar-button">收藏</button></div><div id="edge"></div><span id="filter-result"></span><div id="search-results"></div>`,
		{ url: "http://chrome.test/", runScripts: "outside-only", pretendToBeVisual: true },
	);
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: false, addEventListener() {} });
	w.structuredClone = structuredClone;
	installReactBrowserAPIs(w);
	w.eval(bundle);
	const scroll = w.document.getElementById("scroll");
	let top = 0;
	Object.defineProperty(scroll, "scrollTop", { get: () => top, configurable: true });
	Object.defineProperty(scroll, "scrollHeight", { get: () => 4000, configurable: true });
	Object.defineProperty(scroll, "clientHeight", { get: () => 800, configurable: true });
	const bar = w.document.getElementById("bar"),
		edge = w.document.getElementById("edge");
	const hide = new w.ChromeTest.ChromeAutoHide(scroll, () => [bar, edge]);
	const to = (y: number) => {
		top = y;
		scroll.dispatchEvent(new w.Event("scroll"));
	};
	const tucked = () => bar.classList.contains("is-tucked") && edge.classList.contains("is-tucked");
	return {
		dom,
		w,
		hide,
		to,
		tucked,
		bar,
		position: (y: number) => {
			top = y;
		},
	};
}

