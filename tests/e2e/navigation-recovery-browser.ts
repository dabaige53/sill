import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startLocal } from "../../server/local/index.ts";
import { runDialogNavigation } from "./navigation-recovery-browser-dialog-navigation.ts";
import { runRecoveryLayout } from "./navigation-recovery-browser-recovery-layout.ts";

const browser = await chromium.launch({
	headless: true,
	...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
let failed = 0;
async function scenario(name?: any, run?: any, options: any = {}) {
	const dir = await mkdtemp(join(tmpdir(), "sill-navigation-recovery-")),
		server = await startLocal({ port: 0, file: join(dir, "cards.json") });
	const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options }),
		page = await context.newPage();
	page.setDefaultTimeout(6000);
	const errors = [];
	page.on("pageerror", (e?: any) => errors.push(e.message));
	await page.route("**/*", (r?: any) =>
		r.request().url().startsWith(origin) ? r.continue() : r.abort(),
	);
	const apply = async (operations?: any) => {
		const response = await fetch(`${origin}/api/local/operations`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ operations }),
		});
		assert.equal(response.status, 200);
		return response.json();
	};
	try {
		await page.goto(origin);
		await page.waitForFunction(
			() => (document.querySelector("#feed-grid") as HTMLElement)?.dataset.sync === "saved",
		);
		await run(page, apply, origin);
		assert.deepEqual(errors, []);
		console.log(`PASS ${name}`);
	} catch (error) {
		failed++;
		console.error(`FAIL ${name}\n${error.stack}`);
	} finally {
		await context.close();
		await new Promise((r?: any) => server.close(r));
		await rm(dir, { recursive: true, force: true });
	}
}
const settle = (page?: any) => page.waitForTimeout(600);
const close = async (page?: any) => {
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector("dialog").open);
};
const open = async (page?: any, id?: any) => {
	await page.locator(`[data-card="${id}"] .card-title-button`).click();
	await settle(page);
};
try {
	await runDialogNavigation({ close, open, scenario });

	await runRecoveryLayout({ close, open, scenario, settle });
} finally {
	await browser.close();
}
if (failed) throw new Error(`${failed} navigation/recovery scenarios failed`);
