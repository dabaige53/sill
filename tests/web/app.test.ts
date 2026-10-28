/** Preserve public controller behavior while its responsibilities move into modules. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { fixture } from "./app-fixture.ts";

test("opening a card from Markdown navigates the existing surface without opening the link", () => {
	const f = fixture();
	try {
		f.app.dialog.innerHTML =
			'<div class="markdown"><a href="http://127.0.0.1:4318/#card/mail-one" target="_blank">Mail</a></div>';
		let destination = "";
		f.app.navigate = (route: string) => {
			destination = route;
		};
		const event = new f.w.MouseEvent("click", { bubbles: true, cancelable: true });
		f.app.dialog.addEventListener("click", (e: MouseEvent) => f.app.click(e));
		f.app.dialog.querySelector("a").dispatchEvent(event);
		assert.equal(destination, "#card/mail-one");
		assert.equal(event.defaultPrevented, true);
	} finally {
		f.dom.window.close();
	}
});

test("closing photo tags returns to the same photo index", () => {
	const f = fixture();
	try {
		const { app, Store } = f;
		Store.state.cards = [
			{ id: "photo-one", type: "photo", title: "合成照片", images: ["coast", "mountain"] },
		];
		app.currentId = "photo-one";
		app.modalKind = "lightbox";
		app.photoIndex = 1;
		app.panelReturn = null;
		app.openModal = (html: string, kind: string) => {
			app.dialog.innerHTML = typeof html === "string" ? html : renderToStaticMarkup(html);
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

for (const phone of [false, true]) {
	test(`reminder completion and restore retain the open ${phone ? "phone" : "desktop"} preview`, () => {
		const f = fixture();
		try {
			const { app, Store, Panels, w } = f;
			w.matchMedia = () => ({ matches: phone, addEventListener() {} });
			const reminder = {
				id: "reminder-one",
				type: "reminder",
				title: "Synthetic reminder",
				body: "Keep this detail open",
			};
			Store.state.cards = [reminder];
			Store.patch(reminder.id, { bookmarked: true, note: "Keep this note" });
			app.currentId = reminder.id;
			app.modalKind = "preview";
			app.dialog.innerHTML = Panels.preview(app, reminder);
			w.history.replaceState({ glass: true, prev: "#feed" }, "", "#card/reminder-one");
			const sheet = app.dialog.querySelector(".preview-sheet");
			const scroll = app.dialog.querySelector(".sheet-scroll");
			const button = app.dialog.querySelector(".reminder-check");
			sheet.classList.add("is-full");
			scroll.scrollTop = 170;
			button.focus();
			let closes = 0;
			let refreshes = 0;
			app.closeToDesk = () => closes++;
			app.refreshCard = () => refreshes++;
			app.checkReminders = () => {};
			w.document.body.insertAdjacentHTML("beforeend", '<button id="account">Account</button>');

			for (const done of [true, false]) {
				app.action(button.dataset.action, reminder.id);
				assert.equal(Store.item(reminder.id).reminderDone, done);
				assert.equal(button.dataset.action, done ? "restore-reminder" : "complete-reminder");
				assert.equal(button.getAttribute("aria-pressed"), String(done));
				assert.equal(button.querySelector(".check-dot").classList.contains("is-done"), done);
				assert.equal(!!button.querySelector("svg"), done);
				assert.equal(app.dialog.open, true);
				assert.equal(app.dialog.querySelector(".preview-sheet"), sheet);
				assert.equal(sheet.classList.contains("is-full"), true);
				assert.equal(scroll.scrollTop, 170);
				assert.equal(w.document.activeElement, button);
				assert.equal(w.location.hash, "#card/reminder-one");
			}
			assert.equal(closes, 0);
			assert.equal(refreshes, 0, "background changes wait until the detail closes");
			assert.equal(Store.item(reminder.id).bookmarked, true);
			assert.equal(Store.item(reminder.id).note, "Keep this note");
			app.action("dismiss-reminder", reminder.id);
			assert.equal(closes, 1, "dismiss keeps its existing close behavior");
		} finally {
			f.dom.window.close();
		}
	});
}

test("manual capture actions, shortcut and panel no longer create a note", () => {
	const f = fixture();
	try {
		const before = JSON.stringify(f.Store.state.cards);
		const dialog = f.app.dialog.innerHTML;
		f.app.action("capture");
		f.app.action("capture-save");
		f.app.openPanel("capture");
		assert.equal(f.app.dialog.innerHTML, dialog);
		f.app.dialog.open = false;
		const event = new f.w.KeyboardEvent("keydown", { key: "n", cancelable: true, bubbles: true });
		f.w.document.addEventListener("keydown", (e) => f.app.key(e));
		f.app.grid.dispatchEvent(event);
		assert.equal(event.defaultPrevented, false);
		assert.equal(f.app.dialog.open, false);
		assert.equal(JSON.stringify(f.Store.state.cards), before);
	} finally {
		f.dom.window.close();
	}
});

test("the settings button receives press feedback after keyboard use", async () => {
	const f = fixture();
	try {
		const { w } = f;
		const animations: any[] = [];
		w.__motionAnimations = animations;
		const button = w.document.createElement("button");
		button.id = "account";
		button.className = "home-account";
		w.document.body.append(button);
		w.document.documentElement.dataset.inputModality = "keyboard";
		w.ControllerTest.MotionEngine.bind();
		const press = new w.MouseEvent("pointerdown", { button: 0, bubbles: true });
		Object.defineProperty(press, "isPrimary", { value: true });
		button.dispatchEvent(press);
		assert.equal(w.document.documentElement.dataset.inputModality, "pointer");
		assert.equal(animations.length, 1);
		assert.equal(animations[0].target, button);
		animations[0].finish();
		await Promise.resolve();
		assert.equal(button.style.transform, "scale(0.97)");
		w.document.dispatchEvent(new w.Event("pointerup"));
		animations.at(-1).finish();
		await Promise.resolve();
		assert.equal(button.style.transform, "");
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

for (const layout of ["source row", "title fallback", "podcast"]) {
	test(`preview chrome tracks height and close-disc position after resize (${layout})`, () => {
		const f = fixture();
		try {
			const { app, observers, w } = f;
			const sourceRow = layout === "source row",
				podcast = layout === "podcast";
			app.dialog.innerHTML = `<div class="preview-sheet"><div class="sheet-scroll"><div class="preview-body">${podcast ? '<div class="podcast-detail"></div>' : ""}${sourceRow ? '<div class="preview-meta">Synthetic source</div>' : ""}<h1 id="modal-title" style="line-height:28px">Synthetic title</h1></div></div></div>`;
			const sheet = app.dialog.querySelector(".preview-sheet"),
				scroll = sheet.querySelector(".sheet-scroll"),
				anchor = sheet.querySelector(sourceRow ? ".preview-meta" : "#modal-title");
			let top = 80,
				height = 400;
			sheet.getBoundingClientRect = () => ({ top: 20 });
			anchor.getBoundingClientRect = () => ({ top: top * 0.9, height: 18 });
			Object.defineProperties(anchor, {
				offsetTop: { get: () => top - 20 },
				offsetHeight: { value: 20 },
				offsetParent: { value: sheet },
			});
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
				podcast ? "var(--space-8)" : sourceRow ? "48px" : "52px",
			);
			assert.equal(observers[0].nodes.length, 2);
			top = 100;
			height = 500;
			scroll.scrollTop = 20;
			observers[0].callback();
			assert.equal(app.dialog.style.getPropertyValue("--preview-height"), "500px");
			assert.equal(
				sheet.style.getPropertyValue("--preview-title-top"),
				podcast ? "var(--space-8)" : sourceRow ? "68px" : "72px",
			);
			scroll.dispatchEvent(new w.Event("scroll"));
			assert.equal(sheet.classList.contains("is-scrolled"), true);
			scroll.scrollTop = 0;
			top = 0;
			observers[0].callback();
			assert.equal(
				sheet.style.getPropertyValue("--preview-title-top"),
				podcast ? "var(--space-8)" : "4px",
			);
			app.sheetHide.destroy();
			app.previewSizeObserver.disconnect();
		} finally {
			f.dom.window.close();
		}
	});
}
