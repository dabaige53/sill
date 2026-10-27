/** Settings press and switch feedback keeps the surrounding panel stable. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./app-fixture.ts";

test("the settings button receives press feedback after keyboard use", async () => {
	const f = fixture();
	try {
		const { w } = f;
		const animations: any[] = [];
		w.__motionAnimations = animations;
		const button = w.document.createElement("button");
		button.id = "account";
		button.className = "home-account";
		w.document.body.append(button);
		w.document.documentElement.dataset.inputModality = "keyboard";
		w.ControllerTest.MotionEngine.bind();
		const press = new w.MouseEvent("pointerdown", { button: 0, bubbles: true });
		Object.defineProperty(press, "isPrimary", { value: true });
		button.dispatchEvent(press);
		assert.equal(w.document.documentElement.dataset.inputModality, "pointer");
		assert.equal(animations.length, 1);
		assert.equal(animations[0].target, button);
		animations[0].finish();
		await Promise.resolve();
		assert.equal(button.style.transform, "scale(0.97)");
		w.document.dispatchEvent(new w.Event("pointerup"));
		animations.at(-1).finish();
		await Promise.resolve();
		assert.equal(button.style.transform, "");
	} finally {
		f.dom.window.close();
	}
});

test("settings toggles animate their knob without fading the panel", () => {
	const f = fixture();
	try {
		const { app, w, Store, Panels } = f;
		Store.setPref("stack", true);
		app.modalKind = "settings";
		app.dialog.innerHTML = Panels.settings(app, "desk");
		const animations: any[] = [];
		w.__motionAnimations = animations;
		app.setPref("stack", false);
		assert.equal(animations.length, 2);
		assert.equal(animations[0].target.classList.contains("toggle-knob"), true);
		assert.equal(animations[0].options.pseudoElement, undefined);
		assert.equal(animations[0].options.visualDuration, 0.32);
		assert.equal(animations[0].options.bounce, 0.2);
		assert.ok("backgroundColor" in animations[1].frames[0]);
		assert.equal(animations[1].options.visualDuration, 0.32);
		assert.equal(animations[0].frames[0].transform, "translateX(20px)");
		assert.equal(animations[0].frames[1].transform, "none");
		w.document.documentElement.dataset.inputModality = "keyboard";
		app.setPref("stack", true);
		assert.equal(animations.length, 2);
	} finally {
		f.dom.window.close();
	}
});
