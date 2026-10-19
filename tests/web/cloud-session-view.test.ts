/** Account resets clear retained view snapshots; only explicitly locked editor drafts survive. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { installReactBrowserAPIs } from "./react-browser-fixture.ts";

const root = path.resolve(import.meta.dirname, "../..");
const source = readFileSync(path.join(root, "apps/web/cloud-entry.ts"), "utf8");
const start = source.indexOf("function clearCloud(");
const end = source.indexOf("function cloudConnection()", start);
assert.ok(start >= 0 && end > start);
const bundle = buildSync({
	stdin: {
		contents:
			"export {AppController} from './apps/web/views/app.ts'; export {Store} from './apps/web/data/store.ts'; export {Panels} from './apps/web/interactions/panels.ts';",
		resolveDir: root,
		loader: "ts",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "SessionViewTest",
}).outputFiles[0].text;
// Exercise the actual reset function without starting cloud polling or a network session.
const reset = buildSync({
	stdin: {
		contents: source.slice(start, end) + "\nwindow.__clearCloudTest = clearCloud;",
		loader: "ts",
	},
	write: false,
	format: "iife",
	platform: "browser",
}).outputFiles[0].text;
const modalGuardStart = source.indexOf("const originalOpen = app.openModal.bind(app);");
const modalGuardEnd = source.indexOf("const originalClose =", modalGuardStart);
const panelGuardStart = source.indexOf("const localOpenPanel = app.openPanel.bind(app);");
const panelGuardEnd = source.indexOf("app.cloudSavedAccount =", panelGuardStart);
assert.ok(modalGuardStart >= 0 && modalGuardEnd > modalGuardStart);
assert.ok(panelGuardStart >= 0 && panelGuardEnd > panelGuardStart);
const navigationGuards = buildSync({
	stdin: {
		contents:
			source.slice(modalGuardStart, modalGuardEnd) + source.slice(panelGuardStart, panelGuardEnd),
		loader: "ts",
	},
	write: false,
	format: "iife",
	platform: "browser",
}).outputFiles[0].text;

function fixture() {
	const dom = new JSDOM(
		'<!doctype html><div id="feed-grid"></div><button id="account">Settings</button><dialog id="modal"></dialog><dialog id="selection-menu"></dialog>',
		{ url: "https://session.test/#search", runScripts: "outside-only", pretendToBeVisual: true },
	);
	const w = dom.window as any;
	w.structuredClone = structuredClone;
	w.matchMedia = () => ({ matches: true, addEventListener() {} });
	w.CSS = { escape: (value: string) => value };
	w.HTMLDialogElement.prototype.show = function () {
		this.open = true;
	};
	w.HTMLDialogElement.prototype.showModal = w.HTMLDialogElement.prototype.show;
	w.HTMLDialogElement.prototype.close = function () {
		this.open = false;
	};
	w.HTMLElement.prototype.getAnimations = () => [];
	installReactBrowserAPIs(w);
	w.eval(bundle);
	const { AppController, Store, Panels } = w.SessionViewTest;
	Store.state = Store.fresh();
	Store.state.cards = [
		{ id: "session-card", type: "article", title: "Synthetic account title", body: ["Body"] },
	];
	Store.save = () => {};
	Store.load = () => {
		Store.state = Store.fresh();
	};
	const app = new AppController();
	app.grid = w.document.getElementById("feed-grid");
	app.dialog = w.document.getElementById("modal");
	app.modalKind = "search";
	app.dialog.className = "search page";
	app.searchFilter.query = "Synthetic";
	app.dialog.innerHTML = Panels.search(app);
	app.dialog.show();
	app.dialog.querySelector("#search-results").scrollTop = 180;
	app.homeSelected.add("session-card");
	app.searchSelected.add("session-card");
	app.aiSelectionIds = ["session-card"];
	app.currentId = "session-card";
	app.panelReturn = () => app.restoreSearch();
	app.lastFocus = app.dialog.querySelector(".card-title-button");
	app.setNav = () => {};
	app.updateSelection = () => {};
	app.pauseMedia = () => {};
	app.renderCurrent = () => app.grid.replaceChildren();
	const menu = w.document.getElementById("selection-menu");
	menu.innerHTML = '<article data-card="session-card">Synthetic menu clone</article>';
	app.drag = {
		menu,
		cancel() {
			menu.close();
		},
	};
	const Cloud = {
		user: "synthetic-owner",
		epoch: 0,
		drafts: new Map(),
		records: new Map(),
		edit: null,
		editLocked: false,
	};
	Object.assign(w, {
		app,
		Cloud,
		Store,
		sync: { pending: [], reset() {} },
		stashCloudDraft() {},
		accountView() {},
		paintCloudDraft() {},
		copy: (key: string) => key,
	});
	w.eval(reset);
	return { dom, w, app, Store, Cloud, clear: w.__clearCloudTest };
}

for (const kind of ["search", "preview", "reader", "ai"])
	for (const retainDrafts of [false, true])
		test(`${retainDrafts ? "Session expiry" : "Logout"} clears the ${kind} view and retained search without restoring account content`, () => {
			const f = fixture();
			try {
				if (kind !== "search") {
					f.app.suspendSearch();
					f.app.modalKind = kind;
					f.app.dialog.className = kind === "ai" ? "page" : kind;
					f.app.dialog.innerHTML = "<textarea>Synthetic unsaved AI draft</textarea>";
					f.app.dialog.show();
				}
				// An already-started exit must not delay the security cleanup.
				f.app.sheetLeaving = kind === "preview";
				const token = f.app.modalToken;
				f.clear({ retainDrafts });
				assert.equal(f.Cloud.user, null);
				assert.equal(f.Store.state.cards.length, 0);
				assert.equal(f.app.dialog.open, false);
				assert.equal(f.app.dialog.childNodes.length, 0);
				assert.equal(f.w.document.querySelectorAll("[data-card],#search-background").length, 0);
				assert.equal(f.app.homeSelected.size, 0);
				assert.equal(f.app.searchSelected.size, 0);
				assert.equal(f.app.aiSelectionIds.length, 0);
				assert.equal(f.app.searchFilter.query, "");
				assert.equal(f.app.searchScroll, 0);
				assert.equal(f.app.panelReturn, null);
				assert.equal(f.app.searchFocus, undefined);
				assert.equal(f.app.lastFocus, null);
				assert.ok(f.app.modalToken > token);
				assert.equal(f.w.location.hash, "#feed");
			} finally {
				f.dom.window.close();
			}
		});

test("session expiry keeps an explicit locked editor draft but removes its previous search context", () => {
	const f = fixture();
	try {
		f.app.suspendSearch();
		f.app.modalKind = "cloud-editor";
		f.app.dialog.innerHTML =
			'<form id="cloud-editor"><input value="Keep this draft" disabled><p id="cloud-save-status"></p></form>';
		f.app.dialog.show();
		const draft = { values: { title: "Keep this draft" }, locked: false };
		f.Cloud.drafts.set("new", draft);
		f.clear({ retainDrafts: true });
		assert.equal(f.app.dialog.open, true);
		assert.equal(f.app.dialog.querySelector("input").value, "Keep this draft");
		assert.equal(f.app.dialog.querySelector("input").disabled, false);
		assert.equal(draft.locked, true);
		assert.equal(f.Cloud.editLocked, true);
		assert.equal(f.app.searchBackground, undefined);
		assert.equal(f.app.panelReturn, null);
		assert.equal(f.app.searchSelected.size, 0);
		assert.equal(f.w.document.querySelectorAll("[data-card]").length, 0);
	} finally {
		f.dom.window.close();
	}
});

test("uncertain cloud save blocks search before it can change the route or replace the draft", () => {
	const f = fixture();
	try {
		f.w.history.replaceState({ glass: true, prev: null }, "", "#feed");
		f.app.lastRouteHash = "#feed";
		f.app.modalKind = "cloud-editor";
		f.app.dialog.innerHTML = '<input id="cloud-title" value="Uncertain draft">';
		f.app.dialog.querySelector("input").focus();
		f.app.toast = () => {};
		f.w.Cloud.pending = { key: "synthetic-write" };
		f.w.eval(navigationGuards);
		const historyLength = f.w.history.length;
		assert.doesNotThrow(() =>
			f.app.key({
				key: "k",
				ctrlKey: true,
				target: f.w.document.activeElement,
				preventDefault() {},
			}),
		);
		assert.equal(f.w.location.hash, "#feed");
		assert.equal(f.w.history.length, historyLength);
		assert.equal(f.app.lastRouteHash, "#feed");
		assert.equal(f.app.modalKind, "cloud-editor");
		assert.equal(f.app.dialog.querySelector("#cloud-title").value, "Uncertain draft");
		assert.equal(f.w.document.activeElement.id, "cloud-title");
		assert.equal(f.app.searchBackground, undefined);

		// Resolving the write allows the same shortcut to open search normally.
		f.w.Cloud.pending = null;
		f.app.openModal = (html: string, kind: string) => {
			f.app.dialog.innerHTML = typeof html === "string" ? html : renderToStaticMarkup(html);
			f.app.modalKind = kind;
		};
		f.app.revealImages = () => {};
		f.app.openPanel("search");
		assert.equal(f.w.location.hash, "#search");
		assert.equal(f.app.modalKind, "search");
		assert.ok(f.app.dialog.querySelector("#search-results"));
	} finally {
		f.dom.window.close();
	}
});
