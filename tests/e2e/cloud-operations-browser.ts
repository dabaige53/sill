import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
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
	browser = await chromium.launch({ headless: true });
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
		body: ["Body"],
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
	await page.evaluate(
		({ a, b }) => {
			__app.action("bookmark", a);
			__app.action("bookmark", b);
		},
		{ a: note.id, b: task.id },
	);
	await saved();
	let state = await api("/api/v1/workspace");
	assert.equal(state.state.items[note.id].bookmarked, true);
	assert.equal(state.state.items[task.id].bookmarked, true);
	assert.equal(
		JSON.parse(batchRequests.at(-1).body).operations.length,
		2,
		"bulk gesture is one atomic batch",
	);
	await action("card-more", note.id);
	await page.waitForTimeout(5500);
	assert.equal(
		await page.locator(`#card-menu-${note.id}`).count(),
		1,
		"unchanged polling keeps the menu open",
	);
	await page.evaluate(() => __app.closeMore());
	await action("later", note.id);
	await saved();
	await action("edit", note.id);
	await page.locator("#note-editor").fill("Cloud note");
	await page.locator("#tag-new").fill("标签");
	await action("save-note", note.id);
	await saved();
	state = await api("/api/v1/workspace");
	assert.equal(state.state.items[note.id].note, "Cloud note");
	assert.deepEqual(state.state.items[note.id].tags, ["标签"]);
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
	await page.emulateMedia({ reducedMotion: "reduce" });
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
	assert.equal(await page.evaluate(() => localStorage.length), 0);
	assert.deepEqual(errors, []);
	console.log(
		"PASS cloud operations: atomic bulk, bookmarks/later/tags/notes, tasks/reminders, durable preferences, AI structured edits, no manual content editor, AI archive/restore, preference feedback, link drop/file ignore, unknown replay, conflict draft, export/clear, desktop/mobile, no browser persistence",
	);
} finally {
	await browser?.close();
	await new Promise<void>((r) => server.close(() => r()));
	await fixture.close();
}
