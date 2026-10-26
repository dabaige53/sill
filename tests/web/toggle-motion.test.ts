import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./app-fixture.ts";

test("settings redraw preserves a running switch spring when its value did not change", async () => {
	const f = fixture();
	try {
		const { app, w, Store, Panels } = f;
		Store.setPref("stack", true);
		app.modalKind = "settings";
		app.dialog.innerHTML = Panels.settings(app, "desk");
		const animations: any[] = [];
		w.__motionAnimations = animations;
		app.setPref("stack", false);
		const thumb = animations[0].target;
		let completed = false;
		animations[0].finished.then(() => (completed = true));
		app.repaintSettings();
		assert.equal(app.dialog.querySelector('[data-id="stack"] .toggle-knob'), thumb);
		assert.equal(animations.length, 2, "an unrelated redraw does not restart the switch");
		animations[0].finish();
		await Promise.resolve();
		assert.equal(completed, true, "the redraw must not cancel the original thumb spring");
	} finally {
		f.dom.window.close();
	}
});

test("reversing a switch captures the drawn thumb and reads the new endpoint after cancellation", () => {
	const f = fixture();
	try {
		const { app, w, Store, Panels } = f;
		Store.setPref("stack", true);
		app.modalKind = "settings";
		app.dialog.innerHTML = Panels.settings(app, "desk");
		const animations: any[] = [];
		w.__motionAnimations = animations;
		app.setPref("stack", false);
		const thumb = animations[0].target;
		let running = true;
		const computed = w.getComputedStyle;
		w.getComputedStyle = (node: Element, pseudo?: string) =>
			node === thumb && running
				? { transform: "matrix(1, 0, 0, 1, 8, 0)" }
				: computed(node, pseudo);
		const cancel = animations[0].cancel;
		animations[0].cancel = () => {
			running = false;
			cancel();
		};
		app.setPref("stack", true);
		assert.equal(animations[2].target, thumb);
		assert.equal(animations[2].frames[0].transform, "matrix(1, 0, 0, 1, 8, 0)");
		assert.equal(animations[2].frames[1].transform, "translateX(20px)");
		assert.equal(animations[2].options.visualDuration, 0.32);
		assert.equal(animations[2].options.bounce, 0.2);
	} finally {
		f.dom.window.close();
	}
});
