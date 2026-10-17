import assert from "node:assert/strict";
export async function waitCloud(page?: any) {
	await page.locator("body.cloud-signed-in").waitFor();
	assert.equal(
		await page.locator("#cloud-account").count(),
		0,
		"no top account/icon toolbar or placeholder",
	);
	assert.ok(
		await page.locator("main").evaluate((e?: any) => e.getBoundingClientRect().top <= 1),
		"content starts at viewport top",
	);
}
/**
 * The rail is the navigation capsule: the face opens settings, refresh is the R key (or a pull at the top),
 * and adding lives in settings; the N key still opens the capture editor directly.
 */
export async function cloudTool(page?: any, action?: any) {
	if (action === "settings") {
		await page.locator("#account").click();
		return;
	}
	const key = { refresh: "r", capture: "n" }[action as string];
	if (key) {
		// Works for a page and for a frame (an embedded host has no keyboard of its own).
		await page.evaluate((k: string) => {
			(document.activeElement as HTMLElement)?.blur?.();
			document.body.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
		}, key);
		return;
	}
	await page.locator("#dock [data-action=" + action + "]").click();
}
export async function cloudLogout(page?: any) {
	await cloudTool(page, "settings");
	await page.locator("[data-action=settings-group][data-extra=data]").click();
	await page.locator("#cloud-logout").click({ trial: true });
	assert.ok(
		await page
			.locator("#cloud-logout")
			.evaluate((e?: any) => e.getBoundingClientRect().height >= 44),
	);
	await page.locator("#cloud-logout").click();
}
