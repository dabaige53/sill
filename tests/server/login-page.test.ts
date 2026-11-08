import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

import { loginPage } from "../../server/cloud/login-page.ts";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
// @wu-test type=behavior | scope=server/cloud login page | protects=Send the selected login intent without leaking the password
test("login switches email and reset intent without sending a password, and reports real responses", async () => {
	const requests: { path: string; body: any }[] = [];
	let fail = false;
	const dom = new JSDOM(loginPage({ emailEnabled: true }), {
		url: "https://sill.invalid/auth/login",
		runScripts: "dangerously",
		beforeParse(window) {
			window.fetch = async (path, options) => {
				requests.push({ path: String(path), body: JSON.parse(String(options?.body)) });
				return {
					ok: !fail,
					status: fail ? 429 : 202,
					json: async () => ({ message: "真实邮件响应" }),
				} as Response;
			};
		},
	});
	try {
		const d = dom.window.document;
		const click = (id: string) => (d.getElementById(id) as HTMLButtonElement).click();
		(d.getElementById("email") as HTMLInputElement).value = "synthetic@example.com";
		(d.getElementById("password") as HTMLInputElement).value = "synthetic-password";
		click("reveal");
		assert.equal((d.getElementById("password") as HTMLInputElement).type, "text");
		assert.equal(d.getElementById("reveal")?.getAttribute("aria-pressed"), "true");
		click("email-login");
		assert.equal(
			(d.getElementById("backup-email") as HTMLInputElement).value,
			"synthetic@example.com",
		);
		click("email-submit");
		await settle();
		assert.deepEqual(requests[0], {
			path: "/auth/login",
			body: { email: "synthetic@example.com", setupPassword: false },
		});
		assert.equal(d.getElementById("status")?.textContent, "真实邮件响应");
		click("back");
		click("forgot");
		fail = true;
		click("email-submit");
		await settle();
		assert.equal(requests[1].body.setupPassword, true);
		assert.notEqual(d.getElementById("status")?.textContent, "真实邮件响应");
		assert.equal((d.getElementById("email-submit") as HTMLButtonElement).disabled, false);
	} finally {
		dom.window.close();
	}
});

// @wu-test type=boundary | scope=server/cloud login page | protects=Require the password setup endpoint and minimum length
test("password setup retains its dedicated endpoint and minimum length", () => {
	const dom = new JSDOM(loginPage({ setup: true }));
	try {
		assert.equal(dom.window.document.querySelector("#email"), null);
		assert.equal(dom.window.document.querySelector("#password")?.getAttribute("minlength"), "12");
		assert.match(loginPage({ setup: true }), /\/auth\/password\/update/);
	} finally {
		dom.window.close();
	}
});

// @wu-test type=behavior | scope=design-system login board | protects=Prevent the design board from sending credentials to a network service
test("generated password-only login board returns only local demo receipts", async () => {
	let requests = 0;
	const html = readFileSync(
		new URL("../../design-system/boards/auth/login.html", import.meta.url),
		"utf8",
	);
	const dom = new JSDOM(html, {
		url: "https://sill.invalid",
		runScripts: "dangerously",
		beforeParse(window) {
			window.fetch = async () => {
				requests++;
				throw new Error("Unexpected network request");
			};
		},
	});
	try {
		const d = dom.window.document;
		(d.getElementById("email") as HTMLInputElement).value = "synthetic@example.com";
		(d.getElementById("password") as HTMLInputElement).value = "synthetic-password";
		(d.querySelector("button[type=submit]") as HTMLButtonElement).click();
		await settle();
		assert.equal(requests, 0);
		assert.match(d.getElementById("status")?.textContent || "", /演示状态/);
	} finally {
		dom.window.close();
	}
});
