/** Preserve public controller behavior while its responsibilities move into modules. */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents:
			"export {AppController} from './apps/web/views/app.ts'; export {Store} from './apps/web/data/store.ts'; export {Panels} from './apps/web/interactions/panels.ts';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "ControllerTest",
}).outputFiles[0].text;
function fixture() {
	const dom = new JSDOM('<main id="feed-grid"></main><dialog id="modal" open></dialog>', {
		url: "https://controller.test/",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: false, addEventListener() {} });
	w.structuredClone = structuredClone;
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
	w.eval(bundle);
	const { AppController, Store, Panels } = w.ControllerTest;
	Store.state = {
		cards: [{ id: "mail-one", type: "mail", title: "Synthetic mail", body: [] }],
		items: {},
		preferences: {},
	};
	Store.save = () => {};
	const app = Object.assign(Object.create(AppController.prototype), {
		dialog: w.document.getElementById("modal"),
		grid: w.document.getElementById("feed-grid"),
		modalKind: "",
		settingsGroup: "desk",
		homeSelected: new Set<string>(),
		applyPreferences() {},
		withFeedAnchor() {},
		refreshCard() {},
		announce() {},
	});
	return { dom, w, app, Store, Panels, observers };
}

test("closing photo tags returns to the same photo index", () => {
	const f = fixture();
	try {
		const { app, Store } = f;
		Store.state.cards = [
			{ id: "photo-one", type: "photo", title: "合成照片", photos: ["coast", "mountain"] },
		];
		app.currentId = "photo-one";
		app.modalKind = "lightbox";
		app.photoIndex = 1;
		app.panelReturn = null;
		app.openModal = (html: string, kind: string) => {
			app.dialog.innerHTML = html;
			app.modalKind = kind;
		};
		const returned: unknown[] = [];
		app.openCard = (id: string, reading: boolean) => {
			returned.push([id, reading]);
			app.modalKind = "lightbox";
			app.photoIndex = 0;
		};
		app.action = (...args: unknown[]) => returned.push(args);
		app.openPanel("editor", "photo-one");
		assert.equal(typeof app.panelReturn, "function");
		app.closeModal();
		assert.deepEqual(returned, [
			["photo-one", false],
			["photo-go", "photo-one", "1"],
		]);
		assert.equal(app.panelReturn, null);
	} finally {
		f.dom.window.close();
	}
});

test("settings changes preserve focus, scroll, the previous value and unrelated preferences", () => {
	const f = fixture();
	try {
		const { app, Store, Panels, w } = f;
		app.modalKind = "settings";
		app.dialog.innerHTML = Panels.settings(app, "desk");
		const main = app.dialog.querySelector(".settings-main");
		main.scrollTop = 83;
		const toggle = app.dialog.querySelector('[data-action="pref-toggle"][data-id="stack"]');
		toggle.focus();
		Store.setPref("theme", "dark");
		let applied = 0,
			anchored = 0;
		app.applyPreferences = () => applied++;
		app.withFeedAnchor = () => anchored++;
		assert.equal(app.setPref("stack", false), true);
		assert.equal(Store.pref("stack"), false);
		assert.equal(Store.pref("theme"), "dark");
		assert.equal(applied, 1);
		assert.equal(anchored, 1);
		assert.equal(app.dialog.querySelector(".settings-main").scrollTop, 83);
		assert.equal(w.document.activeElement.dataset.id, "stack");
		assert.equal(w.document.activeElement.getAttribute("aria-checked"), "false");
	} finally {
		f.dom.window.close();
	}
});

test("action visibility toggles hide and restore only the requested verb", () => {
	const f = fixture();
	try {
		f.Store.setPref("hiddenActions", ["reply"]);
		f.app.action("action-toggle", "bookmark");
		assert.deepEqual(Array.from(f.Store.pref("hiddenActions")), ["reply", "bookmark"]);
		f.app.action("action-toggle", "reply");
		assert.deepEqual(Array.from(f.Store.pref("hiddenActions")), ["bookmark"]);
		f.app.action("action-toggle", "bookmark");
		assert.deepEqual(Array.from(f.Store.pref("hiddenActions")), []);
	} finally {
		f.dom.window.close();
	}
});

test("public action routes refresh, reminder aliases, detail navigation and unknown names", () => {
	const f = fixture();
	try {
		const calls: unknown[] = [];
		f.app.gestures = { refresh: () => calls.push("refresh") };
		f.app.changeReminder = (...args: unknown[]) => calls.push(args);
		f.app.navigate = (route: string) => calls.push(route);
		f.app.action("refresh");
		f.app.action("retry");
		for (const name of ["snooze", "dismiss-reminder", "complete-reminder", "restore-reminder"])
			f.app.action(name, "reminder-one");
		f.app.action("card-open", "mail-one");
		f.app.action("reader", "mail-one");
		assert.deepEqual(calls, [
			"refresh",
			"refresh",
			["reminder-one", "snooze"],
			["reminder-one", "dismiss-reminder"],
			["reminder-one", "complete-reminder"],
			["reminder-one", "restore-reminder"],
			"#card/mail-one",
			"#read/mail-one",
		]);
		for (const name of [
			"unknown",
			"toString",
			"constructor",
			"__proto__",
			new f.w.String("settings"),
			null,
			undefined,
		]) {
			assert.equal(f.app.action(name), undefined);
		}
		assert.equal(calls.length, 8);
	} finally {
		f.dom.window.close();
	}
});

for (const scenario of ["opened", "declined", "account-changed", "disconnected"]) {
	test(`external mail action marks read only after an accepted opening in the same account: ${scenario}`, async () => {
		const f = fixture();
		try {
			let owner = "synthetic-a",
				complete: (opened: boolean) => void,
				opened = 0,
				alerts = 0;
			const pending = new Promise<boolean>((resolve) => {
				complete = resolve;
			});
			f.app.agentScope = () => {
				if (scenario === "disconnected") throw new Error("Synthetic disconnection");
				return { kind: "cloud", owner };
			};
			f.app.alert = () => alerts++;
			f.app.openExternal = () => {
				opened++;
				return pending;
			};
			f.app.action("external", "mail-one");
			assert.equal(f.Store.item("mail-one").read, false);
			if (scenario === "account-changed") owner = "synthetic-b";
			complete(scenario !== "declined");
			await new Promise((resolve) => setImmediate(resolve));
			assert.equal(f.Store.item("mail-one").read, scenario === "opened");
			assert.equal(opened, scenario === "disconnected" ? 0 : 1);
			assert.equal(alerts, scenario === "disconnected" ? 1 : 0);
		} finally {
			f.dom.window.close();
		}
	});
}

for (const sourceRow of [true, false]) {
	test(`preview chrome tracks height and close-disc position after resize (${sourceRow ? "source row" : "title fallback"})`, () => {
		const f = fixture();
		try {
			const { app, observers, w } = f;
			app.dialog.innerHTML = `<div class="preview-sheet"><div class="sheet-scroll"><div class="preview-body">${sourceRow ? '<div class="preview-meta">Synthetic source</div>' : ""}<h1 id="modal-title" style="line-height:28px">Synthetic title</h1></div></div></div>`;
			const sheet = app.dialog.querySelector(".preview-sheet"),
				scroll = sheet.querySelector(".sheet-scroll"),
				anchor = sheet.querySelector(sourceRow ? ".preview-meta" : "#modal-title");
			let top = 80,
				height = 400;
			sheet.getBoundingClientRect = () => ({ top: 20 });
			anchor.getBoundingClientRect = () => ({ top, height: 20 });
			Object.defineProperty(sheet, "offsetHeight", { get: () => height });
			let destroyed = 0,
				disconnected = 0;
			app.sheetHide = { destroy: () => destroyed++ };
			app.previewSizeObserver = { disconnect: () => disconnected++ };
			app.bindSheetChrome();
			assert.equal(destroyed, 1);
			assert.equal(disconnected, 1);
			assert.equal(app.dialog.style.getPropertyValue("--preview-height"), "400px");
			assert.equal(
				sheet.style.getPropertyValue("--preview-title-top"),
				sourceRow ? "48px" : "52px",
			);
			assert.equal(observers[0].nodes.length, 2);
			top = 100;
			height = 500;
			scroll.scrollTop = 20;
			observers[0].callback();
			assert.equal(app.dialog.style.getPropertyValue("--preview-height"), "500px");
			assert.equal(
				sheet.style.getPropertyValue("--preview-title-top"),
				sourceRow ? "88px" : "92px",
			);
			scroll.dispatchEvent(new w.Event("scroll"));
			assert.equal(sheet.classList.contains("is-scrolled"), true);
			scroll.scrollTop = 0;
			top = 0;
			observers[0].callback();
			assert.equal(sheet.style.getPropertyValue("--preview-title-top"), "4px");
			app.sheetHide.destroy();
			app.previewSizeObserver.disconnect();
		} finally {
			f.dom.window.close();
		}
	});
}
