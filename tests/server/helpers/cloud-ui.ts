import assert from "node:assert/strict";
export async function waitCloud(page?: any) {
	await page.locator("body.cloud-signed-in").waitFor();
	assert.equal(
		await page.locator("#cloud-account").count(),
		0,
		"no top account/icon toolbar or placeholder",
	);
	const layout = await page.evaluate(() => {
		const main = document.querySelector("main").getBoundingClientRect(),
			header = document.getElementById("home-top"),
			head = header.getBoundingClientRect();
		return {
			desktop: matchMedia("(min-width: 651px)").matches,
			mainTop: main.top + scrollY,
			headerTop: head.top + scrollY,
			headerHeight: head.height,
			headerPosition: getComputedStyle(header).position,
		};
	});
	if (layout.desktop) {
		// ADR 0043 adds only the shared home filters, never an account toolbar.
		assert.equal(layout.headerTop, 24, "desktop home filters start at 24px");
		assert.equal(layout.headerHeight, 44, "desktop home filters remain 44px high");
		assert.equal(layout.headerPosition, "relative", "desktop home filters stay in page flow");
		assert.equal(layout.mainTop, 68, "desktop content follows the 24px margin and 44px filters");
	} else {
		assert.equal(layout.mainTop, 0, "phone content still starts at viewport top");
		assert.equal(layout.headerPosition, "fixed", "phone home header stays fixed");
	}
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
