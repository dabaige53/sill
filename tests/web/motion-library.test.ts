import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { catalog, describe } from "../../apps/web/motion-library/catalog.ts";
import {
	criteria,
	readReviews,
	reviewKey,
	reviewStatus,
	saveReviews,
} from "../../apps/web/motion-library/reviews.ts";
import { libraryFixture, libraryPageFixture } from "./motion-library-fixture.ts";

const root = resolve(import.meta.dirname, "../..");
test("every stable animation ID has real source files, copy and explicit native availability", () => {
	assert.equal(new Set(catalog.map((entry) => entry.id)).size, catalog.length);
	for (const entry of catalog) {
		for (const file of [entry.component, entry.implementation, entry.native])
			assert.ok(existsSync(resolve(root, file)), file);
		for (const key of ["title", "trigger", "end", "location", "differences"])
			assert.ok(describe(entry, key), `${entry.id}:${key}`);
		assert.notEqual(entry.platforms.macos, "preview");
	}
	assert.equal(
		catalog.find((entry) => entry.id === "detail.sheet").platforms.web,
		"not-applicable",
	);
});

test("every example and cover mounts only a local product component", () => {
	for (const entry of catalog)
		for (const cover of [false, true]) {
			const f = libraryFixture(entry.id, { cover, width: entry.id === "detail.sheet" ? 390 : 960 });
			try {
				assert.ok(f.w.document.querySelector(".motion-island").children.length, entry.id);
				assert.equal(f.w.document.querySelector("#home-top"), null, entry.id);
				assert.equal(f.w.document.querySelector("#nav"), null, entry.id);
				assert.deepEqual(f.isolation(), { reads: 0, writes: 0, network: 0 }, entry.id);
				const ids = [...f.w.document.querySelectorAll("[id]")].map((node: any) => node.id);
				assert.equal(ids.length, new Set(ids).size, `duplicate IDs:${entry.id}`);
			} finally {
				f.dom.window.close();
			}
		}
});

test("real task row changes fixture state in both directions and reset restores defaults", () => {
	const f = libraryFixture("task.mark");
	try {
		f.click('[data-action="task"]');
		assert.equal(
			f.w.document.querySelector('[role="checkbox"]').getAttribute("aria-checked"),
			"true",
		);
		assert.deepEqual([...f.api.Store.item("motion-task").taskDone], ["motion-task-1"]);
		f.click('[data-action="task"]');
		assert.equal(
			f.w.document.querySelector('[role="checkbox"]').getAttribute("aria-checked"),
			"false",
		);
		f.api.initializeExampleStore();
		assert.equal(f.api.Store.tasks(f.api.Store.card("motion-task"))[0].done, false);
		assert.deepEqual(f.isolation(), { reads: 0, writes: 0, network: 0 });
	} finally {
		f.dom.window.close();
	}
});

test("the extracted setting row toggles without a panel or workspace write", () => {
	const f = libraryFixture("settings.toggle");
	try {
		const before = f.api.Store.pref("fadeRead");
		f.click('[role="switch"]');
		assert.equal(f.api.Store.pref("fadeRead"), !before);
		assert.equal(f.w.document.querySelectorAll(".setting-row").length, 1);
		f.click('[role="switch"]');
		assert.equal(f.api.Store.pref("fadeRead"), before);
		assert.deepEqual(f.isolation(), { reads: 0, writes: 0, network: 0 });
	} finally {
		f.dom.window.close();
	}
});

test("press example uses the real bookmark state", () => {
	const f = libraryFixture("control.press");
	try {
		f.click('[data-action="bookmark"]');
		assert.equal(f.api.Store.item("motion-card-1").bookmarked, true);
	} finally {
		f.dom.window.close();
	}
});

test("card arrival, departure and sorting mutate the actual card collection", () => {
	const first = libraryFixture("feed.first-entry");
	try {
		assert.equal(first.w.document.querySelectorAll("#feed-grid [data-card]").length, 0);
		assert.equal(first.runtime.canTrigger("mount"), true);
		first.runtime.event("mount");
		assert.equal(first.w.document.querySelectorAll("#feed-grid [data-card]").length, 3);
		assert.equal(first.runtime.canTrigger("mount"), false);
	} finally {
		first.dom.window.close();
	}
	for (const [id, event, count] of [
		["feed.arrival", "receive", 4],
		["feed.departure", "remove", 2],
	] as const) {
		const f = libraryFixture(id);
		try {
			f.runtime.event(event);
			assert.equal(f.w.document.querySelectorAll("#feed-grid [data-card]").length, count);
		} finally {
			f.dom.window.close();
		}
	}
	const f = libraryFixture("feed.reorder");
	try {
		const order = () =>
			[...f.w.document.querySelectorAll("#feed-grid [data-card]")].map(
				(node: any) => node.dataset.card,
			);
		const before = order();
		f.click('[data-id="floatTimely"]');
		assert.notDeepEqual(order(), before);
		assert.deepEqual([...order()].sort(), [...before].sort());
		f.click('[data-id="floatTimely"]');
		assert.deepEqual(order(), before);
	} finally {
		f.dom.window.close();
	}
});

test("search focus, text and clearing retain the product field state", () => {
	const f = libraryFixture("search.resize");
	try {
		const field = f.w.document.getElementById("home-search-field");
		const input = f.w.document.getElementById("home-search");
		input.focus();
		assert.equal(field.classList.contains("is-open"), true);
		input.value = "示例搜索";
		input.dispatchEvent(new f.w.Event("input", { bubbles: true }));
		input.blur();
		assert.equal(field.classList.contains("is-open"), false);
		assert.equal(input.value, "示例搜索");
		f.click(".home-search-clear");
		assert.equal(input.value, "");
		assert.equal(f.w.document.activeElement, input);
	} finally {
		f.dom.window.close();
	}
});

test("scope menu updates its selected item and returns focus to the trigger", async () => {
	const f = libraryFixture("menu.scope");
	try {
		f.click("#home-menu-toggle");
		assert.equal(
			f.w.document.getElementById("home-menu-toggle").getAttribute("aria-expanded"),
			"true",
		);
		f.click('[data-extra="saved"]');
		await new Promise((done) => setTimeout(done, 0));
		assert.equal(
			f.w.document.querySelector('[data-extra="saved"]').getAttribute("aria-checked"),
			"true",
		);
		assert.equal(f.w.document.activeElement.id, "home-menu-toggle");
		assert.equal(f.w.document.getElementById("home-menu").hidden, true);
	} finally {
		f.dom.window.close();
	}
});

test("card menu is the product menu and its actions update only sample cards", () => {
	const f = libraryFixture("menu.card");
	try {
		f.w.document
			.querySelector("[data-card]")
			.dispatchEvent(new f.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		assert.ok(f.w.document.querySelector(".card-more-menu"));
		f.click('.card-more-menu [data-action="bookmark"]');
		assert.equal(f.api.Store.item("motion-card-1").bookmarked, true);
		assert.deepEqual(f.isolation(), { reads: 0, writes: 0, network: 0 });
	} finally {
		f.dom.window.close();
	}
});

test("reading and related-detail examples use real reader and detail layers", () => {
	const reader = libraryFixture("reader.tools");
	try {
		assert.equal(reader.w.document.getElementById("modal").open, true);
		assert.ok(reader.w.document.querySelector(".reader-body"));
		assert.ok(reader.w.document.querySelector(".float-bar"));
	} finally {
		reader.dom.window.close();
	}
	const related = libraryFixture("detail.navigate");
	try {
		related.click(".card-title-button");
		assert.ok(related.w.document.querySelector(".detail-related"));
		related.click('.detail-related [data-id="motion-card-2"]');
		assert.equal(
			related.w.document.querySelector("#modal-title").textContent,
			related.api.Store.card("motion-card-2").title,
		);
		related.click('[data-action="close"]');
		assert.equal(
			related.w.document.querySelector("#modal-title").textContent,
			related.api.Store.card("motion-related").title,
		);
	} finally {
		related.dom.window.close();
	}
});

test("the reading-tools example actually hides and restores its shared toolbar on scroll", () => {
	const f = libraryFixture("reader.tools");
	try {
		const scroll = f.w.document.getElementById("reader-scroll");
		Object.defineProperties(scroll, {
			scrollHeight: { value: 2400 },
			clientHeight: { value: 400 },
		});
		const tools = f.w.document.querySelector(".float-bar");
		scroll.scrollTop = 80;
		scroll.dispatchEvent(new f.w.Event("scroll"));
		assert.equal(tools.classList.contains("is-tucked"), true);
		assert.equal(tools.inert, true);
		scroll.scrollTop = 40;
		scroll.dispatchEvent(new f.w.Event("scroll"));
		assert.equal(tools.classList.contains("is-tucked"), false);
		assert.equal(tools.inert, false);
	} finally {
		f.dom.window.close();
	}
});

test("the same detail changes between preview and reading and can close completely", async () => {
	for (const width of [960, 390]) {
		const f = libraryFixture("detail.resize", { width });
		try {
			const modal = f.w.document.getElementById("modal");
			assert.ok(modal.classList.contains("preview"));
			f.click('[data-action="reader"]');
			assert.ok(modal.classList.contains("reader"));
			f.click('[data-action="preview"]');
			assert.ok(modal.classList.contains("preview"));
			f.click('[data-action="reader"]');
			f.click('[data-action="close-all"]');
			await new Promise((done) => setTimeout(done, 0));
			assert.equal(modal.open, false);
		} finally {
			f.dom.window.close();
		}
	}
});

test("reader outline links and disclosure use the real desktop and phone components", async () => {
	const f = libraryFixture("reader.outline");
	try {
		const links = f.w.document.querySelectorAll(".reader-outline a");
		assert.equal(links.length, 8);
		links[1].click();
		await new Promise((done) => setTimeout(done, 0));
		assert.equal(links[1].getAttribute("aria-current"), "location");
		f.click(".reader-outline-toggle");
		await new Promise((done) => setTimeout(done, 0));
		assert.equal(f.w.document.getElementById("reader-outline").hidden, true);
		f.click(".reader-outline-toggle");
		await new Promise((done) => setTimeout(done, 0));
		assert.equal(f.w.document.getElementById("reader-outline").hidden, false);
	} finally {
		f.dom.window.close();
	}
	const phone = libraryFixture("reader.outline", { width: 390 });
	try {
		phone.click(".phone-article-outline summary");
		assert.equal(phone.w.document.querySelector(".phone-article-outline").open, true);
		phone.click(".phone-article-outline a");
		assert.equal(phone.w.document.querySelector(".phone-article-outline").open, false);
	} finally {
		phone.dom.window.close();
	}
});

test("AI dock folds, restores and keeps typed fixture text", async () => {
	const f = libraryFixture("ai.dock-collapse");
	try {
		const input = f.w.document.getElementById("ai-dock-input");
		input.value = "本地草稿";
		input.dispatchEvent(new f.w.Event("input", { bubbles: true }));
		f.click(".ai-dock-tools button");
		await new Promise((done) => setTimeout(done, 0));
		assert.ok(f.w.document.getElementById("ai-dock").classList.contains("is-collapsed"));
		f.click(".ai-dock-restore");
		await new Promise((done) => setTimeout(done, 0));
		assert.equal(f.w.document.getElementById("ai-dock").classList.contains("is-collapsed"), false);
		assert.equal(input.value, "本地草稿");
		assert.equal(f.w.document.querySelector(".ai-dock-send").disabled, true);
		assert.deepEqual(f.isolation(), { reads: 0, writes: 0, network: 0 });
	} finally {
		f.dom.window.close();
	}
});

test("AI height uses real conversation controls with a user-only fixture and disabled sending", () => {
	const f = libraryFixture("ai.dock-height");
	try {
		const dock = f.w.document.getElementById("ai-dock");
		assert.equal(dock.dataset.height, "line");
		f.click('[data-action="ai-open"]');
		assert.equal(dock.dataset.height, "panel");
		assert.equal(f.w.document.querySelectorAll(".ai-you").length, 1);
		assert.equal(f.w.document.querySelectorAll(".ai-says,.ai-result").length, 0);
		f.click('[data-action="ai-full"]');
		assert.equal(dock.dataset.height, "full");
		f.w.document.dispatchEvent(new f.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		assert.equal(dock.dataset.height, "panel");
		f.click('[data-action="ai-collapse"]');
		assert.equal(dock.dataset.height, "line");
		assert.equal(f.w.document.querySelector(".ai-dock-send").disabled, true);
		assert.deepEqual(f.isolation(), { reads: 0, writes: 0, network: 0 });
	} finally {
		f.dom.window.close();
	}
});

test("the selection bar follows selection state and becomes inert when cleared", async () => {
	const f = libraryFixture("selection.bar");
	try {
		f.w.document
			.querySelector(".card-title-button")
			.dispatchEvent(new f.w.MouseEvent("click", { bubbles: true, ctrlKey: true }));
		const bar = f.w.document.getElementById("selection-bar");
		assert.equal(bar.inert, false);
		assert.equal(bar.getAttribute("aria-hidden"), "false");
		assert.equal(bar.querySelector(".selection-count").textContent, "1");
		f.click('[data-action="clear-selection"]');
		await new Promise((done) => setTimeout(done, 0));
		assert.equal(bar.inert, true);
		assert.equal(bar.getAttribute("aria-hidden"), "true");
	} finally {
		f.dom.window.close();
	}
});

function pointer(
	f: ReturnType<typeof libraryFixture>,
	target: EventTarget,
	type: string,
	x: number,
	y: number,
) {
	const event = new f.w.MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: x,
		clientY: y,
		button: 0,
		buttons: type === "pointerup" ? 0 : 1,
	});
	Object.defineProperties(event, {
		pointerId: { value: 1 },
		pointerType: { value: "mouse" },
		isPrimary: { value: true },
	});
	target.dispatchEvent(event);
}

test("real dragging selects a sample card and can hand it to the real AI context box", async () => {
	for (const id of ["drag.selection", "drag.ai-target", "ai.context-entry"]) {
		const f = libraryFixture(id);
		try {
			const card = f.w.document.querySelector("[data-card]");
			pointer(f, card, "pointerdown", 50, 180);
			const x = id === "drag.selection" ? 500 : 300;
			pointer(f, f.w.document, "pointermove", x, 240);
			assert.equal(f.w.document.querySelector(".selection-count").textContent, "1");
			assert.ok(f.w.document.querySelector(".selection-drag-preview"));
			pointer(f, f.w.document, "pointerup", x, 240);
			assert.equal(f.w.document.querySelector(".selection-drag-preview"), null);
			if (id === "drag.ai-target" || id === "ai.context-entry")
				assert.equal(f.w.document.querySelectorAll("[data-ai-context]").length, 1);
			else f.click('[data-action="clear-selection"]');
			if (id === "ai.context-entry") {
				f.click('[data-action="ai-context-remove"]');
				await new Promise((done) => setTimeout(done, 0));
				assert.equal(f.w.document.querySelectorAll("[data-ai-context]").length, 0);
			}
			assert.deepEqual(f.isolation(), { reads: 0, writes: 0, network: 0 });
		} finally {
			f.dom.window.close();
		}
	}
});

test("pull refresh waits for the fixture event and supports a real retry after failure", async () => {
	const f = libraryFixture("refresh.pull");
	try {
		const canvas = f.w.document.querySelector("main");
		pointer(f, canvas, "pointerdown", 20, 30);
		pointer(f, f.w.document, "pointermove", 20, 150);
		pointer(f, f.w, "pointerup", 20, 150);
		const ring = f.w.document.getElementById("pull-ring");
		assert.equal(f.runtime.pending(), true);
		assert.equal(ring.dataset.state, "loading");
		f.runtime.event("fail");
		await new Promise((done) => setTimeout(done, 320));
		assert.equal(ring.dataset.state, "error");
		assert.equal(ring.disabled, false);
		ring.click();
		assert.equal(f.runtime.pending(), true);
		f.runtime.event("complete");
		await new Promise((done) => setTimeout(done, 320));
		assert.equal(ring.dataset.state, "success");
		assert.deepEqual(f.isolation(), { reads: 0, writes: 0, network: 0 });
	} finally {
		f.dom.window.close();
	}
});

test("review state is keyed by stable ID and platform and does not claim unverified criteria passed", () => {
	const memory = new Map<string, string>();
	const storage = {
		getItem: (key: string) => memory.get(key) || null,
		setItem: (key: string, value: string) => {
			memory.set(key, value);
		},
	};
	assert.equal(reviewStatus({}), "unchecked");
	const key = reviewKey("task.mark", "web");
	assert.equal(
		saveReviews(storage, { [key]: { notes: "review note", checks: [...criteria] } }),
		true,
	);
	assert.equal(reviewStatus(readReviews(storage)[key]), "checked");
	assert.equal(readReviews(storage)[reviewKey("task.mark", "phone")], undefined);
	assert.equal(reviewStatus({ checks: [...criteria], issue: true }), "issue");
});

test("the gallery filters real examples, keeps favorites across platforms and resets only the iframe", async () => {
	const f = await libraryPageFixture();
	try {
		const count = () => f.w.document.querySelectorAll(".motion-example").length;
		assert.equal(count(), 29);
		f.w.document.querySelector('.motion-example [aria-label="收藏"]').click();
		await f.settle();
		await f.change(".motion-filter select", "phone");
		assert.equal(count(), 24);
		f.w.document.querySelector(".motion-favorite input").click();
		await f.settle();
		assert.equal(count(), 1);
		assert.ok(f.w.document.querySelector('.motion-cover-link[href="#control.press"]'));
		f.w.document.querySelector(".motion-favorite input").click();
		await f.settle();
		await f.change(".motion-search input", "task.mark");
		assert.equal(count(), 1);
		f.w.location.hash = "task.mark";
		await f.settle();
		const before = f.w.document.querySelector("iframe");
		assert.ok(before.src.includes("platform=phone"));
		f.w.document.querySelector(".motion-preview-controls button").click();
		await f.settle();
		assert.notEqual(f.w.document.querySelector("iframe"), before);
		await f.change(".motion-notes textarea", "手机上检查任务行");
		const reviews = readReviews(f.w.localStorage);
		assert.equal(reviews["control.press"].favorite, true);
		assert.equal(reviews[reviewKey("task.mark", "phone")].notes, "手机上检查任务行");
		assert.deepEqual(
			[...f.w.document.querySelectorAll(".motion-filter select option")].map(
				(option: HTMLOptionElement) => option.value,
			),
			["web", "phone"],
		);
	} finally {
		f.dom.window.close();
	}
});
