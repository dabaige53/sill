import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { cloudFixture } from "../server/helpers/cloud-fixture.ts";

const fixture = await cloudFixture();
let runtime: any,
	browser: any,
	loseNext = false;
let batchRequests: any[] = [];
const server = createServer(async (req, res) => {
	const chunks = [];
	for await (const part of req) chunks.push(part);
	const body = Buffer.concat(chunks);
	const request = new Request(fixture.config.appOrigin + req.url, {
		method: req.method,
		headers: req.headers as any,
		...(body.length ? { body } : {}),
	});
	if (req.url === "/api/v1/workspace/operations")
		batchRequests.push({ body: body.toString(), key: req.headers["idempotency-key"] });
	const response = await runtime(request);
	if (loseNext && req.url === "/api/v1/workspace/operations" && response.ok) {
		loseNext = false;
		res.writeHead(503, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: { code: "unavailable" } }));
		return;
	}
	res.writeHead(response.status, {
		...Object.fromEntries(response.headers),
		"set-cookie": response.headers.getSetCookie(),
	});
	res.end(Buffer.from(await response.arrayBuffer()));
});
try {
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	fixture.config.appOrigin = `http://127.0.0.1:${(server.address() as any).port}`;
	runtime = createSillRuntime(fixture.config, {
		clientFactory: fixture.factory,
		html: await readFile("dist/cloud/index.html", "utf8"),
	});
	browser = await chromium.launch({
		headless: true,
		...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
	});
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto(fixture.config.appOrigin);
	await page.evaluate(async () => {
		const r = await fetch("/auth/password", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "synthetic@example.com", password: "synthetic-password" }),
		});
		if (!r.ok) throw Error("login failed");
	});
	await page.reload();
	await page.locator("body.cloud-signed-in").waitFor();
	// A freshly loaded workspace is already saved, even before the first mutation.
	await page.waitForFunction(() => __app.grid.dataset.sync === "saved");
	const initialWrites = batchRequests.length;
	await page.evaluate(async () => {
		__store.setPref("theme", __store.pref("theme"));
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
		);
	});
	assert.equal(await page.evaluate(() => __app.grid.dataset.sync), "saved");
	assert.equal(
		batchRequests.length,
		initialWrites,
		"an unchanged preference needs no save request",
	);
	const api = async (path: string, body?: any, method = "POST") =>
		page.evaluate(
			async ({ path, body, method }) => {
				const r = await fetch(path, {
					...(body
						? {
								method,
								headers: {
									"Content-Type": "application/json",
									"Idempotency-Key": crypto.randomUUID(),
								},
								body: JSON.stringify(body),
							}
						: {}),
				});
				const value = await r.json();
				if (!r.ok) throw Error(JSON.stringify(value));
				return value;
			},
			{ path, body, method },
		);
	const note = await api("/api/v1/contents", {
		type: "note",
		title: "Synthetic note",
		body: "Body",
		summary: "Summary",
		sources: [{ name: "Synthetic", kind: "agent" }],
	});
	const task = await api("/api/v1/contents", {
		type: "task",
		title: "Synthetic tasks",
		tasks: [
			{ id: "step1", text: "One" },
			{ id: "step2", text: "Two" },
		],
	});
	const reminder = await api("/api/v1/contents", {
		type: "reminder",
		title: "Synthetic reminder",
		due: Date.now() + 600000,
	});
	await page.evaluate(() => __app.refresh());
	await page.waitForFunction(() => __store.state.cards.length === 3);
	const saved = () =>
		page.waitForFunction(
			() => document.querySelector("[data-sync]")?.getAttribute("data-sync") === "saved",
		);
	const action = async (name: string, id?: string, extra?: string) =>
		page.evaluate(({ name, id, extra }) => __app.action(name, id, extra), { name, id, extra });
	const selectionMenu = async () => {
		await page.evaluate(
			(ids) => {
				for (const id of ids) __app.select(id, { add: true });
			},
			[note.id, task.id],
		);
		await page.locator('[data-action="selected-bookmark"]').press("Shift+F10");
		await page.locator("#selection-menu").waitFor();
	};
	const requestsBeforeMenu = batchRequests.length;
	await selectionMenu();
	await page.waitForTimeout(300);
	assert.equal(batchRequests.length, requestsBeforeMenu, "opening a selection menu must not write");
	await page.locator('[data-selection-action="cancel"]').click();
	await page.waitForTimeout(300);
	assert.equal(
		batchRequests.length,
		requestsBeforeMenu,
		"cancelling a selection menu must not write",
	);
	assert.equal(await page.evaluate(() => __app.selected.size), 2);
	await selectionMenu();
	await page.locator('[data-selection-action="bookmark"]').click();
	await saved();
	let state = await api("/api/v1/workspace");
	assert.equal(state.state.items[note.id].bookmarked, true);
	assert.equal(state.state.items[task.id].bookmarked, true);
	assert.equal(
		JSON.parse(batchRequests.at(-1).body).operations.length,
		2,
		"bulk gesture is one atomic batch",
	);
	await page.locator(`[data-card="${note.id}"] .card-title-button`).press("Shift+F10");
	await page.waitForTimeout(5500);
	assert.equal(
		await page.locator(`#card-menu-${note.id}`).count(),
		1,
		"unchanged polling keeps the menu open",
	);
	await page.evaluate(() => __app.closeMore());
	await selectionMenu();
	await page.locator('[data-selection-action="later"]').click();
	await saved();
	state = await api("/api/v1/workspace");
	assert.equal(state.state.items[note.id].later, true);
	assert.equal(state.state.items[task.id].later, true);
	assert.equal(JSON.parse(batchRequests.at(-1).body).operations.length, 2);
	await selectionMenu();
	const requestsBeforeTags = batchRequests.length;
	await page.locator('[data-selection-action="tag"]').click();
	await page.locator("#tag-new").waitFor();
	assert.equal(
		batchRequests.length,
		requestsBeforeTags,
		"opening the bulk tag editor must not write",
	);
	await page.locator("#note-editor").fill("Cloud note");
	await page.locator("#tag-new").fill("标签");
	await action("save-note", note.id);
	await saved();
	state = await api("/api/v1/workspace");
	assert.equal(state.state.items[note.id].note, "Cloud note");
	assert.deepEqual(state.state.items[note.id].tags, ["标签"]);
	assert.deepEqual(state.state.items[task.id].tags, ["标签"]);
	assert.equal(JSON.parse(batchRequests.at(-1).body).operations.length, 2);
	await action("task", task.id, "step1");
	await saved();
	assert.deepEqual((await api("/api/v1/workspace")).state.items[task.id].taskDone, ["step1"]);
	await action("snooze", reminder.id);
	await saved();
	assert.ok((await api("/api/v1/workspace")).state.items[reminder.id].snoozedUntil > Date.now());
	await action("complete-reminder", reminder.id);
	await saved();
	assert.equal((await api("/api/v1/workspace")).state.items[reminder.id].done, true);
	await action("restore-reminder", reminder.id);
	await saved();
	assert.equal((await api("/api/v1/workspace")).state.items[reminder.id].done, false);
	await action("pref", "theme", "dark");
	await saved();
	await action("pref", "density", "compact");
	await saved();
	await page.reload();
	await page.locator("body.cloud-signed-in").waitFor();
	assert.equal(await page.evaluate(() => __store.pref("theme")), "dark");
	assert.equal(
		await page.evaluate(
			() => __store.item(__store.state.cards.find((c) => c.title === "Synthetic note").id).later,
		),
		true,
	);
	// AI edits structured content; the original UI has no full-card editor.
	await action("edit-content", task.id);
	assert.equal(await page.locator("#cloud-editor,[data-cloud-field]").count(), 0);
	const taskBefore = await api("/api/v1/contents/" + task.id);
	await api(
		"/api/v1/contents/" + task.id,
		{
			expectedRevision: taskBefore.revision,
			changes: {
				summary: "New task summary",
				tasks: [
					{ ...taskBefore.tasks[0], text: "One changed" },
					taskBefore.tasks[1],
					{ id: "step3", text: "Three" },
				],
			},
		},
		"PATCH",
	);
	await page.evaluate(() => __app.refresh());
	state = await api("/api/v1/workspace");
	const edited = state.state.cards.find((c) => c.id === task.id);
	assert.equal(edited.summary, "New task summary");
	assert.equal(edited.tasks.length, 3);
	assert.equal(edited.tasks[0].id, "step1");
	// The same state written by AI/API is reflected in the page and remains restorable.
	const current = await api("/api/v1/contents/" + note.id);
	await api(
		"/api/v1/contents/" + note.id,
		{ expectedRevision: current.revision, changes: { state: { archived: true } } },
		"PATCH",
	);
	await page.evaluate(() => __app.refresh());
	await page.waitForFunction((id) => __store.item(id).archived, note.id);
	await action("archive", undefined, "read");
	await action("restore-card", note.id);
	await saved();
	assert.equal((await api("/api/v1/workspace")).state.items[note.id].archived, false);
	await page.keyboard.press("Escape");
	await action("less-like", note.id);
	await saved();
	assert.equal((await api("/api/v1/workspace")).state.items[note.id].lessLike, true);
	await page.evaluate(() => {
		const dt = new DataTransfer();
		dt.setData("text/plain", "https://example.com/cloud-capture");
		document.dispatchEvent(
			new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }),
		);
	});
	await saved();
	state = await api("/api/v1/workspace");
	assert.ok(state.state.cards.some((c) => c.url === "https://example.com/cloud-capture"));
	const count = state.state.cards.length;
	await page.evaluate(() => {
		const dt = new DataTransfer();
		dt.items.add(new File(["private"], "ignore.txt", { type: "text/plain" }));
		document.dispatchEvent(
			new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }),
		);
	});
	assert.equal((await api("/api/v1/workspace")).state.cards.length, count);
	// Lose the committed response; retry must reuse the exact request.
	loseNext = true;
	batchRequests = [];
	await action("bookmark", note.id);
	await page.locator("#cloud-sync-status").waitFor();
	await action("sync-retry");
	await saved();
	assert.equal(batchRequests.length, 2);
	assert.deepEqual(batchRequests[0], batchRequests[1]);
	// Editing baseline must survive an unrelated successful write while another client edits.
	await action("edit", note.id);
	await page.locator("#note-editor").fill("Retained conflict draft");
	const remote = await api("/api/v1/contents/" + note.id);
	await api(
		"/api/v1/contents/" + note.id,
		{ expectedRevision: remote.revision, changes: { state: { note: "Remote note" } } },
		"PATCH",
	);
	await action("bookmark", task.id);
	await saved();
	await action("save-note", note.id);
	await page.locator("#cloud-sync-status").waitFor();
	assert.equal((await api("/api/v1/workspace")).state.items[note.id].note, "Remote note");
	const download = page.waitForEvent("download");
	await action("sync-export");
	assert.ok((await download).suggestedFilename().includes("draft"));
	await action("sync-discard-confirm");
	await saved();
	await mkdir("tests/artifacts", { recursive: true });
	await page.screenshot({ path: "tests/artifacts/cloud-operations-desktop.png" });
	await page.setViewportSize({ width: 390, height: 844 });
	await action("capture");
	await page.locator("#cloud-title").fill("手机速记");
	assert.equal(await page.locator("[data-cloud-field]").count(), 0);
	await page.evaluate(() =>
		Promise.allSettled(
			document
				.getAnimations()
				.filter((a) => Number.isFinite(a.effect?.getTiming().iterations))
				.map((a) => a.finished),
		),
	);
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	await page.screenshot({ path: "tests/artifacts/cloud-operations-mobile.png" });
	await page.keyboard.press("Escape");
	const exportDownload = page.waitForEvent("download");
	await action("export-all");
	assert.ok((await exportDownload).suggestedFilename().endsWith(".json"));
	await action("clear-all");
	await page.locator("#cloud-confirm").click();
	await saved();
	assert.equal((await api("/api/v1/workspace")).state.cards.length, 0);
	await page.locator('[data-action="welcome-demo"]').click();
	await saved();
	const demo = (await api("/api/v1/workspace")).state.cards;
	assert.ok(demo.length > 10);
	assert.ok(
		demo.every(
			(card) => !card.related || card.related.every((id) => demo.some((c) => c.id === id)),
		),
	);
	await action("clear-all");
	await page.locator("#cloud-confirm").click();
	await saved();
	await page.locator('[data-action="welcome-demo"]').click();
	await saved();
	const repeatedDemo = (await api("/api/v1/workspace")).state.cards;
	assert.equal(repeatedDemo.length, demo.length);
	assert.ok(repeatedDemo.every((card) => !demo.some((previous) => previous.id === card.id)));
	// A foreground pull joins an already-running read; no early success or duplicate request.
	let releaseRead: () => void;
	const readGate = new Promise<void>((resolve) => {
		releaseRead = resolve;
	});
	let sharedReads = 0;
	await page.route("**/api/v1/workspace", async (route) => {
		sharedReads++;
		await readGate;
		await route.continue();
	});
	await page.evaluate(() => {
		window.__refreshSettled = 0;
		window.__sharedRefresh = [__app.refresh(), __app.refresh({ feedback: "pull" })].map((work) =>
			work.then((result) => {
				window.__refreshSettled++;
				return result;
			}),
		);
	});
	await page.waitForTimeout(100);
	assert.equal(await page.evaluate(() => window.__refreshSettled), 0);
	releaseRead!();
	assert.deepEqual(await page.evaluate(() => Promise.all(window.__sharedRefresh)), [true, true]);
	assert.equal(sharedReads, 1);
	await page.unroute("**/api/v1/workspace");
	// Pull refresh owns its icon feedback, including real request failures.
	await page.evaluate(() => {
		window.__refreshAlerts = 0;
		window.__originalAlert = __app.alert;
		__app.alert = () => {
			window.__refreshAlerts++;
		};
	});
	await page.route("**/api/v1/workspace", (route) =>
		route.fulfill({
			status: 503,
			contentType: "application/json",
			body: JSON.stringify({ error: { code: "unavailable" } }),
		}),
	);
	assert.equal(await page.evaluate(() => __app.refresh({ feedback: "pull" })), false);
	assert.equal(
		await page.evaluate(() => window.__refreshAlerts),
		0,
		"no text alert for pull failure",
	);
	assert.equal(await page.locator("#offline").isVisible(), false, "no second text feedback");
	assert.equal(await page.locator("#dock.is-busy").count(), 0, "no second loading spinner");
	await page.unroute("**/api/v1/workspace");
	assert.equal(await page.evaluate(() => __app.refresh({ feedback: "pull" })), true);
	await page.evaluate(() => {
		__app.alert = window.__originalAlert;
	});
	// Session expiry must dismiss the lifted/menu copy along with the signed-in feed.
	await page.evaluate(() => {
		for (const card of __store.state.cards.slice(0, 2)) __app.select(card.id, { add: true });
	});
	await page.locator('[data-action="selected-bookmark"]').press("Shift+F10");
	assert.equal(await page.locator("#selection-menu").isVisible(), true);
	const requestsBeforeExpiry = batchRequests.length;
	await page.route("**/auth/session", (route) =>
		route.fulfill({
			status: 401,
			contentType: "application/json",
			body: JSON.stringify({ error: { code: "unauthenticated" } }),
		}),
	);
	await page.waitForFunction(() => !document.body.classList.contains("cloud-signed-in"), null, {
		timeout: 8000,
	});
	assert.equal(await page.locator("#selection-menu").isVisible(), false);
	assert.equal(await page.locator(".selection-lift,.is-drag-source,body.is-dragging").count(), 0);
	assert.equal(await page.evaluate(() => __app.selected.size), 0);
	assert.equal(await page.locator("#feed-grid [data-card]").count(), 0);
	assert.equal(
		batchRequests.length,
		requestsBeforeExpiry,
		"session expiry must not dispatch an action",
	);
	assert.equal(await page.evaluate(() => localStorage.length), 0);
	// Retained search snapshots and local AI drafts are account-bound, including hidden menu clones.
	for (const view of ["preview", "ai"]) {
		await page.unroute("**/auth/session");
		await page.reload();
		await page.locator("body.cloud-signed-in").waitFor();
		await saved();
		const ids = await page.evaluate(() => __store.state.cards.slice(0, 2).map((card) => card.id));
		assert.equal(ids.length, 2);
		await page.evaluate((id) => __app.select(id, { add: true }), ids[0]);
		await page.evaluate(() => __app.openPanel("search"));
		await page.waitForFunction(() => __app.modalKind === "search");
		await page
			.locator("#filter-search")
			.fill(
				await page.evaluate(
					(id) => __store.state.cards.find((card) => card.id === id).title,
					ids[1],
				),
			);
		await page.locator("#search-results [data-card]").first().waitFor();
		await page.evaluate((id) => __app.select(id, { add: true }), ids[1]);
		await page
			.locator('#search-selection-bar [data-action="selected-bookmark"]')
			.press("Shift+F10");
		await page.keyboard.press("Escape");
		assert.ok((await page.locator("#selection-menu [data-card]").count()) === 0);
		assert.ok((await page.locator("#selection-menu .selection-stack").count()) > 0);
		if (view === "ai") {
			await page.locator("#search-selection-bar .selection-ai-target").click();
			await page.locator("#ai-local-draft").fill("Synthetic temporary account draft");
			assert.equal(await page.locator("[data-ai-context]").count(), 1);
		} else {
			await page.evaluate((id) => __app.openCard(id), ids[1]);
			await saved();
		}
		await page.waitForFunction((kind) => __app.modalKind === kind, view);
		assert.equal(await page.locator("#search-background").count(), 1);
		assert.ok((await page.locator("#search-background [data-card]").count()) > 0);
		const before = batchRequests.length;
		await page.route("**/auth/session", (route) =>
			route.fulfill({
				status: 401,
				contentType: "application/json",
				body: JSON.stringify({ error: { code: "unauthenticated" } }),
			}),
		);
		assert.equal(await page.evaluate(() => __app.refresh({ feedback: "pull" })), false);
		await page.waitForFunction(() => !document.body.classList.contains("cloud-signed-in"));
		assert.equal(
			await page.locator("#modal").evaluate((node: HTMLDialogElement) => node.open),
			false,
		);
		assert.equal(
			await page
				.locator(
					"#modal > *,#search-background,[data-card],[data-ai-context],#ai-local-draft,#selection-menu > *",
				)
				.count(),
			0,
			`${view}: no retained account DOM`,
		);
		assert.deepEqual(
			await page.evaluate(() => ({
				home: __app.homeSelected.size,
				search: __app.searchSelected.size,
				ai: __app.aiSelectionIds.length,
				query: __app.searchFilter.query,
				scroll: __app.searchScroll,
				cards: __store.state.cards.length,
			})),
			{ home: 0, search: 0, ai: 0, query: "", scroll: 0, cards: 0 },
		);
		assert.equal(batchRequests.length, before, `${view}: expiry must not write`);
		assert.equal(await page.evaluate(() => localStorage.length), 0);
	}
	assert.deepEqual(errors, []);
	console.log(
		"PASS cloud operations: atomic menu actions and cancellation, bookmarks/later/tags/notes, tasks/reminders, durable preferences, AI structured edits, no manual content editor, AI archive/restore, preference feedback, link drop/file ignore, unknown replay, conflict draft, export/clear, desktop/mobile, session-expiry menu/search/detail/AI cleanup, no browser persistence",
	);
} finally {
	await browser?.close();
	await new Promise<void>((r) => server.close(() => r()));
	await fixture.close();
}
