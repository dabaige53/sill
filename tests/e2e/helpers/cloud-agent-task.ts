import assert from "node:assert/strict";

// @wu-test type=integration | scope=cloud | protects=Show agent edits without editor
export async function verifyAgentTaskEdit(page: any, api: any, task: any) {
	assert.equal(
		await page.locator('#cloud-editor,[data-cloud-field],[data-action="edit-content"]').count(),
		0,
	);
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
	const state = await api("/api/v1/workspace");
	const edited = state.state.cards.find((card: any) => card.id === task.id);
	assert.equal(edited.summary, "New task summary");
	assert.equal(edited.tasks.length, 3);
	assert.equal(edited.tasks[0].id, "step1");
	const taskCard = page.locator(`[data-card="${task.id}"]`);
	await taskCard.getByText("One changed", { exact: true }).waitFor();
	await taskCard.getByText("Three", { exact: true }).waitFor();
	assert.equal(await taskCard.locator('[data-action="task"]').count(), 3);
	assert.equal(await page.locator("#cloud-editor").count(), 0);
}
