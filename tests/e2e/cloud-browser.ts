import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { chromium } from "playwright";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { A } from "../server/helpers/boundary-fixture.ts";
import { cloudFixture } from "../server/helpers/cloud-fixture.ts";
import { cloudLogout, cloudTool, waitCloud } from "../server/helpers/cloud-ui.ts";
import { token } from "../server/helpers/signed-auth.ts";

// Real browser -> HTTP runtime -> official SDK -> synthetic auth transport -> actual SQL.
// No email, production credentials, cloud database, or deployment is involved.
const fixture = await cloudFixture();
let runtime: any,
	browser: any,
	mcpClient: any,
	dropResponse = false;
const server = createServer(async (req?: any, res?: any) => {
	try {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		const body = Buffer.concat(chunks),
			request = new Request(fixture.config.appOrigin + req.url, {
				method: req.method,
				headers: req.headers,
				...(body.length ? { body } : {}),
			});
		const response = await runtime(request);
		if (dropResponse && req.method === "POST" && req.url === "/api/v1/contents") {
			dropResponse = false;
			res.writeHead(503, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: { code: "unavailable" } }));
			return;
		}
		res.writeHead(response.status, {
			...Object.fromEntries(response.headers),
			"set-cookie": response.headers.getSetCookie(),
		});
		res.end(Buffer.from(await response.arrayBuffer()));
	} catch (error) {
		res.writeHead(500);
		res.end("Test harness failure");
		console.error(error);
	}
});
try {
	await new Promise((resolve?: any) => server.listen(0, "127.0.0.1", resolve));
	fixture.config.appOrigin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
	fixture.config.mcpEnabled = true;
	fixture.config.agentAudience = fixture.config.appOrigin + "/mcp";
	await fixture.db.query(
		"insert into sill_private.caller_grants values($1,'oauth:browser-agent',array['content:read','content:write'],array['*'],$2)",
		[A, fixture.config.agentAudience],
	);
	runtime = createSillRuntime(fixture.config, {
		clientFactory: fixture.factory,
		html: await readFile(new URL("../../dist/cloud/index.html", import.meta.url), "utf8"),
	});
	browser = await chromium.launch({
		headless: true,
		...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
		args: ["--no-sandbox"],
	});
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
		page = await context.newPage(),
		errors = [];
	page.on("pageerror", (e?: any) => errors.push(e.message));
	await page.goto(
		fixture.config.appOrigin + "/#access_token=synthetic-invitation&refresh_token=synthetic",
	);
	await page.locator("#password-form").waitFor();
	assert.ok(
		!page.url().includes("token="),
		"implicit invitation fragment is removed, never treated as a login",
	);
	assert.equal(await page.locator("[data-card]").count(), 0);
	await page.locator("#email").fill("synthetic@example.com");
	await page.locator("#email-login").click();
	await page.locator("#email-submit").click();
	await page.waitForFunction(() =>
		document.querySelector("#status").textContent.includes("发送到邮箱"),
	);
	const callback = new URL(fixture.redirect);
	callback.searchParams.set("code", "synthetic-code");
	await page.goto(callback.href);
	await waitCloud(page);
	const signedInCookies = await context.cookies();
	assert.ok(
		signedInCookies.some(
			(c?: any) =>
				c.name === "__Host-sill-refresh" && c.httpOnly && c.secure && c.expires > Date.now() / 1000,
		),
		"login persists a protected refresh cookie",
	);
	await context.addCookies([
		{
			...signedInCookies.find((c?: any) => c.name === "__Host-sill-access"),
			value: token({ exp: Math.floor(Date.now() / 1000) - 60 }),
		},
	]);
	await page.reload();
	await waitCloud(page);
	assert.ok(
		fixture.sessionState.refreshCalls > 0,
		"expired login refreshes without email or user action",
	);
	assert.ok(
		(await context.cookies()).some(
			(c?: any) => c.name === "__Host-sill-refresh" && c.value === "synthetic-rotated-refresh",
		),
	);
	assert.equal(await page.locator("#password-form").count(), 0);
	assert.equal(await page.locator('[data-action="capture"], #cloud-editor').count(), 0);
	// The retired capture UI has no draft. Keep lost-response replay coverage at the HTTP boundary.
	const create = () =>
		page.evaluate(async () => {
			const response = await fetch("/api/v1/contents", {
				method: "POST",
				headers: { "Content-Type": "application/json", "Idempotency-Key": "browser_create_replay" },
				body: JSON.stringify({
					type: "note",
					title: "Browser persisted note",
					body: "Synthetic browser data",
				}),
			});
			return response.status;
		});
	dropResponse = true;
	assert.equal(await create(), 503);
	assert.ok([200, 201].includes(await create()));
	await page.reload();
	await waitCloud(page);
	const records = await page.evaluate(() => window.__store.state.cards);
	assert.equal(records.length, 1, "same idempotency key creates once");
	assert.equal(records[0].title, "Browser persisted note");
	const id = records[0].id;
	await page.evaluate((id: any) => window.__app.action("edit-content", id), id);
	assert.equal(
		await page.locator("#cloud-editor").count(),
		0,
		"existing content has no human editor",
	);
	const external = await page.evaluate(async (id: any) => {
		const current = await (await fetch("/api/v1/contents/" + id)).json();
		const r = await fetch("/api/v1/contents/" + id, {
			method: "PATCH",
			headers: { "Content-Type": "application/json", "Idempotency-Key": "external_editor1" },
			body: JSON.stringify({
				expectedRevision: current.revision,
				changes: { title: "Agent updated note" },
			}),
		});
		return r.status;
	}, id);
	assert.equal(external, 200);
	mcpClient = new Client({ name: "synthetic-agent", version: "1.0.0" });
	await mcpClient.connect(
		new StreamableHTTPClientTransport(new URL(fixture.config.agentAudience), {
			requestInit: {
				headers: {
					Authorization:
						"Bearer " + token({ client_id: "browser-agent", aud: fixture.config.agentAudience }),
				},
			},
		}),
	);
	const mcpCreated = await mcpClient.callTool({
		name: "sill_createContent",
		arguments: {
			idempotency_key: "browser_mcp_1",
			body: {
				type: "note",
				title: "Agent wrote this",
				body: "Visible in the same web workspace",
			},
		},
	});
	assert.ok(!mcpCreated.isError);
	await cloudTool(page, "refresh");
	await page.waitForFunction(
		(id?: any) =>
			window.__store.state.cards.some((c?: any) => c.id === id && c.title === "Agent wrote this"),
		mcpCreated.structuredContent.id,
	);
	const mcpUpdated = await mcpClient.callTool({
		name: "sill_updateContent",
		arguments: {
			id: mcpCreated.structuredContent.id,
			idempotency_key: "browser_mcp_2",
			body: {
				expectedRevision: 1,
				changes: { title: "Agent updated this", body: "Updated in the same workspace" },
			},
		},
	});
	assert.equal(mcpUpdated.structuredContent.revision, 2);
	await cloudTool(page, "refresh");
	await page.waitForFunction(
		(id?: any) =>
			window.__store.state.cards.some(
				(c?: any) => c.id === id && c.revision === 2 && c.title === "Agent updated this",
			),
		mcpCreated.structuredContent.id,
	);
	await mkdir("tests/artifacts", { recursive: true });
	await page.screenshot({ path: "tests/artifacts/cloud-desktop.png", animations: "disabled" });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.waitForFunction(
		() => document.documentElement.scrollWidth <= innerWidth + 1 && !window.__app.layout.frame,
	);
	assert.ok(
		await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
		"mobile does not overflow",
	);
	await page.screenshot({ path: "tests/artifacts/cloud-mobile.png", animations: "disabled" });
	assert.deepEqual(
		await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== "sill-theme")),
		[],
		"no token or private data persisted",
	);
	assert.ok(
		(await context.cookies())
			.filter((c?: any) => c.name === "__Host-sill-access")
			.every((c?: any) => c.httpOnly && c.secure),
	);
	await cloudLogout(page);
	await page.locator("#password-form").waitFor();
	assert.equal(await page.locator("[data-card]").count(), 0);
	assert.deepEqual(errors, []);
	console.log(
		"PASS cloud browser: PKCE, CRUD, lost-response replay, MCP write visible in web, logout, 1440/390, no private localStorage",
	);
} finally {
	await mcpClient?.close();
	await browser?.close();
	await new Promise((resolve?: any) => server.close(resolve));
	await fixture.close();
}
