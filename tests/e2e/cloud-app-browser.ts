// A protocol-host simulator with real MCP/SQL, not actual Codex authorization.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { chromium } from "playwright";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { A, resource } from "../server/helpers/boundary-fixture.ts";
import { cloudFixture } from "../server/helpers/cloud-fixture.ts";
import { cloudTool } from "../server/helpers/cloud-ui.ts";
import { token } from "../server/helpers/signed-auth.ts";

const f = await cloudFixture();
let client: any, browser: any;
const server = createServer((_req?: any, res?: any) => {
	res.writeHead(200, { "Content-Type": "text/html" });
	res.end(
		'<!doctype html><title>Sill protocol-host simulator</title><body style="margin:0"></body>',
	);
});
try {
	const html = await readFile("dist/cloud/app.html", "utf8");
	await f.db.exec(
		`insert into sill_private.caller_grants values('${A}','oauth:app-browser',array['content:read','content:write','content:delete'],array['*'],'${resource}');`,
	);
	const runtime = createSillRuntime(
		{ ...f.config, mcpEnabled: true },
		{ clientFactory: f.factory, appHtml: html },
	);
	client = new Client({ name: "synthetic-cloud-app-host", version: "1" });
	await client.connect(
		new StreamableHTTPClientTransport(new URL(resource), {
			requestInit: {
				headers: { Authorization: "Bearer " + token({ client_id: "app-browser", aud: resource }) },
			},
			fetch: (url?: any, init?: any) => runtime(new Request(url, init)),
		}),
	);
	await new Promise((r?: any) => server.listen(0, "127.0.0.1", r));
	browser = await chromium.launch({
		headless: true,
		...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
		args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
	});
	const toolResults = [];
	const hostMessages = [],
		hostContexts = [],
		hostLinks = [];
	const hostResult = { message: "ok", link: "ok" };
	let startupReads = 0;
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
		errors = [],
		network = [],
		popups = [];
	page.on("pageerror", (e?: any) => errors.push(e.message));
	page.on("popup", (popup?: any) => popups.push(popup));
	await page.exposeBinding("sillTool", async ({ frame }: any, params?: any) => {
		assert.equal(frame, page.mainFrame());
		if (params.name === "sill_open_workspace" && ++startupReads < 3)
			throw new Error("Synthetic host dispatcher starting");
		const result = await client.callTool(params);
		toolResults.push({ name: params.name, arguments: params.arguments, result });
		return result;
	});
	await page.exposeBinding("sillHost", async ({ frame }: any, request?: any) => {
		assert.equal(frame, page.mainFrame());
		if (request.method === "ui/update-model-context") {
			hostContexts.push(request.params);
			return {};
		}
		const messages = request.method === "ui/message";
		(messages ? hostMessages : hostLinks).push(request.params);
		const outcome = messages ? hostResult.message : hostResult.link;
		if (outcome === "unknown") throw new Error("Synthetic receipt loss after host dispatch");
		return { isError: outcome === "rejected" };
	});
	await page.goto("http://127.0.0.1:" + (server.address() as import("node:net").AddressInfo).port);
	await page.route("**/*", (route?: any) => {
		network.push(route.request().url());
		return route.abort();
	});
	await page.evaluate((html?: any) => {
		const iframe = document.createElement("iframe");
		iframe.id = "sill";
		iframe.style.cssText = "width:100%;height:100vh;border:0";
		iframe.sandbox = "allow-scripts allow-same-origin";
		window.addEventListener("message", async (event?: any) => {
			const q = event.data;
			if (event.source !== iframe.contentWindow || q?.jsonrpc !== "2.0" || q.id == null) return;
			const reply = (result?: any, error?: any) =>
				event.source.postMessage(
					{ jsonrpc: "2.0", id: q.id, ...(error ? { error } : { result }) },
					"*",
				);
			try {
				if (q.method === "ui/initialize")
					reply({
						protocolVersion: q.params.protocolVersion,
						hostInfo: { name: "Sill simulator", version: "26.1015.1" },
						hostCapabilities: {
							serverTools: {},
							openLinks: {},
							message: { text: {} },
							updateModelContext: { text: {} },
						},
						hostContext: {
							theme: "light",
							platform: "desktop",
							displayMode: "fullscreen",
							availableDisplayModes: ["fullscreen"],
						},
					});
				else if (q.method === "tools/call") reply(await window.sillTool(q.params));
				else if (["ui/message", "ui/update-model-context", "ui/open-link"].includes(q.method))
					reply(await window.sillHost(q));
				else reply({});
			} catch {
				reply(null, { code: -32603, message: "Synthetic host request failed" });
			}
		});
		document.body.appendChild(iframe);
		iframe.srcdoc = html;
	}, html);
	const frame = await (await page.locator("#sill").elementHandle()).contentFrame();
	await frame.locator("body.cloud-signed-in").waitFor();
	assert.equal(startupReads, 3);
	assert.equal(await frame.getByRole("button", { name: "重新连接云端" }).count(), 0);
	// Desktop panels keep the navigation lead; two actual clicks keep the latest destination.
	await frame.locator('#nav [data-extra="settings"]').click({ trial: true });
	const settings = await frame.locator('#nav [data-extra="settings"]').boundingBox();
	const home = await frame.locator('#nav [data-extra="home"]').boundingBox();
	await page.mouse.click(settings.x + settings.width / 2, settings.y + settings.height / 2);
	await page.mouse.click(home.x + home.width / 2, home.y + home.height / 2);
	// Wait for the actual close lifecycle; iframe frames can be delayed by the host compositor.
	await frame.waitForFunction(() => !document.querySelector<HTMLDialogElement>("#modal")?.open);
	assert.equal(
		await frame.locator("#modal[open]").count(),
		0,
		"a superseded settings panel must not reopen after Home",
	);
	assert.equal(
		await frame.locator('#nav [aria-current="page"]').getAttribute("data-extra"),
		"home",
	);
	// Search now opens its own page immediately and returns through its top Close control.
	await frame.locator('#nav [data-extra="search"]').click();
	assert.equal(await frame.locator("#modal[open].search.page").count(), 1);
	assert.equal(
		await frame
			.locator('#nav [data-extra="home"]')
			.evaluate((node: HTMLElement) => getComputedStyle(node).pointerEvents),
		"none",
		"search immediately removes the capsule from hit testing",
	);
	await frame.locator("#dock").waitFor({ state: "hidden" });
	await frame.locator('.search-header [data-action="close"]').click();
	await frame.locator("#modal[open]").waitFor({ state: "hidden" });
	await frame.locator("#dock").waitFor({ state: "visible" });
	await frame.locator('#nav [data-extra="home"][aria-current="page"]').waitFor();
	assert.equal(await frame.evaluate(() => location.hash), "#feed");
	await frame.getByRole("button", { name: "记下第一条内容" }).click();
	await frame.locator("#cloud-title").fill("Cloud plugin fixture");
	// A definite validation failure leaves the same draft editable, with no uncertain-write lock.
	await frame.locator("#cloud-body").fill("a".repeat(50001));
	await frame.locator("#cloud-save").click();
	await frame.locator("#cloud-save-status").filter({ hasText: "内容不符合保存要求" }).waitFor();
	assert.equal(await frame.locator("#cloud-body").isEnabled(), true);
	assert.equal((await frame.locator("#cloud-body").inputValue()).length, 50001);
	assert.equal(
		(await client.callTool({ name: "sill_listContents", arguments: {} })).structuredContent.items
			.length,
		0,
	);
	await frame.locator("#cloud-body").fill("Stored through the real MCP and SQL boundary");
	await frame.locator("#cloud-save").click();
	await frame
		.locator("[data-card]")
		.waitFor({ timeout: 10000 })
		.catch(async (error?: any) => {
			console.log(
				JSON.stringify({
					toolResults,
					errors,
					body: await frame.locator("body").innerText(),
					title: await frame.locator("#cloud-title").inputValue(),
					status: await frame.locator("#cloud-save-status").innerText(),
				}),
			);
			throw error;
		});
	const created = (await client.callTool({ name: "sill_listContents", arguments: {} }))
		.structuredContent.items[0];
	assert.equal(created.title, "Cloud plugin fixture");
	// A short saved note must open as one readable layer, with no duplicated lead.
	await frame.locator("[data-card] .card-title-button").click();
	await frame.locator("#modal[open] .preview-full").waitFor();
	assert.equal(await frame.locator("#modal .preview-lead").count(), 0);
	assert.equal(
		await frame.locator("#modal .preview-full").innerText(),
		"Stored through the real MCP and SQL boundary",
	);
	const detail = await frame.locator(".preview-full").boundingBox(),
		sheet = await frame.locator(".preview-sheet").boundingBox();
	assert.ok(
		detail.y >= sheet.y && detail.y + detail.height <= sheet.y + sheet.height,
		"short note body stays inside its sheet",
	);
	assert.equal(hostMessages.length, 0, "opening a card never messages the assistant");
	assert.equal(await frame.locator('#modal [data-action="agent-handoff"]').count(), 1);
	const contentWrites = () =>
		toolResults.filter(({ name }) => /sill_(create|update|delete)Content/.test(name)).length;
	const writesBeforeHandoff = contentWrites();
	await frame.getByRole("button", { name: "与助手讨论", exact: true }).click();
	await frame.getByRole("button", { name: "已交给助手", exact: true }).waitFor();
	assert.equal(
		await frame.getByRole("button", { name: "已交给助手", exact: true }).isDisabled(),
		true,
	);
	assert.equal(hostMessages.length, 1);
	assert.equal(hostContexts.length, 1);
	assert.equal(hostMessages[0].role, "user");
	const handoff = JSON.parse(hostMessages[0].content[0].text.split("\n\n").at(-1));
	assert.equal(handoff.expected_owner, A);
	assert.equal(handoff.card.id, created.id);
	assert.equal(handoff.card.title, created.title);
	assert.equal("body" in handoff.card, false);
	assert.equal("state" in handoff.card, false);
	assert.deepEqual(JSON.parse(hostContexts[0].content[0].text), handoff);
	assert.equal(
		toolResults.filter(({ name }) => name === "sill_getContent").at(-1).arguments.expected_owner,
		A,
	);
	assert.equal(contentWrites(), writesBeforeHandoff, "handoff performs no card-content mutation");
	await frame.getByRole("button", { name: "关闭预览", exact: true }).click();
	await frame.locator("#modal[open]").waitFor({ state: "hidden" });
	await frame.locator("[data-card] .card-title-button").click();
	await frame.getByRole("button", { name: "与助手讨论", exact: true }).waitFor();
	assert.equal(hostMessages.length, 1, "reopening a detail only enables a fresh explicit handoff");
	hostResult.message = "unknown";
	await frame.getByRole("button", { name: "与助手讨论", exact: true }).click();
	await frame.getByRole("button", { name: "请先核对当前对话", exact: true }).waitFor();
	assert.equal(
		await frame.getByRole("button", { name: "请先核对当前对话", exact: true }).isDisabled(),
		true,
	);
	assert.equal(hostMessages.length, 2);
	assert.match(await frame.locator("#toast").innerText(), /发送结果尚未确认/);
	assert.equal(await frame.locator(".agent-reference-field").count(), 0);
	assert.equal(await frame.getByRole("button", { name: "复制给助手", exact: true }).count(), 0);
	await mkdir("tests/artifacts", { recursive: true });
	await frame.getByRole("button", { name: "关闭预览", exact: true }).click();
	await frame.locator("#modal[open]").waitFor({ state: "hidden" });
	await page.screenshot({ path: "tests/artifacts/cloud-app-desktop.png", animations: "disabled" });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({ path: "tests/artifacts/cloud-app-mobile.png", animations: "disabled" });
	assert.ok(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
	await frame.locator("[data-card] .card-title-button").press("Shift+F10");
	assert.equal(await frame.locator(".card-more-menu").isVisible(), true);
	assert.equal(await frame.locator("[data-action=edit-content]").count(), 0);
	// The phone header covers main's top edge; dismiss through the exposed page margin.
	const belowHeader = await frame.evaluate(() => {
		const header = document.getElementById("home-top");
		const mainTop = document.querySelector("main").getBoundingClientRect().top;
		return getComputedStyle(header).display === "none"
			? 0
			: Math.max(0, header.getBoundingClientRect().bottom - mainTop);
	});
	await frame.locator("main").click({ position: { x: 2, y: belowHeader + 2 } });
	assert.equal(await frame.locator(".card-more-menu").count(), 0);
	await cloudTool(frame, "capture");
	await frame.locator("#cloud-title").fill("Keep this host draft");
	await frame.locator("#cloud-discard").click();
	await frame.locator("#cloud-confirm").waitFor();
	await frame.locator("[data-action=close]").click();
	assert.equal(await frame.locator("#cloud-title").inputValue(), "Keep this host draft");
	await frame.locator("#cloud-discard").click();
	await frame.locator("#cloud-confirm").click();
	const current = (
		await client.callTool({ name: "sill_getContent", arguments: { id: created.id } })
	).structuredContent;
	const updated = await client.callTool({
		name: "sill_updateContent",
		arguments: {
			id: created.id,
			idempotency_key: "host_ai_update_01",
			body: { expectedRevision: current.revision, changes: { title: "AI updated in plugin" } },
		},
	});
	assert.ok(!updated.isError);
	await cloudTool(frame, "refresh");
	await frame.waitForFunction(() => __store.state.cards[0]?.title === "AI updated in plugin");
	const deleted = await client.callTool({
		name: "sill_deleteContent",
		arguments: {
			id: created.id,
			idempotency_key: "host_ai_delete_01",
			body: { expectedRevision: updated.structuredContent.revision },
		},
	});
	assert.ok(!deleted.isError);
	await cloudTool(frame, "refresh");
	await frame.waitForFunction(() => __store.state.cards.length === 0);
	// The same external action runs through the host even though this iframe forbids popups.
	const mail = (
		await client.callTool({
			name: "sill_createContent",
			arguments: {
				idempotency_key: "host_mail_link_01",
				body: {
					type: "mail",
					title: "Synthetic linked mail",
					body: ["Keep this mail unread until navigation is acknowledged."],
					url: "https://mail.example/message/1",
				},
			},
		})
	).structuredContent;
	await cloudTool(frame, "refresh");
	await frame.waitForFunction((id?: any) => !!__store.card(id), mail.id);
	for (const outcome of ["rejected", "unknown"]) {
		hostResult.link = outcome;
		await frame.evaluate((id?: any) => __app.action("external", id), mail.id);
		await frame
			.locator("#toast")
			.filter({ hasText: outcome === "rejected" ? "链接未打开" : "链接是否打开尚未确认" })
			.waitFor();
		assert.equal(await frame.evaluate((id?: any) => __store.item(id).read, mail.id), false);
		assert.equal(await frame.locator(`[data-card="${mail.id}"]`).count(), 1);
	}
	assert.equal(hostLinks.length, 2);
	assert.equal(
		(await client.callTool({ name: "sill_getContent", arguments: { id: mail.id } }))
			.structuredContent.state?.read || false,
		false,
	);
	hostResult.link = "ok";
	await frame.evaluate((id?: any) => __app.action("external", id), mail.id);
	await frame.waitForFunction((id?: any) => __store.item(id).read, mail.id);
	assert.equal(hostLinks.length, 3);
	assert.ok(hostLinks.every(({ url }) => url === mail.url));
	await page.waitForFunction(
		async (id?: any) =>
			(await window.sillTool({ name: "sill_getContent", arguments: { id } })).structuredContent
				.state?.read,
		mail.id,
		{ polling: 100 },
	);
	// Recovery must survive photo navigation, which replaces the lightbox's content.
	const photo = (
		await client.callTool({
			name: "sill_createContent",
			arguments: {
				idempotency_key: "host_photo_recovery_01",
				body: {
					type: "photo",
					title: "Synthetic photo recovery",
					image: "coast",
					photos: ["coast", "mountain"],
				},
			},
		})
	).structuredContent;
	await cloudTool(frame, "refresh");
	await frame.waitForFunction((id?: any) => !!__store.card(id), photo.id);
	await frame.locator(`[data-card="${photo.id}"] .card-title-button`).click();
	await frame.locator("#modal.lightbox[open]").waitFor();
	const messagesBeforePhoto = hostMessages.length;
	hostResult.message = "unknown";
	await frame.getByRole("button", { name: "与助手讨论", exact: true }).click();
	await frame.getByRole("button", { name: "请先核对当前对话", exact: true }).waitFor();
	await frame.evaluate(() => {
		(window as any).__photoRecoveryToast = document.getElementById("toast");
	});
	const firstPhoto = await frame.locator(".lightbox-stage img").getAttribute("src");
	await frame.locator('[data-action="photo-go"][data-extra="1"]').click();
	assert.notEqual(await frame.locator(".lightbox-stage img").getAttribute("src"), firstPhoto);
	assert.equal(await frame.locator("#toast").count(), 1);
	assert.equal(await frame.locator("#modal #toast").isVisible(), true);
	assert.equal(
		await frame.evaluate(
			() => document.getElementById("toast") === (window as any).__photoRecoveryToast,
		),
		true,
		"photo navigation keeps the same live recovery notice",
	);
	assert.equal(
		await frame.getByRole("button", { name: "请先核对当前对话", exact: true }).isDisabled(),
		true,
	);
	assert.equal(await frame.locator(".agent-reference-field").count(), 0);
	assert.equal(await frame.locator("#modal-title").innerText(), photo.title);
	assert.equal(await frame.evaluate((id?: any) => __store.card(id)?.title, photo.id), photo.title);
	assert.equal(await frame.locator("#toast").count(), 1);
	assert.match(await frame.locator("#toast").innerText(), /发送结果尚未确认/);
	assert.equal(
		hostMessages.length,
		messagesBeforePhoto + 1,
		"photo recovery never resends an uncertain discussion",
	);
	await page.screenshot({
		path: "tests/artifacts/cloud-photo-message-recovery.png",
		animations: "disabled",
	});
	await frame.locator('.lightbox-top [data-action="close"]').click();
	await frame.locator("#modal[open]").waitFor({ state: "hidden" });
	await cloudTool(frame, "settings");
	await frame.locator("[data-action=settings-group][data-extra=data]").click();
	assert.equal(await frame.locator("#cloud-logout").innerText(), "管理插件授权");
	assert.equal(await frame.evaluate(() => localStorage.length), 0);
	assert.deepEqual(network, []);
	assert.deepEqual(popups, []);
	assert.deepEqual(errors, []);
	console.log(
		"PASS cloud MCP App: bridge handshake, cancelled late navigation, editable validation rejection, bounded explicit handoff and copy recovery across photo pages, host-only links, 1280/390, no direct network or storage (synthetic identity)",
	);
} finally {
	await browser?.close();
	await client?.close();
	await f.close();
	await new Promise((r?: any) => server.close(r));
}
