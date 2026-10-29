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

test("settings toggles share one progress animation without fading the panel", () => {
	const f = fixture();
	try {
		const { app, w, Store } = f;
		Store.setPref("stack", true);
		app.modalKind = "settings";
		app.repaintSettings();
		const animations: any[] = [];
		w.__motionValueAnimations = animations;
		app.setPref("stack", false);
		assert.equal(animations.length, 1);
		assert.equal(animations[0].destination, 0);
		assert.equal(animations[0].options.visualDuration, 0.3);
		assert.equal(animations[0].options.bounce, 0.25);
		animations[0].finish();
		const toggle = app.dialog.querySelector('[data-id="stack"]');
		assert.equal(toggle.querySelector(".toggle-fill").style.opacity, "0");
		assert.equal(toggle.querySelector(".toggle-knob").style.transform, "translateX(0px) scaleX(1)");
		w.document.documentElement.dataset.inputModality = "keyboard";
		app.setPref("stack", true);
		assert.equal(animations.length, 1);
		assert.equal(toggle.querySelector(".toggle-fill").style.opacity, "1");
	} finally {
		f.dom.window.close();
	}
});
