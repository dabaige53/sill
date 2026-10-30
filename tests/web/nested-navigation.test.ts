/** Preserve public controller behavior while its responsibilities move into modules. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./app-fixture.ts";

function nestedFixture(keyboard = true) {
	const f = fixture();
	const { w, Store } = f;
	const app = new w.ControllerTest.AppController();
	Object.assign(app, {
		dialog: f.app.dialog,
		desktop: () => true,
		grid: f.app.grid,
		refreshCard() {},
		gestures: { bindPullDown() {}, bindPush() {} },
		updateSelection() {},
		railHide: { atTop: () => true, hide() {}, show() {}, syncPosition() {} },
	});
	w.HTMLDialogElement.prototype.show = function () {
		this.open = true;
	};
	w.HTMLDialogElement.prototype.showModal = w.HTMLDialogElement.prototype.show;
	w.HTMLDialogElement.prototype.close = function () {
		this.open = false;
	};
	w.HTMLElement.prototype.getAnimations = () => [];
	Object.defineProperties(w.HTMLElement.prototype, {
		scrollHeight: { configurable: true, get: () => 2200 },
		clientHeight: { configurable: true, get: () => 700 },
	});
	w.document.documentElement.dataset.inputModality = keyboard ? "keyboard" : "pointer";
	w.document.body.insertAdjacentHTML("beforeend", '<button id="account">Account</button>');
	Store.state.cards = ["a", "b", "c"].map((id) => ({
		id,
		type: "article",
		title: id.toUpperCase(),
		body: `[Next](https://controller.test/#card/b)\n\n${"Body. ".repeat(100)}`,
	}));
	Store.state.items = {
		a: { seen: true, progress: 1, read: true },
		b: { seen: true },
		c: { seen: true },
	};
	w.history.replaceState({ prev: "#feed" }, "", "#feed");
	return {
		...f,
		app,
		motion: w.ControllerTest.MotionEngine,
		scroll: () => app.dialog.querySelector("#reader-scroll, .sheet-scroll"),
		back: () =>
			new Promise<void>((resolve) => {
				w.addEventListener(
					"popstate",
					() => {
						app.route();
						resolve();
					},
					{ once: true },
				);
				app.closeModal();
			}),
	};
}

test("nested navigation restores exact positions, focus and reader mode through back and forward", async () => {
	const f = nestedFixture();
	try {
		const { app, w } = f;
		app.navigate("#read/a");
		f.scroll().scrollTop = 480;
		app.dialog.querySelector('a[href="https://controller.test/#card/b"]').focus();
		app.navigate("#card/b");
		f.scroll().scrollTop = 260;
		app.navigate("#card/c");
		assert.deepEqual([...app.previewTrail], ["a", "b"]);
		await f.back();
		assert.equal(app.currentId, "b");
		assert.equal(f.scroll().scrollTop, 260);
		await f.back();
		assert.equal(w.location.hash, "#read/a");
		assert.equal(app.modalKind, "reader");
		assert.equal(
			f.scroll().scrollTop,
			480,
			"completed progress does not replace the session position",
		);
		assert.equal(w.document.activeElement.getAttribute("href"), "https://controller.test/#card/b");
		await new Promise<void>((resolve) => w.requestAnimationFrame(() => resolve()));
		assert.equal(
			f.scroll().scrollTop,
			480,
			"reader's deferred binding cannot reset restored scroll",
		);
		for (const target of ["b", "c"]) {
			await new Promise<void>((resolve) => {
				w.addEventListener(
					"popstate",
					() => {
						app.route();
						resolve();
					},
					{ once: true },
				);
				w.history.forward();
			});
			assert.equal(app.currentId, target);
		}
		assert.deepEqual([...app.previewTrail], ["a", "b"]);
		assert.equal(
			app.dialog.querySelector("[data-detail-face]"),
			null,
			"keyboard navigation stays immediate",
		);
	} finally {
		f.dom.window.close();
	}
});

test("resizing a child preserves the root card match and does not add a layer", () => {
	const f = nestedFixture();
	try {
		const calls: string[] = [];
		f.motion.matchSource = (_dialog: HTMLElement, source: HTMLElement) =>
			calls.push(source?.dataset.card || "none");
		f.app.grid.innerHTML = '<article data-card="a"></article><article data-card="b"></article>';
		f.app.navigate("#read/a");
		f.app.navigate("#card/b");
		f.app.navigate("#read/b");
		f.app.navigate("#card/b");
		assert.deepEqual(calls, ["a"]);
		assert.deepEqual([...f.app.previewTrail], ["a"]);
	} finally {
		f.dom.window.close();
	}
});

test("returning starts an exit over the restored parent and canceled completion cannot change a new layer", async () => {
	const f = nestedFixture(false);
	try {
		const { app, w } = f;
		const animations: any[] = [];
		w.__motionAnimations = animations;
		app.navigate("#card/a");
		f.motion.cancelPanel(app.dialog);
		f.scroll().scrollTop = 480;
		app.navigate("#card/b");
		const firstFace = app.dialog.querySelector("[data-detail-face]");
		assert.ok(firstFace);
		assert.equal(firstFace.inert, true);
		const enteringCount = animations.length;
		f.scroll().scrollTop = 80;
		f.scroll().dispatchEvent(new w.Event("scroll"));
		assert.equal(
			animations.length,
			enteringCount,
			"scrolling during entry cannot start a competing toolbar animation",
		);
		assert.equal(firstFace.isConnected, true);
		assert.equal(
			firstFace.querySelector("[id], [data-action], [data-card], a[href], iframe, video, audio"),
			null,
		);
		const before = animations.length;
		await f.back();
		assert.equal(f.scroll().scrollTop, 480);
		const exit = animations
			.slice(before)
			.find((a) => a.frames[1]?.transform === "translateY(10px)");
		assert.ok(exit);
		assert.ok(
			app.dialog.querySelector("[data-detail-face]"),
			"leaving surface remains until finish",
		);
		assert.equal(
			animations.slice(before).some((a) => a.frames[0]?.opacity === 0),
			false,
			"parent does not enter again",
		);
		app.navigate("#card/c");
		const currentFace = app.dialog.querySelector("[data-detail-face]");
		exit.finish();
		await Promise.resolve();
		await Promise.resolve();
		assert.equal(app.currentId, "c");
		assert.equal(w.location.hash, "#card/c");
		assert.equal(app.dialog.querySelector("[data-detail-face]"), currentFace);
		assert.equal(
			app.pageScrollLocked,
			false,
			"the already-open test fixture never acquires a new page lock",
		);
		assert.equal(
			currentFace.querySelector("[data-detail-face]"),
			null,
			"interruption does not recursively clone prior faces",
		);
	} finally {
		f.dom.window.close();
	}
});

test("a new account cannot recover another scope's parent or reading position", () => {
	const f = nestedFixture();
	try {
		f.app.desktop = () => false;
		f.app.navigate("#card/a");
		f.scroll().scrollTop = 480;
		f.app.navigate("#card/b");
		f.app.agentScope = () => ({ kind: "cloud", owner: "other" });
		f.app.navigate("#card/a");
		assert.deepEqual([...f.app.previewTrail], []);
		assert.equal(f.app.detailPositions.size, 0);
		assert.equal(f.scroll().scrollTop, 0);
	} finally {
		f.dom.window.close();
	}
});

test("the shrink control restores the same card and preserves its parent history", () => {
	const f = nestedFixture();
	try {
		for (const id of ["a", "b"]) {
			f.app.navigate(`#card/${id}`);
			const length = f.w.history.length;
			const parent = f.w.history.state.prev;
			f.app.navigate(`#read/${id}`);
			const shrink = f.app.dialog.querySelector('.reader-head [aria-label="退出全屏"]');
			f.app.action(shrink.dataset.action, shrink.dataset.id);
			assert.equal(f.app.currentId, id);
			assert.equal(f.app.modalKind, "preview");
			assert.equal(f.w.location.hash, `#card/${id}`);
			assert.equal(f.w.history.length, length);
			assert.equal(f.w.history.state.prev, parent);
		}
	} finally {
		f.dom.window.close();
	}
});

test("closing an expanded child returns straight to its parent without a second child history entry", async () => {
	const f = nestedFixture();
	try {
		f.app.navigate("#card/a");
		f.scroll().scrollTop = 480;
		f.app.navigate("#card/b");
		const length = f.w.history.length;
		f.app.navigate("#read/b");
		assert.equal(f.w.history.length, length);
		assert.equal(f.w.history.state.prev, "#card/a");
		await f.back();
		assert.equal(f.w.location.hash, "#card/a");
		assert.equal(f.app.currentId, "a");
		assert.equal(f.scroll().scrollTop, 480);
	} finally {
		f.dom.window.close();
	}
});

test("reopening the exiting child restores its exact content position before motion resumes", async () => {
	const f = nestedFixture(false);
	try {
		const animations: any[] = [];
		f.w.__motionAnimations = animations;
		f.app.navigate("#card/a");
		f.motion.cancelPanel(f.app.dialog);
		f.app.navigate("#card/b");
		f.scroll().scrollTop = 260;
		await f.back();
		const leaving = f.app.dialog.querySelector("[data-detail-face]");
		leaving.style.opacity = "0.6";
		leaving.style.transform = "matrix(1,0,0,1,0,4)";
		f.app.navigate("#card/b");
		assert.equal(f.scroll().scrollTop, 260);
		assert.equal(animations.at(-1).frames[0].opacity, "0.6");
		assert.equal(animations.at(-1).frames[0].transform, "matrix(1,0,0,1,0,4)");
	} finally {
		f.dom.window.close();
	}
});

test("phone AI and search refocus without scrolling and retain native caret selection", () => {
	const f = nestedFixture();
	try {
		f.app.dialog.innerHTML =
			'<div class="ai-composer"><textarea id="ai-local-draft">Draft text</textarea></div>' +
			'<div class="search-header"><div class="search-pill"><input id="filter-search" value="Query text"></div></div>';
		f.app.dialog.addEventListener("pointerdown", f.w.ControllerTest.focusPhoneField);
		for (const id of ["ai-local-draft", "filter-search"]) {
			const field = f.w.document.getElementById(id);
			const focus = field.focus.bind(field);
			const options: FocusOptions[] = [];
			field.focus = (value: FocusOptions) => {
				options.push(value);
				focus(value);
			};
			const tap = () => {
				const event = new f.w.MouseEvent("pointerdown", { bubbles: true, cancelable: true });
				field.dispatchEvent(event);
				return event;
			};
			assert.equal(tap().defaultPrevented, true);
			assert.equal(options[0].preventScroll, true);
			field.setSelectionRange(1, 4);
			assert.equal(tap().defaultPrevented, false, "the caret stays under native control");
			assert.equal(options.length, 1);
			assert.equal(field.selectionStart, 1);
			assert.equal(field.selectionEnd, 4);
			field.blur();
			assert.equal(tap().defaultPrevented, true);
			assert.equal(options[1].preventScroll, true);
			assert.ok(field.value.endsWith("text"), "refocusing keeps the draft");
		}
	} finally {
		f.dom.window.close();
	}
});

test("phone pages freeze the feed even at the top and restore its reading position", () => {
	const f = nestedFixture();
	try {
		f.app.desktop = () => false;
		f.w.document.body.insertAdjacentHTML(
			"afterbegin",
			'<div id="workspace-background"><main></main></div>',
		);
		const desk = f.w.document.getElementById("workspace-background");
		const main = desk.querySelector("main");
		let position = 0;
		Object.defineProperty(f.w, "scrollY", { get: () => position });
		f.w.scrollTo = (options: { top: number }) => {
			position = options.top;
		};
		for (const initial of [0, 240]) {
			position = initial;
			main.style.translate = "0 8px";
			f.app.lockPageScroll();
			assert.equal(desk.classList.contains("is-page-frozen"), true);
			assert.equal(position, 0, "native input focus starts from a document at the top");
			assert.equal(main.style.translate, `0 ${-initial}px`);
			f.app.lockPageScroll();
			f.app.unlockPageScroll();
			assert.equal(position, initial, "a repeated lock keeps the original reading position");
			assert.equal(main.style.translate, "0 8px");
			assert.equal(desk.classList.contains("is-page-frozen"), false);
		}
	} finally {
		f.dom.window.close();
	}
});

test("phone nested previews retain the mounted parent and its scroll position", () => {
	const f = nestedFixture();
	try {
		f.app.desktop = () => false;
		f.app.navigate("#card/a");
		const parent = f.app.dialog;
		f.scroll().scrollTop = 260;
		f.app.navigate("#card/b");
		assert.notEqual(f.app.dialog, parent);
		assert.equal(parent.inert, true);
		assert.equal(parent.querySelector(".sheet-scroll").scrollTop, 260);
		assert.equal(f.app.dialog.querySelector(".preview-sheet").classList.contains("is-full"), true);
		assert.equal(
			f.app.dialog.querySelector(".preview-sheet").style.getPropertyValue("--nested-sheet-height"),
			"",
		);
	} finally {
		f.dom.window.close();
	}
});

test("reader cards use a modal dialog and keep full-page mode for phone links", () => {
	const f = nestedFixture();
	try {
		f.app.desktop = () => false;
		f.app.dialog.close();
		let modalOpens = 0;
		f.app.dialog.showModal = function () {
			this.open = true;
			modalOpens++;
		};
		f.app.navigate("#read/a");
		assert.equal(modalOpens, 1);
		f.app.navigate("#card/b");
		assert.equal(f.app.modalKind, "reader");
		assert.equal(modalOpens, 1);
	} finally {
		f.dom.window.close();
	}
});
