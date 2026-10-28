/** Real card field semantics, using an isolated origin and synthetic data only. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { Card } from "../../contracts/card.ts";

const root = path.resolve(import.meta.dirname, "../..");
const artifacts = path.join(root, "tests/artifacts/card-fields");
mkdirSync(artifacts, { recursive: true });
const cards = [
	{
		id: "mail-missing",
		type: "mail",
		title: "Missing sender",
		sources: [{ name: "Inbox source", kind: "mail" }],
		body: "Mail body",
	},
	{
		id: "mail-known",
		type: "mail",
		title: "Known sender",
		authors: [{ name: "Actual sender" }],
		sources: [{ name: "Inbox source", kind: "mail" }],
		body: "Mail body",
	},
	{
		id: "podcast-missing",
		type: "media",
		media: "podcast",
		title: "Unknown duration",
		body: "Podcast notes",
	},
	{
		id: "podcast-zero",
		type: "media",
		media: "podcast",
		title: "Zero duration",
		duration: 0,
		body: "Podcast notes",
	},
	{
		id: "podcast-known",
		type: "media",
		media: "podcast",
		title: "Known duration",
		duration: 240,
		body: "Podcast notes",
	},
	{
		id: "video-missing",
		type: "media",
		media: "video",
		title: "Missing body",
		images: ["coast"],
	},
	{
		id: "video-prose",
		type: "media",
		media: "video",
		title: "Body is prose",
		images: ["mountain"],
		duration: 125,
		url: "https://example.com/video",
		body: ["First paragraph. ".repeat(100), "Second paragraph. ".repeat(100)].join("\n\n"),
	},
].map((card) => Card.parse(card));
const server = createServer((_request, response) => {
	response.writeHead(200, {
		"Content-Type": "text/html; charset=utf-8",
		"Cache-Control": "no-store",
	});
	response.end(readFileSync(path.join(root, "dist/web/index.html")));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const results: { width: number; theme: string; status: string; error?: string }[] = [];
try {
	browser = await chromium.launch({
		headless: true,
		...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
	});
	for (const width of [1440, 390])
		for (const theme of ["light", "dark"] as const) {
			const context = await browser.newContext({
				viewport: { width, height: 900 },
				colorScheme: theme,
				isMobile: width <= 650,
				hasTouch: width <= 650,
				locale: "zh-CN",
			});
			const page = await context.newPage();
			const errors: string[] = [],
				external: string[] = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await context.route("**/*", (route) => {
				const url = route.request().url();
				if (url.startsWith(origin) || url.startsWith("data:")) return route.continue();
				external.push(url);
				return route.abort();
			});
			await page.addInitScript(
				({ cards, theme }) => {
					localStorage.setItem(
						"sill-v1",
						JSON.stringify({
							version: 4,
							cards,
							items: Object.fromEntries(
								cards.map((card) => [
									card.id,
									{ read: false, progress: 0.25, note: "Personal note" },
								]),
							),
							preferences: { onboarded: true, stack: false, floatTimely: false, theme },
						}),
					);
				},
				{ cards, theme },
			);
			try {
				await page.goto(origin + "/#feed");
				await page.waitForFunction(() => window.__app);
				assert.equal(await page.locator('[data-card="mail-missing"] .sender').count(), 0);
				assert.match(await page.locator('[data-card="mail-missing"]').innerText(), /Inbox source/);
				for (const [id, expected] of [
					["podcast-missing", "时长未知"],
					["podcast-zero", "0:00"],
					["podcast-known", "4:00"],
				]) {
					const time = page.locator(`[data-card="${id}"] .mini-player`);
					assert.equal((await time.count()) ? await time.innerText() : "", expected);
				}
				for (const card of cards) {
					await page.locator(`[data-card="${card.id}"] .card-title-button`).click();
					await page.locator("#modal #modal-title").waitFor();
					const dialog = page.locator("#modal");
					assert.equal(await dialog.locator("#modal-title").innerText(), card.title);
					if (card.type === "mail") {
						assert.equal(
							(await dialog.locator(".preview-sender b").count())
								? await dialog.locator(".preview-sender b").innerText()
								: "",
							card.authors?.[0]?.name || "",
						);
						assert.ok(!(await dialog.innerText()).includes("发给你"));
					} else {
						assert.equal(
							await dialog
								.locator(
									".media-step,.media-slide,.media-controls,.player-bar,#podcast-played,[data-action='media-play']",
								)
								.count(),
							0,
						);
						if (card.media === "podcast") {
							assert.equal(await dialog.locator(".player-times span").first().innerText(), "0:00");
							assert.equal(
								await dialog.locator(".player-times span").last().innerText(),
								card.duration ? "−4:00" : "时长未知",
							);
							assert.ok(await dialog.locator(".audio-player input[type='range']").isDisabled());
							await dialog.getByRole("tab", { name: "节目笔记", exact: true }).click();
						} else {
							assert.ok(await dialog.locator(".unavailable-video button").isDisabled());
						}
						assert.deepEqual(
							await dialog.locator(".preview-full p").allTextContents(),
							card.body ? card.body.split("\n\n").map((paragraph) => paragraph.trim()) : [],
						);
					}
					assert.equal(await dialog.locator("aside.preview-note p").innerText(), "Personal note");
					if (card.id === "video-prose") {
						assert.ok(await dialog.locator(".unavailable-video img").isVisible());
						assert.ok(await dialog.locator("[data-action='external']").count());
						await page.waitForTimeout(3000);
						const state = await page.evaluate(
							(id) => JSON.parse(localStorage.getItem("sill-v1")!).items[id],
							card.id,
						);
						assert.equal(
							state.progress,
							0.25,
							"no simulated playback may advance reading progress",
						);
						assert.equal(state.read, false);
					}
					await page.screenshot({
						path: path.join(artifacts, `${width}-${theme}-${card.id}.png`),
						animations: "disabled",
					});
					await page.keyboard.press("Escape");
					await page.waitForFunction(
						() => !(document.querySelector("#modal") as HTMLDialogElement).open,
					);
				}
				assert.deepEqual(errors, []);
				assert.deepEqual(external, []);
				results.push({ width, theme, status: "PASS" });
				console.log("PASS", width, theme, "mail, duration and media facts");
			} catch (error) {
				await page
					.screenshot({
						path: path.join(artifacts, `failure-${width}-${theme}.png`),
						animations: "disabled",
					})
					.catch(() => {});
				results.push({ width, theme, status: "FAIL", error: String(error) });
				console.error("FAIL", width, theme, error);
			} finally {
				await context.close();
			}
		}
} finally {
	await browser?.close();
	await new Promise<void>((resolve) => server.close(() => resolve()));
	writeFileSync(path.join(artifacts, "results.json"), JSON.stringify(results, null, 2));
}
if (results.some((result) => result.status !== "PASS")) process.exitCode = 1;
