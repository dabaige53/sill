/** Startup sequencing in a synthetic DOM; no browser or real local data. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const root = path.resolve(import.meta.dirname, "../..");
const bundle = buildSync({
	stdin: {
		contents: `export {startLocalWorkspace} from './apps/web/services/local-launch.ts';
export {renderView,releaseView} from './apps/web/views/react-renderer.ts';
export {createElement as h} from 'react';`,
		resolveDir: root,
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "LaunchTest",
}).outputFiles[0].text;

for (const slow of [false, true]) {
	test(`${slow ? "slow" : "fast"} local startup retains the shell and reveals real cards once`, async () => {
		const dom = new JSDOM('<header>Sill</header><main id="feed-grid"></main>', {
			url: "https://sill.test/#feed",
			runScripts: "outside-only",
		});
		const w = dom.window as any;
		w.matchMedia = () => ({ matches: false });
		w.eval(bundle);
		const api = w.LaunchTest;
		const grid = w.document.querySelector("main");
		const header = w.document.querySelector("header");
		let delay = 0;
		let placeholder = () => {};
		let cleared = false;
		w.setTimeout = (callback: () => void, ms: number) => {
			placeholder = callback;
			delay = ms;
			return 1;
		};
		w.clearTimeout = () => (cleared = true);
		const renders: boolean[] = [];
		let routes = 0;
		const app = {
			grid,
			initializing: false,
			deskView: () => api.h("article", { "data-card": "ready" }, "Ready"),
			init() {
				this.renderCurrent(false);
			},
			renderCurrent(animate: boolean) {
				renders.push(animate);
				api.renderView(grid, this.deskView());
			},
			route() {
				assert.equal(this.initializing, false);
				routes++;
			},
		};
		let ready!: () => void;
		const pending = new Promise<void>((resolve) => (ready = resolve));
		try {
			const launch = api.startLocalWorkspace(app, () => pending);
			assert.equal(w.document.body.style.visibility, "");
			assert.equal(grid.getAttribute("aria-busy"), "true");
			assert.equal(grid.querySelector("[data-card]"), null);
			assert.equal(grid.querySelector(".feed-skeleton"), null);
			assert.equal(delay, 300);
			if (slow) {
				placeholder();
				assert.ok(grid.querySelector(".feed-skeleton"));
				assert.equal(grid.querySelector("[data-card]"), null);
			}
			ready();
			await launch;
			assert.equal(w.document.querySelector("header"), header);
			assert.equal(grid.querySelector("[data-card]").textContent, "Ready");
			assert.equal(grid.querySelector(".feed-skeleton"), null);
			assert.equal(grid.hasAttribute("aria-busy"), false);
			assert.equal(cleared, true);
			assert.equal(routes, 1);
			assert.deepEqual(
				renders,
				slow ? [false, false, false] : [false, false],
				"all first cards appear together without stagger",
			);
		} finally {
			api.releaseView(grid);
			dom.window.close();
		}
	});
}

test("the head resolves the cached or system theme before application rendering", () => {
	const html = readFileSync(path.join(root, "apps/web/index.html"), "utf8");
	const script = html.match(/<script id="sill-theme-bootstrap">([\s\S]*?)<\/script>/)![1];
	for (const [preference, systemDark, expected] of [
		["dark", false, "dark"],
		["light", true, "light"],
		["system", true, "dark"],
	] as const) {
		const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
			url: "https://sill.test",
			runScripts: "outside-only",
		});
		try {
			dom.window.localStorage.setItem("sill-theme", preference);
			dom.window.matchMedia = () => ({ matches: systemDark }) as MediaQueryList;
			dom.window.eval(script);
			assert.equal(dom.window.document.documentElement.dataset.theme, expected);
			assert.equal(dom.window.document.documentElement.style.colorScheme, expected);
		} finally {
			dom.window.close();
		}
	}
});
