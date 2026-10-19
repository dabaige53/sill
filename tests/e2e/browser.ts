import { createRequire as createNodeRequire } from "node:module";
import { runCaptureLayout } from "./browser-capture-layout.ts";
import { runCardActions } from "./browser-card-actions.ts";
import { runReadingSelection } from "./browser-reading-selection.ts";
import { runTouchDrag } from "./browser-touch-drag.ts";

const require = createNodeRequire(import.meta.url);

/** Real browser regression checks. Run against an isolated localhost origin. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const load = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
	? createRequire(
			path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright", "package.json"),
		)
	: require;
const { chromium } = load("playwright");
const artifacts = path.join(import.meta.dirname, "../artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const pages = new Set<any>(["/index.html"]);
const server = http.createServer((req?: any, res?: any) => {
	const file = (req.url || "").split("?")[0];
	if (!pages.has(file)) {
		res.writeHead(404);
		return res.end();
	}
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
	res.end(fs.readFileSync(path.join(root, "dist/web", file.slice(1))));
});
const results = [];
const layoutMetrics = [];
async function recordLayout(page?: any, width?: any) {
	layoutMetrics.push({
		viewport: width,
		cards: await page.locator(".feed-card").evaluateAll((nodes?: any) =>
			nodes.map((n?: any) => {
				const r = n.getBoundingClientRect();
				return { id: n.dataset.card, width: Math.round(r.width), height: Math.round(r.height) };
			}),
		),
	});
	fs.writeFileSync(
		path.join(artifacts, "v05-layout-metrics.json"),
		JSON.stringify(layoutMetrics, null, 2),
	);
}
(async () => {
	await new Promise((resolve?: any) => server.listen(0, "127.0.0.1", resolve));
	const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
	let browser: any;
	try {
		browser = await chromium.launch({
			headless: true,
			...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
		});
		async function scenario(name?: any, fn?: any, options: any = {}, entry: any = "/index.html") {
			const context = await browser.newContext({
				viewport: { width: 1440, height: 1000 },
				...options,
			});
			const page = await context.newPage(),
				errors = [],
				external = [];
			page.on("pageerror", (e?: any) => errors.push(e.message));
			await context.route("**/*", (route?: any) => {
				const url = route.request().url();
				if (url.startsWith(origin) || url.startsWith("data:")) return route.continue();
				external.push(url);
				return route.abort();
			});
			try {
				await page.goto(origin + entry);
				await page.waitForFunction(() => window.__app);
				await fn(page, context);
				assert.deepEqual(errors, []);
				assert.deepEqual(external, []);
				results.push({ name, status: "PASS" });
				console.log("PASS", name);
			} catch (e) {
				const screenshot = `failure-${results.length + 1}.png`;
				await page
					.screenshot({ animations: "disabled", path: path.join(artifacts, screenshot) })
					.catch(() => {});
				results.push({
					name,
					status: "FAIL",
					error: e.message,
					screenshot,
					pageErrors: errors,
					externalRequests: external,
				});
				console.error("FAIL", name, e.stack || e.message);
			} finally {
				await context.close();
			}
		}
		const action = (page?: any, name?: any, id: any = "", extra: any = "") =>
			page.evaluate(
				([name, id, extra]: any) => window.__app.action(name, id, extra),
				[name, id, extra],
			);
		const state = (page?: any, id?: any) =>
			page.evaluate((id?: any) => JSON.parse(localStorage.getItem("sill-v1")).items[id], id);
		const card = (page?: any, id?: any) => page.locator(`[data-card="${id}"]`);
		const openCard = (page?: any, id?: any) => card(page, id).locator(".card-title-button").click();
		const feedUnopened = async (page?: any, id?: any) => {
			assert.equal(
				await page.locator("#modal").evaluate((n?: any) => n.open),
				false,
				"inline action opened a dialog",
			);
			assert.equal(
				await page.evaluate(() => location.hash),
				"#feed",
				"inline action changed the route",
			);
			const item = await state(page, id);
			assert.equal(item?.seen || false, false, "inline action marked the card as seen");
			assert.equal(item?.read || false, false, "inline action marked the card as read");
		};
		const touchTargets = async (locator?: any, width?: any) => {
			const boxes = await locator.evaluateAll((nodes?: any) =>
				nodes.map((n?: any) => {
					const r = n.getBoundingClientRect();
					return {
						label: n.getAttribute("aria-label") || n.textContent,
						width: r.width,
						height: r.height,
						left: r.left,
						right: r.right,
					};
				}),
			);
			assert.ok(boxes.length > 0, "no touch actions found");
			assert.ok(
				boxes.every(
					(r?: any) => r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= width,
				),
				JSON.stringify(boxes),
			);
		};
		const filter = async (page?: any, status?: any) => {
			if (await page.locator("#modal").evaluate((n: HTMLDialogElement) => n.open)) {
				await page.keyboard.press("Escape");
				await page.waitForFunction(() => !document.querySelector<HTMLDialogElement>("#modal").open);
			}
			await page.keyboard.press("Control+k");
			await page.locator("#filter-search").waitFor();
			await action(page, "filter-status", "", status);
		};
		const rect = (page?: any, selector?: any) =>
			page.locator(selector).evaluate((n?: any) => n.getBoundingClientRect().toJSON());
		await runCardActions({
			action,
			artifacts,
			card,
			feedUnopened,
			filter,
			openCard,
			recordLayout,
			scenario,
			state,
		});

		await runReadingSelection({ action, artifacts, card, scenario, state });

		await runCaptureLayout({ action, card, openCard, rect, scenario });

		await runTouchDrag({
			action,
			artifacts,
			card,
			feedUnopened,
			filter,
			recordLayout,
			scenario,
			state,
			touchTargets,
		});

		const failed = results.filter((result?: any) => result.status === "FAIL");
		if (failed.length)
			assert.fail(
				`${failed.length}/${results.length} browser scenarios failed: ${failed.map((result?: any) => result.name).join("; ")}`,
			);
	} finally {
		fs.writeFileSync(
			path.join(artifacts, "browser-results.json"),
			`${JSON.stringify(results, null, 2)}\n`,
		);
		if (browser) await browser.close();
		await new Promise((resolve?: any) => server.close(resolve));
	}
})().catch((error?: any) => {
	console.error(error);
	process.exitCode = 1;
});
