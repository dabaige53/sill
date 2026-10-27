import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./app-fixture.ts";

test("settings redraw preserves the running switch progress", () => {
 const f = fixture();
 try {
  const {app, w, Store} = f;
  Store.setPref("stack", true);
  app.modalKind = "settings";
  app.repaintSettings();
  const animations: any[] = [];
  w.__motionValueAnimations = animations;
  app.setPref("stack", false);
  const thumb = app.dialog.querySelector('[data-id="stack"] .toggle-knob');
  app.repaintSettings();
  assert.equal(app.dialog.querySelector('[data-id="stack"] .toggle-knob'), thumb);
  assert.equal(animations.length, 1);
  animations[0].finish();
  assert.equal(thumb.style.transform, "translateX(0px) scaleX(1)");
 } finally { f.dom.window.close(); }
});

test("reversing a switch retargets its current progress", () => {
 const f = fixture();
 try {
  const {app, w, Store} = f;
  Store.setPref("stack", true);
  app.modalKind = "settings";
  app.repaintSettings();
  const animations: any[] = [];
  w.__motionValueAnimations = animations;
  app.setPref("stack", false);
  animations[0].target.set(0.4);
  app.setPref("stack", true);
  assert.equal(animations.length, 2);
  assert.equal(animations[1].target, animations[0].target);
  assert.equal(animations[1].target.get(), 0.4);
  assert.equal(animations[1].destination, 1);
  assert.equal(animations[1].options.visualDuration, 0.3);
  animations[1].finish();
  assert.equal(app.dialog.querySelector('[data-id="stack"] .toggle-fill').style.opacity, '1');
 } finally { f.dom.window.close(); }
});
