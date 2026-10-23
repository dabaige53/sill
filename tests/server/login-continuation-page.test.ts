import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { loginCompletePage } from "../../server/cloud/auth-page.ts";
import { loginPage } from "../../server/cloud/login-page.ts";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the original login tab verifies the session before continuing once, without a refresh", async () => {
	const target = "https://sill.example/oauth/consent?authorization_id=original-request";
	const dom = new JSDOM(
		loginPage({ emailEnabled: true, authorizing: true, returnLocation: target }),
	);
	const navigations: string[] = [];
	let signedIn = false,
		checks = 0;
	let channel: { onmessage?: (event: { data: string }) => void };
	try {
		const document = dom.window.document;
		runInNewContext(document.querySelector("script")!.textContent!, {
			document,
			window: dom.window,
			FormData: dom.window.FormData,
			location: { assign: (url: string) => navigations.push(url) },
			BroadcastChannel: class {
				constructor(name: string) {
					assert.equal(name, "sill-auth");
					channel = this;
				}
			},
			fetch: async (path: string) => {
				if (path === "/auth/session") {
					checks++;
					return { ok: signedIn };
				}
				assert.equal(path, "/auth/login");
				return { ok: true, json: async () => ({ message: "邮件已发送" }) };
			},
		});
		(document.getElementById("email") as HTMLInputElement).value = "synthetic@example.com";
		(document.getElementById("email-login") as HTMLButtonElement).click();
		(document.getElementById("email-submit") as HTMLButtonElement).click();
		await settle();
		channel!.onmessage!({ data: "session-changed" });
		await settle();
		assert.equal(checks, 1);
		assert.deepEqual(navigations, [], "a tab message alone never authenticates a user");
		signedIn = true;
		channel!.onmessage!({ data: "session-changed" });
		dom.window.dispatchEvent(new dom.window.Event("focus"));
		await settle();
		assert.deepEqual(navigations, [target]);
		channel!.onmessage!({ data: "session-changed" });
		await settle();
		assert.deepEqual(
			navigations,
			[target],
			"duplicate completion cannot replay the OAuth callback",
		);
	} finally {
		dom.window.close();
	}
});

test("returning to the original tab works when cross-tab messaging is unavailable", async () => {
	const dom = new JSDOM(loginPage({ emailEnabled: true }));
	const navigations: string[] = [];
	try {
		const document = dom.window.document;
		runInNewContext(document.querySelector("script")!.textContent!, {
			document,
			window: dom.window,
			FormData: dom.window.FormData,
			location: { assign: (url: string) => navigations.push(url) },
			fetch: async () => ({ ok: true, json: async () => ({ message: "邮件已发送" }) }),
		});
		(document.getElementById("email") as HTMLInputElement).value = "synthetic@example.com";
		(document.getElementById("email-login") as HTMLButtonElement).click();
		(document.getElementById("email-submit") as HTMLButtonElement).click();
		await settle();
		dom.window.dispatchEvent(new dom.window.Event("pageshow"));
		await settle();
		assert.deepEqual(navigations, ["/"]);
	} finally {
		dom.window.close();
	}
});

test("email completion sends only a session hint and leaves host continuation to the original tab", () => {
	const messages: unknown[] = [],
		navigations: string[] = [];
	for (const authorizing of [true, false]) {
		const dom = new JSDOM(loginCompletePage({ authorizing }));
		try {
			runInNewContext(dom.window.document.querySelector("script")!.textContent!, {
				BroadcastChannel: class {
					postMessage(value: unknown) {
						messages.push(value);
					}
					close() {}
				},
				location: { replace: (url: string) => navigations.push(url) },
			});
			assert.deepEqual(navigations, authorizing ? [] : ["/"]);
		} finally {
			dom.window.close();
		}
	}
	assert.deepEqual(messages, ["session-changed", "session-changed"]);
});
