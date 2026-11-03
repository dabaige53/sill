import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents: `import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {BackupSettings} from './apps/web/interactions/backup-settings.tsx';
export {act};
export function mount(host,api) {
 const root = createRoot(host);
 root.render(createElement(BackupSettings,{api,owner:'synthetic-owner',host:false}));
 return () => root.unmount();
}`,
		resolveDir: path.resolve(import.meta.dirname, "../.."),
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "BackupTest",
}).outputFiles[0].text;

function fixture() {
	const dom = new JSDOM('<div id="root"></div>', {
		url: "https://sill.test",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const window = dom.window as any;
	window.IS_REACT_ACT_ENVIRONMENT = true;
	window.eval(bundle);
	const document = window.document;
	return { dom, window, document, act: window.BackupTest.act };
}

test("setup retains drafts on cancel, provider changes and failure, then selects the saved target", async () => {
	const { dom, window, document, act } = fixture();
	let targets: any[] = [];
	let fail = true;
	const requests: any[] = [];
	let close: () => void = () => {};
	const api = async (route: string, options?: any) => {
		if (!options) return { targets, backups: [] };
		assert.equal(route, "/api/v1/backups/targets");
		const body = JSON.parse(options.body);
		requests.push(body);
		if (fail) throw { code: "backup_auth_failed", status: 401 };
		const saved = { id: "target-a", config: { provider: body.provider, endpoint: body.endpoint } };
		targets = [saved];
		return saved;
	};
	try {
		await act(async () => {
			close = window.BackupTest.mount(document.querySelector("#root"), api);
		});
		await act(async () => document.querySelector(".backup-add-target").click());
		const form = document.querySelector("form");
		const input = (name: string) => form.elements.namedItem(name);
		input("endpoint").value = "https://storage.sill.test/backup";
		input("username").value = "synthetic-user";
		input("password").value = "synthetic-password";
		const providers = form.querySelectorAll(".segmented button");
		await act(async () => providers[1].click());
		await act(async () => providers[0].click());
		assert.equal(input("password").value, "synthetic-password");
		await act(async () => document.querySelector(".backup-back").click());
		assert.equal(form.hidden, true);
		assert.equal(document.activeElement, document.querySelector(".backup-add-target"));
		await act(async () => document.querySelector(".backup-add-target").click());
		assert.equal(input("endpoint").value, "https://storage.sill.test/backup");
		const submit = () =>
			form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
		await act(async () => submit());
		assert.equal(form.hidden, false);
		assert.equal(input("password").value, "synthetic-password");
		assert.match(document.querySelector('[role="status"]').textContent, /验证失败/);
		assert.deepEqual(Object.keys(requests[0]).sort(), [
			"endpoint",
			"password",
			"provider",
			"username",
		]);
		fail = false;
		await act(async () => submit());
		assert.equal(form.hidden, true);
		assert.equal(input("password").value, "");
		assert.equal(
			document.querySelector(".backup-target-name").textContent,
			"https://storage.sill.test/backup",
		);
		assert.equal(document.querySelector(".backup-target-row select"), null);
		assert.equal(document.activeElement, document.querySelector(".backup-target-row button"));
		assert.equal(document.querySelector(".backup-create-actions .solid-button").disabled, false);
	} finally {
		await act(async () => close());
		dom.window.close();
	}
});

test("connection settings preserve target identity and keep drafts separate from adding a location", async () => {
	const { dom, window, document, act } = fixture();
	const target = {
		id: "target-a",
		config: { provider: "webdav", endpoint: "https://storage.sill.test/backup" },
	};
	let submitted: any;
	let close: () => void = () => {};
	const api = async (_route: string, options?: any) => {
		if (!options) return { targets: [target], backups: [] };
		submitted = JSON.parse(options.body);
		return target;
	};
	try {
		await act(async () => {
			close = window.BackupTest.mount(document.querySelector("#root"), api);
		});
		await act(async () => document.querySelector(".backup-target-row button").click());
		const form = document.querySelector("form");
		assert.equal(form.elements.endpoint.value, target.config.endpoint);
		assert.equal(form.elements.endpoint.readOnly, true);
		assert.ok(
			[...form.querySelectorAll(".segmented button")].every((button: any) => button.disabled),
		);
		form.elements.username.value = "synthetic-user";
		form.elements.password.value = "synthetic-password";
		await act(async () => document.querySelector(".backup-back").click());
		await act(async () => document.querySelector(".backup-add-another").click());
		assert.equal(form.elements.endpoint.value, "");
		assert.equal(form.elements.password.value, "");
		await act(async () => document.querySelector(".backup-back").click());
		await act(async () => document.querySelector(".backup-target-row button").click());
		assert.equal(form.elements.password.value, "synthetic-password");
		await act(async () =>
			form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })),
		);
		assert.equal(submitted.id, target.id);
		assert.equal(submitted.endpoint, target.config.endpoint);
		assert.equal(form.hidden, true);
	} finally {
		await act(async () => close());
		dom.window.close();
	}
});
