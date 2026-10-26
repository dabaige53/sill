import path from "node:path";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { installReactBrowserAPIs } from "./react-browser-fixture.ts";

const source = buildSync({
	stdin: {
		contents: `
		export {mountExample} from './apps/web/motion-library/runtime.tsx';
		export {initializeExampleStore} from './apps/web/motion-library/fixtures.ts';
		export {catalog} from './apps/web/motion-library/catalog.ts';
		export {Store} from './apps/web/data/store.ts';
	`,
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "tsx",
	},
	bundle: true,
	write: false,
	format: "iife",
	globalName: "MotionLibraryTest",
	platform: "browser",
	jsx: "automatic",
	define: { "process.env.NODE_ENV": '"production"', "import.meta.env.DEV": "false" },
	alias: {
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
}).outputFiles[0].text;

export function libraryFixture(id: string, { cover = false, width = 960 } = {}) {
	const dom = new JSDOM('<!doctype html><main class="motion-canvas"></main>', {
		url: `http://127.0.0.1:4310/motion/examples/${id}/`,
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	installReactBrowserAPIs(w);
	w.structuredClone = structuredClone;
	w.matchMedia = (query: string) => ({
		matches: query.includes("max-width:650px")
			? width <= 650
			: query.includes("min-width: 651px") || query.includes("min-width:651px")
				? width > 650
				: false,
		addEventListener() {},
		removeEventListener() {},
	});
	w.ResizeObserver = class {
		observe() {}
		disconnect() {}
	};
	w.CSS = { escape: (text: string) => text };
	w.scrollTo = () => {};
	w.Element.prototype.getAnimations = () => [];
	w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} });
	w.Element.prototype.scrollIntoView = () => {};
	w.Element.prototype.getBoundingClientRect = () => ({
		left: 40,
		top: 160,
		right: 380,
		bottom: 360,
		width: 340,
		height: 200,
		x: 40,
		y: 160,
		toJSON() {},
	});
	w.Element.prototype.getClientRects = function () {
		return [this.getBoundingClientRect()];
	};
	w.HTMLDialogElement.prototype.showModal = w.HTMLDialogElement.prototype.show = function () {
		this.open = true;
	};
	w.HTMLDialogElement.prototype.close = function () {
		this.open = false;
	};
	const computed = w.getComputedStyle.bind(w);
	w.getComputedStyle = (node: HTMLElement, pseudo?: string) =>
		pseudo
			? { transform: node.getAttribute("aria-checked") === "true" ? "translateX(20px)" : "none" }
			: computed(node);
	let reads = 0,
		writes = 0,
		network = 0;
	Object.defineProperty(w, "localStorage", {
		value: {
			getItem() {
				reads++;
				return null;
			},
			setItem() {
				writes++;
			},
		},
	});
	w.fetch = () => {
		network++;
		throw new Error("unexpected_example_network");
	};
	w.eval(source);
	const api = w.MotionLibraryTest;
	api.initializeExampleStore();
	const entry = api.catalog.find((entry: { id: string }) => entry.id === id);
	const runtime = api.mountExample(entry, w.document.querySelector("main"), cover);
	const click = (selector: string) => {
		const node = w.document.querySelector(selector);
		if (!node) throw new Error(`missing_action:${id}:${selector}`);
		node.click();
		return node;
	};
	return { dom, w, api, runtime, click, isolation: () => ({ reads, writes, network }) };
}

const pageSource = buildSync({
	entryPoints: [path.resolve(import.meta.dirname, "../../apps/web/motion-library/index.tsx")],
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	jsx: "automatic",
	loader: { ".css": "empty" },
	define: { "process.env.NODE_ENV": '"production"' },
}).outputFiles[0].text;

export async function libraryPageFixture() {
	const dom = new JSDOM('<!doctype html><div id="root"></div>', {
		url: "http://127.0.0.1:4310/motion/",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	installReactBrowserAPIs(w);
	w.ResizeObserver = class {
		callback: any;
		constructor(callback: any) {
			this.callback = callback;
		}
		observe() {
			this.callback([{ contentRect: { width: 960 } }]);
		}
		disconnect() {}
	};
	const settle = () => new Promise((done) => setTimeout(done, 20));
	w.eval(pageSource);
	await settle();
	const change = async (selector: string, value: string) => {
		const node = w.document.querySelector(selector);
		const prototype =
			node.tagName === "SELECT"
				? w.HTMLSelectElement.prototype
				: node.tagName === "TEXTAREA"
					? w.HTMLTextAreaElement.prototype
					: w.HTMLInputElement.prototype;
		Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, value);
		node.dispatchEvent(
			new w.Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }),
		);
		await settle();
	};
	return { dom, w, settle, change };
}
