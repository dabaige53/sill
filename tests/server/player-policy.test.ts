import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import test from "node:test";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { startLocal } from "../../server/local/index.ts";
import { config } from "./helpers/signed-auth.ts";

function directives(response: Response) {
	assert.equal(response.status, 200);
	const policy = response.headers.get("Content-Security-Policy");
	assert.ok(policy);
	return Object.fromEntries(
		policy
			.split(";")
			.map((part) => part.trim().split(/\s+/))
			.filter((parts) => parts[0])
			.map(([name, ...values]) => [name, values]),
	);
}
function checkPlayer(response: Response, local: boolean) {
	const csp = directives(response);
	assert.deepEqual(csp["script-src"], [
		...(local ? ["'self'"] : []),
		"'unsafe-inline'",
		"https://www.youtube.com",
	]);
	assert.deepEqual(csp["frame-src"], ["https://www.youtube-nocookie.com"]);
	assert.deepEqual(csp["media-src"], ["https:", "http:"]);
	assert.deepEqual(csp["connect-src"], ["'self'"]);
	assert.deepEqual(csp["img-src"], ["'self'", "data:"]);
	for (const key of ["object-src", "base-uri", "frame-ancestors"])
		assert.deepEqual(csp[key], ["'none'"]);
	assert.deepEqual(csp["default-src"], [local ? "'self'" : "'none'"]);
}

test("local application pages allow only the implemented player origins", async () => {
	const dir = await mkdtemp(
		(process.platform === "darwin" ? "/private/tmp" : tmpdir()) + "/sill-player-policy-",
	);
	const server = await startLocal({ port: 0, file: dir + "/cards.json" });
	try {
		const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		for (const path of ["/", "/index.html"]) checkPlayer(await fetch(origin + path), true);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
		await rm(dir, { recursive: true, force: true });
	}
});

test("cloud application allows the same players without widening authentication pages", async () => {
	const runtime = createSillRuntime(config, { html: "<html>Application</html>" });
	const page = await runtime(new Request(config.appOrigin + "/"));
	checkPlayer(page, false);
	assert.deepEqual(directives(page)["form-action"], ["'self'"]);
	const recovery = directives(await runtime(new Request(config.appOrigin + "/auth/recovery")));
	assert.deepEqual(recovery, {
		"default-src": ["'none'"],
		"style-src": ["'unsafe-inline'"],
		"base-uri": ["'none'"],
		"frame-ancestors": ["'none'"],
	});
	const login = directives(await runtime(new Request(config.appOrigin + "/auth/login")));
	assert.deepEqual(login["script-src"], ["'unsafe-inline'"]);
	assert.equal(login["media-src"], undefined);
	assert.equal(login["frame-src"], undefined);
	assert.deepEqual(login["default-src"], ["'none'"]);
});
