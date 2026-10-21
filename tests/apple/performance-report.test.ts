import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeTrace, parseXCTestMetrics } from "../../scripts/performance-report.ts";

test("XCTest extraction preserves signed memory deltas and declared units", () => {
	const result = parseXCTestMetrics(
		"Test Case '-[Suite search]' measured [Memory Physical, kB] average: -5.000, values: [-10.000, 0.000], performanceMetricID:com.apple.memory, baselineName: \"\"",
	);
	assert.equal(result[0].metric, "Memory Physical, kB");
	assert.deepEqual(result[0].values, [-10, 0]);
	assert.equal(result[0].mean, -5);
});

test("report retains unfinished operations, missing metrics and malformed tail", () => {
	const report = analyzeTrace(
		[
			JSON.stringify({ event: "search", attributes: { phase: "begin", span_id: "1" } }),
			JSON.stringify({ event: "sample", metrics: { cpu_percent: 10, interval_seconds: 1 } }),
			JSON.stringify({ event: "sample", metrics: { cpu_percent: 40, interval_seconds: 3 } }),
			'{"event":',
		].join("\n"),
	);
	assert.equal(report.completed, false);
	assert.equal(report.incomplete, 1);
	assert.equal(report.malformed, 1);
	assert.equal(report.memory_peak_bytes, null);
	assert.equal(report.cpu_average_percent, 32.5);
});
test("report only calculates percentiles with enough samples and excludes heartbeat from operations", () => {
	const events = Array.from({ length: 20 }, (_, i) => ({
		event: "search",
		metrics: { milliseconds: i + 1 },
	}));
	const report = analyzeTrace(
		[...events, { event: "main_thread_delay", metrics: { milliseconds: 300 } }]
			.map((x) => JSON.stringify(x))
			.join("\n"),
	);
	assert.equal(report.stats.search.p95_ms, 19);
	assert.equal(report.stats.search.median_ms, 10.5);
	assert.equal(report.stats.main_thread_delay, undefined);
	assert.equal(report.delays.length, 1);
	assert.equal(analyzeTrace(JSON.stringify(events[0])).stats.search.p95_ms, null);
});
