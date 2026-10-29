import assert from "node:assert/strict";

export async function verifySelectionOperations(
	page: any,
	api: any,
	action: any,
	saved: any,
	note: any,
	task: any,
	reminder: any,
	batchRequests: any[],
) {
	const selectCards = async () => {
		await page.evaluate(
			(ids) => {
				for (const id of ids) __app.select(id, { add: true });
			},
			[note.id, task.id],
		);
		await page.locator("#selection-bar").waitFor();
		assert.equal(await page.locator("#selection-menu").count(), 0);
	};
	const requestsBeforeSelection = batchRequests.length;
	await selectCards();
	await page.waitForTimeout(300);
	assert.equal(batchRequests.length, requestsBeforeSelection, "selecting cards must not write");
	await action("clear-selection");
	await page.waitForTimeout(300);
	assert.equal(
		batchRequests.length,
		requestsBeforeSelection,
		"clearing a selection must not write",
	);
	assert.equal(await page.evaluate(() => __app.selected.size), 0);
	await selectCards();
	await page.locator('[data-action="selected-bookmark"]').click();
	await saved();
	let state = await api("/api/v1/workspace");
	assert.equal(state.state.items[note.id].bookmarked, true);
	assert.equal(state.state.items[task.id].bookmarked, true);
	assert.equal(
		JSON.parse(batchRequests.at(-1).body).operations.length,
		2,
		"bulk gesture is one atomic batch",
	);
	await selectCards();
	await page.locator('[data-action="selected-later"]').click();
	await saved();
	state = await api("/api/v1/workspace");
	assert.equal(state.state.items[note.id].later, true);
	assert.equal(state.state.items[task.id].later, true);
	assert.equal(JSON.parse(batchRequests.at(-1).body).operations.length, 2);
	const laterButton = page.locator('#selection-bar [data-action="selected-later"]');
	assert.equal(await laterButton.getAttribute("aria-pressed"), "true");
	await laterButton.click();
	await saved();
	state = await api("/api/v1/workspace");
	assert.equal(state.state.items[note.id].later, false);
	assert.equal(state.state.items[task.id].later, false);
	assert.equal(await laterButton.getAttribute("aria-pressed"), "false");
	await page.reload();
	await page.locator("body.cloud-signed-in").waitFor();
	assert.equal(await page.evaluate((id) => __store.item(id).later, note.id), false);
	assert.equal(await page.evaluate((id) => __store.item(id).later, task.id), false);
	// A mixed selection adds both cards instead of toggling each card independently.
	await action("later", note.id);
	await saved();
	await selectCards();
	assert.equal(await laterButton.getAttribute("aria-pressed"), "false");
	await laterButton.click();
	await saved();
	state = await api("/api/v1/workspace");
	assert.equal(state.state.items[note.id].later, true);
	assert.equal(state.state.items[task.id].later, true);
	assert.equal(state.state.items[reminder.id]?.later ?? false, false);
	// The search toolbar must use its own selection and persist the same toggle.
	await action("clear-selection");
	await page.evaluate(() => __app.openPanel("search"));
	await page.locator("#search-results").waitFor();
	await page.evaluate(
		(ids) => ids.forEach((id) => __app.select(id, { add: true })),
		[note.id, task.id],
	);
	const searchLater = page.locator('#search-selection-bar [data-action="selected-later"]');
	assert.equal(await searchLater.getAttribute("aria-pressed"), "true");
	await searchLater.click();
	await saved();
	state = await api("/api/v1/workspace");
	assert.equal(state.state.items[note.id].later, false);
	assert.equal(state.state.items[task.id].later, false);
	await searchLater.click();
	await saved();
	assert.equal((await api("/api/v1/workspace")).state.items[task.id].later, true);
	await action("clear-selection");
	await action("close");
	await selectCards();
	await page.locator('#selection-bar [data-action="selected-bookmark"]').click();
	await saved();
	state = await api("/api/v1/workspace");
	assert.equal(state.state.items[note.id].bookmarked, false);
	assert.equal(state.state.items[task.id].bookmarked, false);
	await page.locator('#selection-bar [data-action="selected-bookmark"]').click();
	await saved();
	const beforeAI = batchRequests.length;
	await page.locator('#selection-bar [data-action="selected-ai"]').click();
	assert.deepEqual(
		await page.evaluate(() => [...__app.aiSelectionIds].sort()),
		[note.id, task.id].sort(),
	);
	assert.equal(await page.evaluate(() => __app.selected.size), 0);
	assert.equal(batchRequests.length, beforeAI, "adding AI context must not mutate cards");
	await selectCards();
	const requestsBeforeTags = batchRequests.length;
	await page.locator('#selection-bar [data-action="selected-tag"]').click();
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
	assert.deepEqual(state.state.cards.find((card) => card.id === note.id).tags, ["标签"]);
	assert.deepEqual(state.state.cards.find((card) => card.id === task.id).tags, ["标签"]);
	assert.equal(JSON.parse(batchRequests.at(-1).body).operations.length, 3);
}
