import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./visibility-motion-fixture.ts";

test("desktop card entry matches its source rect and phone entry keeps its sheet motion", () => {
	const f = fixture();
	try {
		const dialog = f.w.document.createElement("dialog");
		dialog.className = "preview";
		dialog.innerHTML = '<div class="preview-sheet"></div>';
		f.w.document.body.append(dialog);
		const sheet = dialog.firstElementChild;
		sheet.getBoundingClientRect = () => ({ left: 400, top: 200, width: 600, height: 400 });
		const source = { left: 100, top: 80, width: 300, height: 200 };
		f.motion.openPanel(dialog, source);
		const entry = f.animations.find((a: any) => a.frames[0].transform?.startsWith("translate("));
		assert.equal(entry.frames[0].transform, "translate(-450px,-220px) scale(0.5,0.5)");
		assert.equal(entry.options.stiffness, 274);
		assert.equal(entry.options.damping, 30);
		const dim = f.animations.find((a: any) => a.options.pseudoElement === "::backdrop");
		assert.ok(dim, "the dim grows with the card, not one frame ahead");
		assert.equal(dim.options.stiffness, entry.options.stiffness);
		assert.equal(dim.options.damping, entry.options.damping);
		assert.ok(entry.frames.every((frame: any) => !("width" in frame) && !("height" in frame)));
		f.motion.matchSource(dialog, f.el);
		assert.equal(f.el.style.visibility, "hidden");
		f.motion.returnSource(dialog);
		assert.equal(f.el.style.visibility, "");
		assert.equal(f.animations.at(-1).options.duration, 100);
		assert.equal(f.animations.at(-1).options.delay, 0.22);
		assert.equal(f.animations.at(-1).options.ease, "linear");
		assert.equal(f.animations.at(-1).frames[0].opacity, 0);
		assert.equal(f.animations.at(-1).frames[1].opacity, 1);
		f.motion.releaseSource(dialog);
		assert.equal(f.el.style.visibility, "");
		f.w.matchMedia = () => ({ matches: true });
		f.motion.openPanel(dialog, source);
		assert.equal(f.animations.at(-1).frames[0].transform, "translateY(100%)");
		f.motion.matchSource(dialog, f.el);
		assert.equal(f.el.style.visibility, "");
	} finally {
		f.dom.window.close();
	}
});

test("desktop detail tools start with the surface after layout and cancel together", () => {
	const f = fixture();
	try {
		const dialog = f.w.document.createElement("dialog");
		dialog.open = true;
		dialog.className = "preview";
		dialog.innerHTML =
			'<div class="preview-sheet"><div class="preview-body"></div><div class="sheet-head-tools"></div></div><div class="float-bar"></div>';
		f.w.document.body.append(dialog);
		const sheet = dialog.firstElementChild;
		sheet.getBoundingClientRect = () => ({ left: 400, top: 200, width: 600, height: 400 });
		const bar = dialog.querySelector(".float-bar");
		let frame: () => void = () => {};
		f.w.requestAnimationFrame = (fn: () => void) => {
			frame = fn;
			return 1;
		};
		f.w.cancelAnimationFrame = () => {};
		f.motion.queuePanel(dialog, { left: 100, top: 80, width: 300, height: 200 });
		assert.equal(bar.style.opacity, "0");
		frame();
		// The dim has its own rule (it follows the card's spring); the tools are checked here.
		const motions = f.animations.filter((a: any) => a.options.pseudoElement !== "::backdrop");
		assert.equal(motions[0].options.delay, 0);
		const reveals = motions.filter((a: any) => !("transform" in a.frames[0]));
		assert.deepEqual(
			reveals.map((a: any) => a.options.delay),
			[0.1, 0, 0],
		);
		assert.ok(
			reveals.every((a: any) => a.frames[0].opacity === 0 && !("transform" in a.frames[0])),
		);
		assert.equal(bar.inert, true);
		f.motion.cancelPanel(dialog);
		assert.ok(!bar.inert);
		assert.equal(bar.style.opacity, "");
	} finally {
		f.dom.window.close();
	}
});

test("capsule follows the card bottom at source, midpoint and destination without scaling icons", () => {
	const f = fixture();
	try {
		const surface = { left: 400, top: 200, width: 600, height: 400 };
		const tool = { left: 550, top: 520, width: 300, height: 60 };
		for (const p of [0, 0.5, 1]) {
			const pose = { x: -450 * (1 - p), y: -220 * (1 - p), sx: 0.5 + 0.5 * p, sy: 0.5 + 0.5 * p };
			for (const nested of [false, true]) {
				const result = f.w.MotionTest.capsulePose(pose, surface, tool, nested);
				const worldScaleX = result.sx * (nested ? pose.sx : 1);
				const worldScaleY = result.sy * (nested ? pose.sy : 1);
				assert.equal(worldScaleX, 1);
				assert.equal(worldScaleY, 1);
				const center = nested ? 400 + pose.y + (150 + result.y) * pose.sy : 550 + result.y;
				const bottom = 400 + pose.y + 200 * pose.sy;
				assert.ok(
					Math.abs(bottom - (center + 30) - 20) < 0.001,
					"keep the 20px bottom gap throughout the flight",
				);
			}
		}
	} finally {
		f.dom.window.close();
	}
});

test("return content changes inside the opaque surface while the real card stays hidden", () => {
	const f = fixture();
	try {
		const dialog = f.w.document.createElement("dialog");
		dialog.innerHTML = '<div class="preview-sheet"></div>';
		f.w.document.body.append(dialog);
		const sheet = dialog.firstElementChild;
		const source = f.w.document.createElement("article");
		source.className = "feed-card";
		source.id = "original";
		source.dataset.card = "a";
		source.innerHTML = '<h2 id="title">Original summary</h2>';
		f.w.document.body.append(source);
		source.getBoundingClientRect = () => ({ left: 10, top: 20, width: 300, height: 200 });
		sheet.getBoundingClientRect = () => ({ left: 400, top: 200, width: 600, height: 400 });
		f.motion.matchSource(dialog, source);
		const handoff = f.motion.prepareReturn(dialog, sheet);
		const face = sheet.querySelector("[data-return-face]");
		assert.ok(face);
		assert.equal(face.textContent, "Original summary");
		assert.equal(face.querySelector("[id]"), null);
		assert.equal(face.hasAttribute("data-card"), false);
		assert.equal(face.inert, true);
		assert.equal(face.style.transform, "scale(2,2)");
		assert.equal(source.style.visibility, "hidden");
		assert.equal(f.animations.at(-1).options.delay, 0.08);
		assert.equal(f.animations.at(-1).options.duration, 140);
		f.animations.at(-1).finish();
		assert.equal(face.style.opacity, "1");
		assert.equal(source.style.visibility, "hidden");
		handoff.cancel();
		assert.equal(sheet.querySelector("[data-return-face]"), null);
		f.motion.releaseSource(dialog);
		assert.equal(source.style.visibility, "");
	} finally {
		f.dom.window.close();
	}
});

test("nested detail exit keeps the frozen parent-size surface until completion and cancellation cleans it", async () => {
	const f = fixture();
	try {
		const dialog = f.w.document.createElement("dialog");
		dialog.className = "reader";
		dialog.innerHTML =
			'<div class="reader-scroll" id="reader-scroll"><button data-action="open" data-id="b">Parent</button></div><div class="float-bar"></div>';
		dialog.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });
		f.w.document.body.append(dialog);
		dialog.firstElementChild.scrollTop = 480;
		const captured = f.motion.captureDetail(dialog);
		assert.equal(captured.face.tagName, "DIV", "never nests a native dialog");
		assert.equal(captured.face.querySelector("[id], [data-action], [data-id]"), null);
		dialog.innerHTML =
			'<div class="preview-sheet">Restored parent</div><div class="float-bar"></div>';
		f.motion.navigateDetail(dialog, captured, true);
		assert.equal(captured.face.isConnected, true);
		assert.equal(captured.face.shadowRoot.querySelector(".reader-scroll").scrollTop, 480);
		assert.equal(f.animations.length, 1, "only the outgoing child moves");
		assert.equal(f.animations[0].options.duration, 220);
		f.animations[0].finish();
		await Promise.resolve();
		await Promise.resolve();
		assert.equal(captured.face.isConnected, false);
		assert.equal(dialog.firstElementChild.style.zIndex, "");
		const next = f.motion.captureDetail(dialog);
		f.motion.navigateDetail(dialog, next, false);
		f.motion.cancelPanel(dialog);
		assert.equal(next.face.isConnected, false);
		assert.equal(dialog.firstElementChild.style.zIndex, "");
	} finally {
		f.dom.window.close();
	}
});

test("long detail capture keeps its CSS and isolates controls without sampling paragraph styles", () => {
	const f = fixture();
	try {
		const style = f.w.document.createElement("style");
		style.textContent = '#modal.preview > .preview-sheet::after { content: "edge"; }';
		f.w.document.head.append(style);
		const dialog = f.w.document.createElement("dialog");
		dialog.id = "modal";
		dialog.className = "preview";
		dialog.setAttribute("open", "");
		dialog.innerHTML =
			'<div class="preview-sheet"><div class="sheet-scroll">' +
			'<p class="preview-full">A long paragraph</p>'.repeat(1000) +
			'</div><button data-action="close">Close</button></div>';
		f.w.document.body.append(dialog);
		const computed = f.w.getComputedStyle.bind(f.w);
		let reads = 0;
		f.w.getComputedStyle = (...args: any[]) => {
			reads++;
			return computed(...args);
		};
		const captured = f.motion.captureDetail(dialog);
		assert.ok(reads <= 3, "style sampling depends on surfaces, not the 1000 paragraphs");
		assert.equal(captured.face.querySelector("#modal, [data-action]"), null);
		const root = captured.face.shadowRoot;
		assert.equal(root.querySelectorAll(".preview-full").length, 1000);
		assert.ok(root.querySelector("#modal.preview[open] > .preview-sheet"));
		assert.match(root.querySelector("style").textContent, /preview-sheet::after/);
		assert.equal(f.w.document.querySelectorAll("#modal").length, 1);
		assert.equal(captured.face.inert, true);
	} finally {
		f.dom.window.close();
	}
});

test("phone nested entry moves the sheet and tools by the same distance", () => {
	const f = fixture();
	try {
		f.w.matchMedia = () => ({ matches: true });
		const dialog = f.w.document.createElement("dialog");
		dialog.className = "preview";
		dialog.innerHTML = '<div class="preview-sheet"></div><div class="float-bar"></div>';
		f.w.document.body.append(dialog);
		const captured = f.motion.captureDetail(dialog);
		dialog.firstElementChild.getBoundingClientRect = () => ({ height: 600 });
		f.motion.navigateDetail(dialog, captured, false);
		assert.equal(f.animations.length, 2);
		assert.ok(f.animations.every((a) => a.frames[0].transform === "translateY(600px)"));
		assert.ok(f.animations.every((a) => a.frames.every((frame: any) => !("opacity" in frame))));
		assert.ok(f.animations.every((a) => a.options.duration === 260));
		f.motion.cancelPanel(dialog);
	} finally {
		f.dom.window.close();
	}
});

test("freezing an interrupted reader preserves its drawn transform without applying it twice", () => {
	const f = fixture();
	try {
		const dialog = f.w.document.createElement("dialog");
		dialog.style.transform = "matrix(0.5,0,0,0.5,10,20)";
		dialog.style.transformOrigin = "100px 50px";
		Object.defineProperties(dialog, { offsetWidth: { value: 200 }, offsetHeight: { value: 100 } });
		dialog.getBoundingClientRect = () => ({ left: 60, top: 45, width: 100, height: 50 });
		f.w.document.body.append(dialog);
		const captured = f.motion.captureDetail(dialog);
		assert.equal(captured.face.style.left, "0px");
		assert.equal(captured.face.style.top, "0px");
		assert.equal(captured.face.style.width, "200px");
		assert.equal(captured.face.style.transform, "matrix(0.5,0,0,0.5,10,20)");
		dialog.style.transformOrigin = "0px 0px";
		dialog.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 50 });
		const zeroOrigin = f.motion.captureDetail(dialog);
		assert.equal(zeroOrigin.face.style.left, "0px");
		assert.equal(zeroOrigin.face.style.top, "0px");
	} finally {
		f.dom.window.close();
	}
});

test("reopening the exiting child resumes its drawn opacity and position without retaining old faces", () => {
	const f = fixture();
	try {
		const dialog = f.w.document.createElement("dialog");
		dialog.className = "preview";
		dialog.innerHTML = '<div class="preview-sheet">B</div>';
		f.w.document.body.append(dialog);
		const leaving = f.motion.captureDetail(dialog);
		dialog.innerHTML = '<div class="preview-sheet">A</div>';
		f.motion.navigateDetail(dialog, leaving, true, "b");
		leaving.face.style.opacity = "0.6";
		leaving.face.style.transform = "matrix(1,0,0,1,0,4)";
		const returning = f.motion.captureDetail(dialog, "b");
		assert.equal(returning.face.querySelector("[data-detail-face]"), null);
		f.motion.cancelPanel(dialog);
		dialog.innerHTML = '<div class="preview-sheet">B</div>';
		f.motion.navigateDetail(dialog, returning, false, "a");
		assert.equal(f.animations.at(-1).frames[0].opacity, "0.6");
		assert.equal(f.animations.at(-1).frames[0].transform, "matrix(1,0,0,1,0,4)");
		f.motion.cancelPanel(dialog);
	} finally {
		f.dom.window.close();
	}
});

test("expanded resize uses card geometry and reveals content during travel without cloning media", () => {
	const f = fixture();
	try {
		const dialog = f.w.document.createElement("dialog");
		dialog.className = "reader";
		dialog.open = true;
		dialog.innerHTML =
			'<div class="reader-scroll"><article class="reader-body">Target<iframe src="https://example.test"></iframe></article></div><div class="reader-head">Close</div>';
		f.w.document.body.append(dialog);
		dialog.dataset.readerResize = "true";
		dialog.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800 });
		f.motion.openPanel(dialog, { left: 300, top: 100, width: 600, height: 600 });
		const surface = f.animations.find((a) => a.target === dialog);
		assert.ok(surface);
		assert.equal(surface.frames[0].transform, "translate(0px,0px) scale(0.5,0.75)");
		assert.equal(surface.options.stiffness, 274);
		assert.equal(surface.options.damping, 30);
		assert.ok(f.animations.some((a) => a.target === dialog.querySelector(".reader-body")));
		assert.equal(dialog.querySelectorAll("iframe").length, 1);
		assert.equal(dialog.querySelector("[data-resize-visual]"), null);
		f.motion.cancelPanel(dialog);
		assert.equal(dialog.hasAttribute("data-reader-growing"), false);
	} finally {
		f.dom.window.close();
	}
});

test("queued resize cancellation leaves target content available", () => {
	const f = fixture();
	try {
		const dialog = f.w.document.createElement("dialog");
		dialog.className = "reader";
		dialog.open = true;
		dialog.innerHTML = '<div class="reader-body">New content</div>';
		f.w.document.body.append(dialog);
		dialog.dataset.readerResize = "true";
		f.w.requestAnimationFrame = () => 1;
		f.w.cancelAnimationFrame = () => {};
		f.motion.queuePanel(dialog, { left: 300, top: 100, width: 600, height: 600 });
		f.motion.cancelPanel(dialog);
		assert.equal(dialog.querySelector("[data-resize-visual]"), null);
		assert.equal(dialog.querySelector(".reader-body").textContent, "New content");
		assert.equal(dialog.querySelector(".reader-body").inert, undefined);
	} finally {
		f.dom.window.close();
	}
});
