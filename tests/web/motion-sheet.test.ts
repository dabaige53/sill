import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./visibility-motion-fixture.ts";

function sheetFixture() {
	const f = fixture();
	f.w.matchMedia = () => ({ matches: true });
	const doc = f.w.document;
	const style = doc.createElement("style");
	style.textContent = `
		.preview-sheet { border-radius:24px 24px 0px 0px }
		.preview-sheet.is-full { border-radius:0px }
		.preview-body { padding-top:18px }
		.is-full .preview-body { padding-top:62px }
	`;
	doc.head.append(style);
	const dialog = doc.createElement("dialog");
	dialog.open = true;
	dialog.className = "preview";
	dialog.innerHTML =
		'<div class="preview-sheet"><div class="sheet-head"></div><button class="sheet-handle"></button><div class="sheet-scroll"><div class="preview-body">Text</div></div></div>';
	doc.body.append(dialog);
	const sheet = dialog.firstElementChild as HTMLElement;
	const scroll = sheet.querySelector(".sheet-scroll") as HTMLElement;
	const controls = [...sheet.querySelectorAll<HTMLElement>(".sheet-head, .sheet-handle")];
	const body = sheet.querySelector(".preview-body") as HTMLElement;
	const translate = (node: HTMLElement) =>
		parseFloat(node.style.transform.match(/translateY\(([^)]+)/)?.[1] || "0");
	sheet.getBoundingClientRect = () =>
		({
			top:
				(sheet.style.top
					? parseFloat(sheet.style.top)
					: sheet.classList.contains("is-full")
						? 0
						: 64) + translate(sheet),
			height: parseFloat(sheet.style.height) || (sheet.classList.contains("is-full") ? 844 : 780),
			left: 0,
			width: 390,
		}) as DOMRect;
	dialog.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
	body.getBoundingClientRect = () =>
		({
			top: sheet.getBoundingClientRect().top - scroll.scrollTop + translate(body),
		}) as DOMRect;
	Object.defineProperty(scroll, "offsetHeight", {
		get: () => (sheet.classList.contains("is-full") ? 810 : 746),
	});
	for (const node of controls)
		node.getBoundingClientRect = () =>
			({
				top:
					sheet.getBoundingClientRect().top +
					(sheet.classList.contains("is-full") ? 44 : 0) +
					translate(node),
			}) as DOMRect;
	scroll.scrollTop = 80;
	return { ...f, dialog, sheet, scroll, controls, body };
}

test("phone expansion animates the visible frame and safe-area controls without scaling text", async () => {
	const f = sheetFixture();
	try {
		f.motion.resizeSheet(f.sheet, true);
		const frame = f.animations[0];
		assert.equal(frame.frames[0].transform, "translateY(64px)");
		assert.equal(frame.frames[0].clipPath, "inset(0px 0px 64px 0px round 24px 24px 0px 0px)");
		assert.equal(frame.frames[1].transform, "translateY(0px)");
		assert.equal(frame.frames[1].clipPath, "inset(0px 0px 0px 0px round 0px)");
		assert.equal(frame.options.stiffness, 274);
		assert.equal(frame.options.damping, 27);
		assert.equal(f.scroll.scrollTop, 80, "native scrolling must keep ownership of its position");
		assert.ok(f.animations.slice(1).every((a) => a.frames[0].transform === "translateY(-44px)"));
		assert.ok(
			f.animations.every((a) =>
				a.frames.every(
					(p: { transform: string }) => !/scale/.test(p.transform) && !("height" in p),
				),
			),
		);
		assert.ok(f.dialog.hasAttribute("data-sheet-resizing"));
		for (const a of f.animations) a.finish();
		await Promise.resolve();
		await Promise.resolve();
		assert.equal(f.sheet.style.height, "");
		assert.equal(f.sheet.style.top, "");
		assert.equal(f.sheet.style.clipPath, "");
		assert.equal(f.scroll.style.flex, "");
		assert.equal(f.dialog.hasAttribute("data-sheet-resizing"), false);
		assert.equal(f.sheet.querySelector(".sheet-handle")?.getAttribute("aria-expanded"), "true");
	} finally {
		f.dom.window.close();
	}
});

test("reversing a phone expansion starts at its drawn edges and cancellation restores layout", async () => {
	const f = sheetFixture();
	try {
		f.motion.resizeSheet(f.sheet, true);
		f.sheet.style.transform = "translateY(20px)";
		f.sheet.style.clipPath = "inset(0px 0px 20px 0px round 8px)";
		for (const node of f.controls) node.style.transform = "translateY(-14px)";
		f.body.style.transform = "translateY(-14px)";
		const previous = [...f.animations];
		f.motion.resizeSheet(f.sheet, false);
		const reversed = f.animations[previous.length];
		assert.equal(reversed.frames[0].transform, "translateY(-44px)");
		assert.equal(reversed.frames[0].clipPath, "inset(0px 0px 0px 0px round 8px)");
		assert.equal(reversed.frames[1].clipPath, "inset(0px 0px 44px 0px round 24px 24px 0px 0px)");
		assert.equal(f.scroll.scrollTop, 80);
		for (const a of previous) a.finish();
		await Promise.resolve();
		assert.ok(
			f.dialog.hasAttribute("data-sheet-resizing"),
			"old callbacks cannot clear the new transition",
		);
		f.motion.cancelPanel(f.dialog);
		assert.equal(f.sheet.style.height, "");
		assert.equal(f.sheet.style.clipPath, "");
		assert.equal(f.scroll.style.height, "");
		assert.equal(f.dialog.hasAttribute("data-sheet-resizing"), false);
	} finally {
		f.dom.window.close();
	}
});

test("keyboard resize applies the final layout immediately without temporary animation styles", () => {
	const f = sheetFixture();
	try {
		f.w.document.documentElement.dataset.inputModality = "keyboard";
		f.motion.resizeSheet(f.sheet, true);
		assert.equal(f.animations.length, 0);
		assert.equal(f.sheet.classList.contains("is-full"), true);
		assert.equal(f.sheet.style.height, "");
		assert.equal(f.scroll.scrollTop, 80);
	} finally {
		f.dom.window.close();
	}
});
