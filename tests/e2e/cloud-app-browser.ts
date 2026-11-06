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
			if (hostResult.message === "unknown") throw new Error("Synthetic attachment receipt loss");
			if (hostResult.message === "rejected") throw new Error("Synthetic rejected attachment");
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
							experimental: { "openai/modelContext": {} },
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
	// @wu-test type=integration | scope=MCP App startup | protects=prevent a temporary host failure from leaving the workspace unavailable
	const frame = await (await page.locator("#sill").elementHandle()).contentFrame();
	await frame.locator("body.cloud-signed-in").waitFor();
	assert.ok(startupReads >= 3, "startup recovers after the two synthetic failures");
	assert.equal(await frame.getByRole("button", { name: "重新连接云端" }).count(), 0);
	// @wu-test type=behavior | scope=MCP App navigation | protects=prevent a closed settings page from reopening or leaving the wrong home navigation state
	// Desktop panels keep the navigation lead; two actual clicks keep the latest destination.
	await frame.locator("#account").click({ trial: true });
	const settings = await frame.locator("#account").boundingBox();
	await page.mouse.click(settings.x + settings.width / 2, settings.y + settings.height / 2);
	await frame.locator('#modal [data-action="close"]').first().waitFor();
	await frame.locator('#modal [data-action="close"]').first().click();
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
	// @wu-test type=behavior | scope=MCP App search navigation | protects=prevent search from blocking navigation or return to the home page
	// Search now opens its own page immediately and returns through its top Close control.
	await frame.evaluate(() => window.__app.action("search"));
	assert.equal(await frame.locator("#modal[open].search.page").count(), 1);
	assert.notEqual(
		await frame
			.locator('#nav [data-extra="home"]')
			.evaluate((node: HTMLElement) => getComputedStyle(node).pointerEvents),
		"none",
		"search keeps the capsule reachable",
	);
	assert.equal(await frame.locator("#ai-dock").isVisible(), false);
	await frame.locator("#filter-search").press("Escape");
	await frame.locator("#modal[open]").waitFor({ state: "hidden" });
	assert.equal(await frame.locator("#ai-dock").isVisible(), false);
	await frame
		.locator('#nav [data-extra="home"][aria-current="page"]')
		.waitFor({ state: "attached" });
	assert.equal(await frame.evaluate(() => location.hash), "#feed");
	// @wu-test type=integration | scope=MCP creation and workspace refresh | protects=prevent agent-created cards from being absent from the workspace
	const result = await client.callTool({
		name: "sill_createContent",
		arguments: {
			idempotency_key: "cloud-plugin-fixture",
			body: {
				type: "note",
				title: "Cloud plugin fixture",
				summary: "Stored through MCP",
				body: "Stored through the real MCP and SQL boundary",
			},
		},
	});
	assert.notEqual(result.isError, true);
	await cloudTool(frame, "refresh");
	await frame.locator("[data-card]").waitFor();
	const created = (await client.callTool({ name: "sill_listContents", arguments: {} }))
		.structuredContent.items[0];
	assert.equal(created.title, "Cloud plugin fixture");
	// @wu-test type=integration | scope=MCP App card details | protects=prevent duplicated or overflowing body text and unintended content sent to the host
	// A short saved note must open as one readable layer, with no duplicated lead.
	await frame.locator("[data-card] .card-title-button").click();
	await frame.locator("#modal[open] .preview-full").waitFor();
	assert.equal(await frame.locator("#modal .preview-lead").count(), 0);
	assert.equal(
		await frame.locator("#modal .preview-full").innerText(),
		"Stored through the real MCP and SQL boundary",
	);
	// Measure the settled entry in one frame, not two protocol reads while the sheet is moving.
	await frame.locator("#modal").evaluate(async (node) => {
		await Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})));
	});
	const { detail, sheet } = await frame.evaluate(() => {
		const measure = (selector: string) => {
			const box = document.querySelector(selector).getBoundingClientRect();
			return { y: box.y, height: box.height };
		};
		return { detail: measure(".preview-full"), sheet: measure(".preview-sheet") };
	});
	assert.ok(
		detail.y >= sheet.y && detail.y + detail.height <= sheet.y + sheet.height,
		"short note body stays inside its sheet",
	);
	assert.equal(hostMessages.length, 0, "opening a card never messages the assistant");
	assert.equal(await frame.locator('#modal [data-action="agent-handoff"]').count(), 0);
	assert.equal(hostContexts.length, 0, "details do not attach content to the host");
	assert.equal(await frame.locator("#ai-dock").isVisible(), false);
	await mkdir("tests/artifacts", { recursive: true });
	await frame.getByRole("button", { name: "关闭预览", exact: true }).click();
	await frame.locator("#modal[open]").waitFor({ state: "hidden" });
	await page.screenshot({ path: "tests/artifacts/cloud-app-desktop.png", animations: "disabled" });
	// @wu-test type=boundary | scope=MCP App phone view | protects=prevent horizontal overflow or an unsupported manual content editor on mobile
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({ path: "tests/artifacts/cloud-app-mobile.png", animations: "disabled" });
	assert.ok(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
	assert.equal(await frame.locator("[data-action=edit-content]").count(), 0);
	// @wu-test type=integration | scope=MCP updates and workspace refresh | protects=prevent the workspace from showing stale content after agent updates or deletion
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
	// @wu-test type=integration | scope=MCP App external links | protects=prevent a card from being marked read before the host confirms that its link opened
	const mail = (
		await client.callTool({
			name: "sill_createContent",
			arguments: {
				idempotency_key: "host_mail_link_01",
				body: {
					type: "mail",
					title: "Synthetic linked mail",
					summary: "Synthetic mail with a link",
					body: "Keep this mail unread until navigation is acknowledged.",
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
	// @wu-test type=behavior | scope=photo details and recovery notices | protects=prevent photo navigation from hiding an error notice or sending content unexpectedly | debt=D6
	// Recovery must survive photo navigation, which replaces the lightbox's content.
	const photo = (
		await client.callTool({
			name: "sill_createContent",
			arguments: {
				idempotency_key: "host_photo_recovery_01",
				body: {
					type: "photo",
					title: "Synthetic photo recovery",
					summary: "Synthetic photo for recovery",
					images: ["coast", "mountain"],
				},
			},
		})
	).structuredContent;
	await cloudTool(frame, "refresh");
	await frame.waitForFunction((id?: any) => !!__store.card(id), photo.id);
	await frame.locator(`[data-card="${photo.id}"] .card-title-button`).click();
	await frame.locator("#modal.lightbox[open]").waitFor();
	const messagesBeforePhoto = hostContexts.length;
	await frame.evaluate(() => window.__app.alert("Synthetic photo recovery failure"));
	await frame.evaluate(() => {
		(window as any).__photoRecoveryToast = document.getElementById("toast");
	});
	const firstPhoto = await frame
		.locator('.lightbox-stage .photo-carousel-page[aria-hidden="false"] img')
		.getAttribute("src");
	await frame.locator('[data-action="photo-go"][data-extra="1"]').click();
	assert.notEqual(
		await frame
			.locator('.lightbox-stage .photo-carousel-page[aria-hidden="false"] img')
			.getAttribute("src"),
		firstPhoto,
	);
	assert.equal(await frame.locator("#toast").count(), 1);
	assert.equal(await frame.locator("#modal #toast").isVisible(), true);
	assert.equal(
		await frame.evaluate(
			() => document.getElementById("toast") === (window as any).__photoRecoveryToast,
		),
		true,
		"photo navigation keeps the same live recovery notice",
	);
	assert.equal(await frame.locator('[data-action="agent-handoff"]').count(), 0);
	assert.equal(await frame.locator(".agent-reference-field").count(), 0);
	assert.equal(await frame.locator("#modal-title").innerText(), photo.title);
	assert.equal(await frame.evaluate((id?: any) => __store.card(id)?.title, photo.id), photo.title);
	assert.equal(await frame.locator("#toast").count(), 1);
	assert.match(await frame.locator("#toast").innerText(), /Synthetic photo recovery failure/);
	assert.equal(
		hostContexts.length,
		messagesBeforePhoto,
		"photo recovery never attaches a card to the conversation",
	);
	await page.screenshot({
		path: "tests/artifacts/cloud-photo-message-recovery.png",
		animations: "disabled",
	});
	await frame.locator('.lightbox-top [data-action="close"]').click();
	await frame.locator("#modal[open]").waitFor({ state: "hidden" });
	// @wu-test type=boundary | scope=MCP App permissions and storage | protects=prevent account data from being stored in the browser or network requests from bypassing the host
	await cloudTool(frame, "settings");
	await frame.locator("[data-action=settings-group][data-extra=data]").click();
	assert.equal(await frame.locator("#cloud-logout").innerText(), "管理插件授权");
	assert.deepEqual(
		await frame.evaluate(() => Object.keys(localStorage).filter((key) => key !== "sill-theme")),
		[],
	);
	assert.deepEqual(network, []);
	assert.deepEqual(popups, []);
	assert.deepEqual(errors, []);
	console.log(
		"PASS cloud MCP App: bridge handshake, cancelled late navigation, MCP card creation, no detail handoff, recovery notices across photo pages, host-only links, 1280/390, no direct network or account storage (synthetic identity)",
	);
} finally {
	await browser?.close();
	await client?.close();
	await f.close();
	await new Promise((r?: any) => server.close(r));
}
