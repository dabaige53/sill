import assert from "node:assert/strict";
export async function waitCloud(page?: any) {
	await page.locator("body.cloud-signed-in").waitFor();
	await page.waitForFunction(() => Math.abs(document.getElementById("home-top").getBoundingClientRect().top - (innerWidth > 650 ? 10 : 0)) < 0.1);
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
			headerTop: Math.round(head.top + scrollY),
			headerHeight: head.height,
			headerPosition: getComputedStyle(header).position,
		};
	});
	if (layout.desktop) {
		// The desktop header is sticky with a 10px inset and a 64px navigation row.
		assert.equal(layout.headerTop, 10, "desktop header starts at 10px");
		assert.equal(layout.headerHeight, 64, "desktop header remains 64px high");
		assert.equal(layout.headerPosition, "sticky", "desktop header stays sticky");
		assert.equal(layout.mainTop, 74, "desktop content follows the 10px margin and 64px header");
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
