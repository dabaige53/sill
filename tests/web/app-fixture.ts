/** Preserve public controller behavior while its responsibilities move into modules. */
import path from "node:path";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { installReactBrowserAPIs } from "./react-browser-fixture.ts";

export const bundle = buildSync({
	stdin: {
		contents:
			"export {AppController} from './apps/web/views/app.ts'; export {Store} from './apps/web/data/store.ts'; export {Panels} from './apps/web/interactions/panels.ts'; export {PanelViews} from './apps/web/interactions/panels-components.tsx'; export {MotionEngine} from './apps/web/interactions/motion.ts'; export {renderContent} from './apps/web/views/react-renderer.ts';",
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
	globalName: "ControllerTest",
}).outputFiles[0].text;
export function fixture() {
	const dom = new JSDOM('<main id="feed-grid"></main><dialog id="modal" open></dialog>', {
		url: "https://controller.test/",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: false, addEventListener() {} });
	w.structuredClone = structuredClone;
	const computed = w.getComputedStyle.bind(w);
	w.getComputedStyle = (el: Element, pseudo?: string) =>
		pseudo === "::before" || el.classList.contains("toggle-knob")
			? {
					transform:
						(el.classList.contains("toggle-knob") ? el.parentElement : el).getAttribute(
							"aria-checked",
						) === "true"
							? "translateX(20px)"
							: "none",
				}
			: computed(el);
	w.CSS = { escape: (value: string) => value };
	const observers: any[] = [];
	w.ResizeObserver = class {
		nodes = [];
		disconnected = false;
		callback: () => void;
		constructor(callback: () => void) {
			this.callback = callback;
			observers.push(this);
		}
		observe(node: any) {
			this.nodes.push(node);
		}
		disconnect() {
			this.disconnected = true;
		}
	};
	installReactBrowserAPIs(w);
	w.eval(bundle);
	const { AppController, Store, Panels } = w.ControllerTest;
	Store.state = {
		cards: [{ id: "mail-one", type: "mail", title: "Synthetic mail", body: "" }],
		items: {},
		preferences: {},
	};
	Store.save = () => {};
	const app = Object.assign(Object.create(AppController.prototype), {
		dialog: w.document.getElementById("modal"),
		grid: w.document.getElementById("feed-grid"),
		modalKind: "",
		detailPositions: new Map(),
		detailScope: "",
		previewTrail: [],
		settingsGroup: "desk",
		homeSelected: new Set<string>(),
		applyPreferences() {},
		withFeedAnchor() {},
		refreshCard() {},
		announce() {},
	});
	return { dom, w, app, Store, Panels, observers };
}
