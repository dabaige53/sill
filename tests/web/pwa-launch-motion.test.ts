/** Phone sheets travel opaque with their dim; a cloud launch never shows a login before the session answers. */
import assert from "node:assert/strict";

import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CloudBoot } from "../../apps/web/views/cloud-views.tsx";
import { fixture } from "./visibility-motion-fixture.ts";

function phoneSheet(f: ReturnType<typeof fixture>) {
	f.w.matchMedia = () => ({ matches: true });
	const dialog = f.w.document.createElement("dialog");
	dialog.className = "preview";
	dialog.innerHTML = '<div class="preview-sheet"></div>';
	f.w.document.body.append(dialog);
	return dialog;
}

// @wu-test type=behavior | scope=Phone sheet opening | protects=Keep the sheet opaque while its backdrop appears | debt=D6
test("phone sheet rises opaque while its backdrop fades in over the same duration", () => {
	const f = fixture();
	try {
		const dialog = phoneSheet(f);
		f.motion.openPanel(dialog);
		const sheet = f.animations.at(-1);
		assert.deepEqual(
			[...sheet.frames].map((frame: any) => frame.transform),
			["translateY(100%)", "translateY(0)"],
		);
		assert.ok(sheet.frames.every((frame: any) => !("opacity" in frame)));
		const backdrop = f.animations.findLast((a: any) => a.options.pseudoElement === "::backdrop");
		assert.ok(backdrop, "the backdrop should fade in with the sheet");
		assert.deepEqual(
			[...backdrop.frames].map((frame: any) => frame.opacity),
			[0, 1],
		);
		assert.equal(backdrop.options.duration, sheet.options.duration);
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=Phone sheet backdrop | protects=Restore the backdrop after a queued sheet is cancelled | debt=D6
test("queued phone sheet holds its dim for the waiting frame and releases it when cancelled", () => {
	const f = fixture();
	try {
		const dialog = phoneSheet(f);
		dialog.open = true;
		f.w.requestAnimationFrame = () => 1;
		f.w.cancelAnimationFrame = () => {};
		f.motion.queuePanel(dialog);
		const held = f.animations.findLast((a: any) => a.options.pseudoElement === "::backdrop");
		assert.equal(held.time, 1, "a paused scrub at time 1 draws no dim");
		f.motion.cancelPanel(dialog);
		// Cancelling restores the stylesheet dim; a later scrub starts a fresh track.
		f.motion.dim(dialog, 0.5);
		const scrub = f.animations.findLast((a: any) => a.options.pseudoElement === "::backdrop");
		assert.notEqual(scrub, held);
		assert.equal(scrub.time, 0.5);
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=Phone sheet backdrop | protects=Make the backdrop follow an interrupted drag | debt=D6
test("a drag scrub replaces a timed backdrop fade instead of seeking it", () => {
	const f = fixture();
	try {
		const dialog = phoneSheet(f);
		f.motion.dim(dialog, 0);
		f.motion.dim(dialog, 1, 260);
		const fade = f.animations.at(-1);
		let cancelled = false;
		fade.cancel = () => {
			cancelled = true;
		};
		f.motion.dim(dialog, 0.4);
		const scrub = f.animations.at(-1);
		assert.ok(cancelled, "the timed fade must stop");
		assert.notEqual(scrub, fade);
		assert.equal(scrub.options.autoplay, false);
		assert.ok(Math.abs(scrub.time - 0.6) < 1e-9);
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=Phone sheet backdrop | protects=Continue closing from the currently visible backdrop opacity | debt=D6
test("a closing fade starts from the backdrop opacity drawn mid-entry", () => {
	const f = fixture();
	try {
		const dialog = phoneSheet(f);
		f.motion.dim(dialog, 0);
		f.motion.dim(dialog, 1, 200);
		f.animations.at(-1).time = 0.05;
		f.motion.dim(dialog, 0, 260);
		const close = f.animations.at(-1);
		assert.ok(Math.abs(close.frames[0].opacity - 0.25) < 1e-9);
		assert.equal(close.frames[1].opacity, 0);
	} finally {
		f.dom.window.close();
	}
});

// @wu-test type=behavior | scope=Cloud launch placeholder | protects=Show inert placeholders without exposing login controls during boot
test("launch placeholders stay empty first, then draw inert card shells", () => {
	const quiet = renderToStaticMarkup(createElement(CloudBoot, { visible: false }));
	assert.match(quiet, /class="feed-boot"/);
	assert.doesNotMatch(quiet, /feed-item|auth\/login/);
	const shown = renderToStaticMarkup(createElement(CloudBoot, { visible: true }));
	const cards = shown.match(/class="feed-item feed-card feed-skeleton" aria-hidden="true"/g) || [];
	assert.ok(cards.length >= 4);
	assert.doesNotMatch(shown, /data-card|data-action|<button|<a /);
});
