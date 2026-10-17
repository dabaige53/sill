/** Pull feedback must reflect the refresh result without duplicating visible status. */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = buildSync({
	stdin: {
		contents:
			"export {AppController} from './apps/web/views/app.ts'; export {LocalSync} from './apps/web/services/local-sync.ts';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "RefreshTest",
}).outputFiles[0].text;
test("local pull failure returns false without text or a second dock spinner", async () => {
	const dom = new JSDOM('<main></main><div id="dock"></div>', {
		url: "http://refresh.test/",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: false, addEventListener() {} });
	w.structuredClone = structuredClone;
	w.eval(bundle);
	w.__QG_LOCAL__ = true;
	let alerts = 0,
		offline = 0;
	const app = {
		refreshBusy: false,
		pullRefreshFeedback: false,
		setOffline() {
			offline++;
		},
		alert() {
			alerts++;
		},
		paintPending() {},
		announce() {},
	};
	const { AppController, LocalSync } = w.RefreshTest;
	try {
		LocalSync.refresh = async () => {
			assert.equal(app.pullRefreshFeedback, true);
			assert.equal(w.document.querySelector("#dock").classList.contains("is-busy"), false);
			throw new Error("synthetic read failure");
		};
		assert.equal(await AppController.prototype.refresh.call(app, { feedback: "pull" }), false);
		assert.equal(alerts, 0);
		assert.equal(offline, 0);
		assert.equal(app.refreshBusy, false);
		assert.equal(app.pullRefreshFeedback, false);
		LocalSync.refresh = async () => false;
		assert.equal(await AppController.prototype.refresh.call(app, { feedback: "pull" }), false);
		LocalSync.refresh = async () => true;
		assert.equal(await AppController.prototype.refresh.call(app, { feedback: "pull" }), true);
		assert.equal(w.document.querySelector("#dock").className, "");
	} finally {
		dom.window.close();
	}
});
