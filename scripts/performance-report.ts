/** Offline report for both human and XCTest sessions; no remote resources. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type Row = {
	event: string;
	elapsed_seconds?: number;
	metrics?: Record<string, number>;
	attributes?: Record<string, string>;
};
/** Preserve XCTest's units and signed memory deltas; never label them as app RSS. */
export function parseXCTestMetrics(log: string) {
	return [
		...log.matchAll(
			/Test Case '([^']+)' measured \[([^\]]+)\].*?values: \[([^\]]+)\], performanceMetricID:([^,\s]+)/g,
		),
	].map((m) => {
		const values = m[3].split(",").map(Number);
		return {
			test: m[1],
			metric: m[2],
			id: m[4],
			values,
			mean: values.reduce((a, b) => a + b, 0) / values.length,
		};
	});
}
export function analyzeTrace(text: string) {
	const rows: Row[] = [];
	let malformed = 0;
	for (const line of text.split("\n").filter(Boolean)) {
		try {
			const row = JSON.parse(line);
			if (typeof row.event !== "string") throw Error();
			rows.push(row);
		} catch {
			malformed++;
		}
	}
	const groups: Record<string, number[]> = {},
		active = new Set<string>();
	let incomplete = 0,
		failures = 0;
	for (const row of rows) {
		const a = row.attributes || {},
			m = row.metrics || {};
		if (a.phase === "begin" && a.span_id) active.add(a.span_id);
		if (a.phase === "end" && a.span_id) active.delete(a.span_id);
		if (a.outcome === "incomplete") incomplete++;
		if (m.success === 0 || a.outcome === "failure") failures++;
		if (
			typeof m.milliseconds === "number" &&
			!["main_thread_delay", "main_probe_incomplete"].includes(row.event)
		) {
			groups[row.event] ??= [];
			groups[row.event].push(m.milliseconds);
		}
	}
	const stats = Object.fromEntries(
		Object.entries(groups).map(([key, list]) => {
			const s = list.sort((a, b) => a - b);
			const n = s.length;
			return [
				key,
				{
					count: n,
					median_ms: n % 2 ? s[Math.floor(n / 2)] : (s[n / 2 - 1] + s[n / 2]) / 2,
					p95_ms: n >= 20 ? s[Math.ceil(n * 0.95) - 1] : null,
					max_ms: s[n - 1],
				},
			];
		}),
	);
	const samples = rows.filter((r) => r.event === "sample");
	const cpu = samples.filter((r) => Number.isFinite(r.metrics?.cpu_percent));
	const totalSeconds = cpu.reduce((a, r) => a + (r.metrics.interval_seconds || 1), 0);
	const memory = samples.map((r) => r.metrics?.resident_bytes).filter(Number.isFinite);
	return {
		rows,
		samples,
		stats,
		malformed,
		incomplete: incomplete + active.size,
		failures,
		completed: rows.some((r) => r.event === "stop"),
		duration_seconds: rows.reduce((max, r) => Math.max(max, r.elapsed_seconds || 0), 0),
		cpu_average_percent: totalSeconds
			? cpu.reduce((a, r) => a + r.metrics.cpu_percent * (r.metrics.interval_seconds || 1), 0) /
				totalSeconds
			: null,
		cpu_peak_percent: cpu.length ? Math.max(...cpu.map((r) => r.metrics.cpu_percent)) : null,
		memory_first_bytes: memory[0] ?? null,
		memory_last_bytes: memory.at(-1) ?? null,
		memory_peak_bytes: memory.length ? Math.max(...memory) : null,
		dropped_events: rows.reduce(
			(a, r) => a + (r.event === "capture_quality" ? r.metrics?.dropped_events || 0 : 0),
			0,
		),
		delays: rows.filter((r) => r.event === "main_thread_delay"),
		markers: rows.filter((r) => r.event === "marker"),
	};
}
const esc = (v: unknown) =>
	String(v ?? "不可用").replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
	);
const number = (v: number | null) => (v === null || v === undefined ? "不可用" : v.toFixed(2));
export async function buildPerformanceReport(directory: string, baseline?: string) {
	const data = analyzeTrace(await readFile(resolve(directory, "trace.jsonl"), "utf8"));
	let metadata = {};
	try {
		metadata = JSON.parse(await readFile(resolve(directory, "session.json"), "utf8"));
	} catch {}
	let comparison: object = { status: "未指定基线" };
	if (baseline) {
		const previousMetadata = JSON.parse(await readFile(resolve(baseline, "session.json"), "utf8"));
		let currentRun: any, previousRun: any;
		try {
			currentRun = JSON.parse(await readFile(resolve(directory, "../../run.json"), "utf8"));
			previousRun = JSON.parse(await readFile(resolve(baseline, "../../run.json"), "utf8"));
		} catch {}
		const keys = ["os", "processor_count", "physical_memory_bytes", "mode", "scenario"];
		const compatible =
			keys.every((k) => metadata[k] !== undefined && metadata[k] === previousMetadata[k]) &&
			currentRun &&
			previousRun &&
			["dataset", "cards", "iterations", "template", "platform", "xcode"].every(
				(k) => currentRun[k] !== undefined && currentRun[k] === previousRun[k],
			);
		if (compatible) {
			const previous = analyzeTrace(await readFile(resolve(baseline, "trace.jsonl"), "utf8"));
			const valid = [data, previous].every(
				(r) => r.completed && !r.malformed && !r.dropped_events && !r.incomplete && !r.failures,
			);
			comparison = {
				status: valid ? "环境与数据档位匹配；仅比较同名阶段" : "采集存在失败或缺失，不判断退化",
				operations: Object.fromEntries(
					Object.entries(data.stats).map(([key, value]) => {
						const old = previous.stats[key];
						const enough = valid && value.count >= 20 && old?.count >= 20;
						return [
							key,
							{
								status: !valid ? "采集不完整" : enough ? "可比较" : "样本不足20",
								current: value.p95_ms,
								previous: old?.p95_ms ?? null,
								regression: enough
									? value.p95_ms > old.p95_ms * 1.2 && value.p95_ms - old.p95_ms > 5
									: null,
							},
						];
					}),
				),
			};
		} else comparison = { status: "环境或数据档位不匹配，不自动判断退化" };
	}
	const { rows, samples, ...summary } = data;
	await writeFile(
		resolve(directory, "analysis.json"),
		JSON.stringify({ ...summary, metadata, comparison }, null, 2),
	);
	function chart(key: string, scale = 1) {
		const points = samples.filter((r) => Number.isFinite(r.metrics?.[key]));
		if (!points.length) return "<p>无采样</p>";
		const max = Math.max(1, ...points.map((r) => r.metrics[key] / scale));
		const path = points
			.map(
				(r) =>
					`${20 + ((r.elapsed_seconds || 0) / Math.max(data.duration_seconds, 1)) * 920},${150 - (r.metrics[key] / scale / max) * 120}`,
			)
			.join(" ");
		return `<svg viewBox="0 0 960 180" role="img" aria-label="${esc(key)}时间线"><path d="M20 20V150H940" fill="none" stroke="#aaa"/><polyline points="${path}" fill="none" stroke="#0066cc" stroke-width="2"/><text x="25" y="18">峰值 ${max.toFixed(1)}</text><text x="20" y="175">0s</text><text x="875" y="175">${data.duration_seconds.toFixed(1)}s</text></svg>`;
	}
	const metrics = Object.entries(data.stats)
		.map(
			([k, v]) =>
				`<tr><td>${esc(k)}</td><td>${v.count}</td><td>${number(v.median_ms)}</td><td>${number(v.p95_ms)}</td><td>${number(v.max_ms)}</td></tr>`,
		)
		.join("");
	const events = rows
		.filter((r) => !["sample", "capture_quality"].includes(r.event))
		.map(
			(r) =>
				`<tr><td>${number(r.elapsed_seconds)}</td><td>${esc(r.event)}</td><td>${esc(r.attributes?.phase || "")}</td><td>${esc(r.attributes?.reason || r.attributes?.outcome || "")}</td><td>${number(r.metrics?.milliseconds)}</td></tr>`,
		)
		.join("");
	await writeFile(
		resolve(directory, "report.html"),
		`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sill 性能报告</title><style>body{font:15px system-ui;margin:32px auto;padding:0 24px;max-width:1080px;color:#202124;background:#f7f7f9}section{background:white;padding:24px;margin:20px 0;border-radius:16px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-bottom:1px solid #ddd}svg{width:100%}pre{white-space:pre-wrap}small{color:#666}</style><h1>Sill 性能报告</h1><p>${data.completed ? "已正常结束" : "会话未正常结束"} · ${data.duration_seconds.toFixed(1)} 秒 · ${samples.length} 次采样</p><section><p>CPU 加权平均 ${number(data.cpu_average_percent)}%，峰值 ${number(data.cpu_peak_percent)}%；内存峰值 ${number(data.memory_peak_bytes === null ? null : data.memory_peak_bytes / 1048576)} MiB。</p><p>主线程延迟 ${data.delays.length} 次；失败 ${data.failures} 次；未完成 ${data.incomplete} 个；丢弃 ${data.dropped_events} 条；无法解析 ${data.malformed} 行。</p><small>CPU 以单核心100%计。视图生命周期不是像素呈现时间，实际帧卡顿请查看同批 Instruments .trace 或 XCTest .xcresult。少于20次不显示P95。</small></section><section><h2>CPU</h2>${chart("cpu_percent")}<h2>驻留内存 MiB</h2>${chart("resident_bytes", 1048576)}</section><section><h2>操作阶段（毫秒）</h2><table><tr><th>阶段</th><th>次数</th><th>中位数</th><th>P95</th><th>最大</th></tr>${metrics}</table></section><section><h2>基线比较</h2><pre>${esc(JSON.stringify(comparison, null, 2))}</pre></section><section><details><summary>展开事件时间线</summary><table><tr><th>秒</th><th>事件</th><th>阶段</th><th>来源／结果</th><th>毫秒</th></tr>${events}</table></details></section><section><details><summary>环境与测量口径</summary><pre>${esc(JSON.stringify(metadata, null, 2))}</pre></details></section></html>`,
	);
	console.log(`Report: ${resolve(directory, "report.html")}`);
	return summary;
}
