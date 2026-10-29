import assert from "node:assert/strict";
import test from "node:test";
import { createSillRuntime } from "../../server/cloud/http.ts";
import { cloudFixture } from "./helpers/cloud-fixture.ts";
import { token } from "./helpers/signed-auth.ts";

test("conditional workspace reads retain authorization and return full state after changes", async () => {
	const f = await cloudFixture();
	try {
		const runtime = createSillRuntime(f.config, { clientFactory: f.factory, html: "shell-v1" });
		const read = (revision?: number, authorized = true) =>
			runtime(
				new Request(f.config.appOrigin + "/api/v1/workspace", {
					headers: {
						...(authorized ? { Authorization: "Bearer " + token() } : {}),
						...(revision === undefined ? {} : { "X-Sill-Revision": String(revision) }),
					},
				}),
			);
		const first = await read();
		assert.equal(first.status, 200);
		const snapshot = await first.json();
		assert.ok(Array.isArray(snapshot.state.cards));
		const unchanged = await read(snapshot.revision);
		assert.equal(unchanged.status, 200);
		assert.deepEqual(await unchanged.json(), { revision: snapshot.revision, unchanged: true });
		assert.equal((await read(snapshot.revision, false)).status, 401);
		const stale = await read(snapshot.revision + 1);
		assert.equal(stale.status, 200);
		assert.deepEqual(await stale.json(), snapshot);
	} finally {
		await f.close();
	}
});

test("static PWA shell revalidates without downloading unchanged code and changes its tag on release", async () => {
	const f = await cloudFixture();
	try {
		const options = { clientFactory: f.factory, html: "shell-v1" };
		const runtime = createSillRuntime(f.config, options);
		const first = await runtime(new Request(f.config.appOrigin + "/"));
		assert.equal(first.status, 200);
		assert.equal(await first.text(), "shell-v1");
		const tag = first.headers.get("etag");
		assert.ok(tag);
		assert.equal(first.headers.get("cache-control"), "private, no-cache");
		const request = () =>
			new Request(f.config.appOrigin + "/", { headers: { "If-None-Match": tag! } });
		const cached = await runtime(request());
		assert.equal(cached.status, 304);
		assert.equal(await cached.text(), "");
		const updated = await createSillRuntime(f.config, { ...options, html: "shell-v2" })(request());
		assert.equal(updated.status, 200);
		assert.equal(await updated.text(), "shell-v2");
		assert.notEqual(updated.headers.get("etag"), tag);
	} finally {
		await f.close();
	}
});
