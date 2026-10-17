import assert from "node:assert/strict";
import test from "node:test";

// The layout module shares the browser motion engine; provide its read-only media query.
Object.defineProperty(globalThis, "matchMedia", {
	value: () => ({ matches: false }),
	configurable: true,
});
const { columnGeometry } = await import("../../apps/web/interactions/layout.ts");

test("a medium desktop preserves readable columns instead of packing the minimum", () => {
	const layout = columnGeometry(1240);
	assert.equal(layout.columns, 3);
	assert.equal(layout.columnWidth, 380);
	assert.equal(layout.inset, 26);
});

test("compact desks stop at five columns and a phone keeps its available width", () => {
	const compact = columnGeometry(1640, { min: 240, ideal: 280, max: 320 });
	assert.equal(compact.columns, 5);
	assert.ok(compact.columnWidth >= 300);
	assert.deepEqual(columnGeometry(288, { gap: 16 }), {
		columns: 1,
		columnWidth: 288,
		inset: 0,
	});
});

test("density breakpoints never overlap or put columns outside the container", () => {
	for (const profile of [
		{ min: 240, ideal: 280, max: 320 },
		{ min: 280, ideal: 340, max: 380 },
		{ min: 340, ideal: 400, max: 440 },
	]) {
		for (const width of [288, 358, 558, 576, 580, 600, 744, 944, 1240, 1640, 2000]) {
			const { columns, columnWidth, inset } = columnGeometry(width, profile);
			assert.ok(columns >= 1 && columns <= 5);
			assert.ok(inset >= -0.001);
			assert.ok(2 * inset + columns * columnWidth + (columns - 1) * 24 <= width + 0.001);
			if (columns > 1) assert.ok(columnWidth >= profile.min && columnWidth <= profile.max);
		}
	}
});
