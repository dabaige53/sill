import assert from "node:assert/strict";

/** Save receipts and remote edits retain the active detail surface. */
export async function verifyStableDetail(
	page: any,
	api: any,
	action: any,
	saved: any,
	note: any,
	task: any,
) {
	// Saving a local state change must keep the mounted detail and its media/scroll lifecycle.
	await action("preview", task.id);
	const detail = await page.locator(".preview-sheet").elementHandle();
	await saved();
	const assertDetailRetained = async () => {
		assert.equal(
			await detail.evaluate((node) => node === document.querySelector(".preview-sheet")),
			true,
		);
	};
	await assertDetailRetained();
	for (const [name, extra] of [
		["task", "step1"],
		["task", "step2"],
		["task", "step1"],
		["task", "step2"],
		["bookmark", ""],
		["bookmark", ""],
		["later", ""],
		["later", ""],
	]) {
		await action(name, task.id, extra);
		await saved();
		await assertDetailRetained();
	}
	// Real remote changes remain visible without replacing the detail surface.
	for (const [id, changes] of [
		[note.id, { body: "Remote body" }],
		[task.id, { summary: "Remote summary" }],
	]) {
		const current = await api("/api/v1/contents/" + id);
		await api("/api/v1/contents/" + id, { expectedRevision: current.revision, changes }, "PATCH");
		await page.evaluate(() => __app.refresh());
		await assertDetailRetained();
	}
	assert.equal(await page.evaluate((id) => __store.card(id).summary, task.id), "Remote summary");
	await page.evaluate(() => __app.closeNative());
	await page.waitForFunction(() => !document.querySelector("#modal[open]"));
}
