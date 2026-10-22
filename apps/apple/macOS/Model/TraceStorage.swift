import Foundation

/// Bounded, ordered off-main serialization. Full buffers are reported, never silently hidden.
final class TraceSink: @unchecked Sendable {
  private let queue = DispatchQueue(label: "app.sill.performance.writer", qos: .utility)
  private let lock = NSLock()
  private var pending = 0
  private var dropped = 0
  private var closed = false
  private var bytes = 0
  private let handle: FileHandle
  private var failure: (any Error)?
  init(url: URL) throws {
    FileManager.default.createFile(atPath: url.path, contents: nil)
    handle = try FileHandle(forWritingTo: url)
  }
  func record(
    _ event: String, elapsed: Double, values: [String: Double] = [:],
    attributes: [String: String] = [:]
  ) {
    lock.lock()
    guard !closed, pending < 2048 else {
      dropped += 1
      lock.unlock()
      return
    }
    pending += 1
    queue.async { [self] in
      defer {
        lock.lock()
        pending -= 1
        lock.unlock()
      }
      guard failure == nil else { return }
      guard bytes < 100 * 1024 * 1024 else {
        lock.lock()
        dropped += 1
        lock.unlock()
        return
      }
      do {
        var row: [String: Any] = ["event": event, "elapsed_seconds": elapsed, "metrics": values]
        if !attributes.isEmpty { row["attributes"] = attributes }
        var data = try JSONSerialization.data(withJSONObject: row, options: .sortedKeys)
        data.append(10)
        try handle.write(contentsOf: data)
        bytes += data.count
      } catch { failure = error }
    }
    lock.unlock()
  }
  func finish() throws {
    lock.lock()
    closed = true
    lock.unlock()
    try queue.sync {
      defer { try? handle.close() }
      if let failure { throw failure }
      lock.lock()
      let count = dropped
      lock.unlock()
      let row = "{\"event\":\"capture_quality\",\"metrics\":{\"dropped_events\":\(count)}}\n"
      try handle.write(contentsOf: Data(row.utf8))
      try handle.synchronize()
    }
  }
}

enum TraceSummary {
  static func write(folder: URL) throws {
    let text = try String(contentsOf: folder.appendingPathComponent("trace.jsonl"), encoding: .utf8)
    let rows = text.split(separator: "\n").compactMap {
      try? JSONSerialization.jsonObject(with: Data($0.utf8)) as? [String: Any]
    }
    let samples = rows.filter { $0["event"] as? String == "sample" }
    func numbers(_ source: [[String: Any]], _ key: String) -> [Double] {
      source.compactMap { ($0["metrics"] as? [String: Any])?[key] as? Double }
    }
    var groups: [String: [Double]] = [:]
    for row in rows {
      if let name = row["event"] as? String, name != "main_thread_delay",
        name != "main_probe_incomplete",
        let ms = (row["metrics"] as? [String: Any])?["milliseconds"] as? Double
      {
        groups[name, default: []].append(ms)
      }
    }
    let stats = groups.mapValues { values -> [String: Any] in
      let sorted = values.sorted()
      var result: [String: Any] = [
        "count": sorted.count,
        "median_ms": (sorted[(sorted.count - 1) / 2] + sorted[sorted.count / 2]) / 2,
        "max_ms": sorted.last!,
      ]
      if sorted.count >= 20 {
        result["p95_ms"] = sorted[Int(ceil(Double(sorted.count) * 0.95)) - 1]
      }
      return result
    }
    let cpu = numbers(samples, "cpu_percent")
    let memory = numbers(samples, "resident_bytes")
    let summary: [String: Any] = [
      "schema_version": 2, "operations": stats,
      "sample_count": samples.count, "peak_cpu_percent": cpu.max() as Any? ?? NSNull(),
      "peak_resident_bytes": memory.max() as Any? ?? NSNull(),
      "main_thread_delays": rows.filter { $0["event"] as? String == "main_thread_delay" }.count,
      "dropped_events": numbers(
        rows.filter { $0["event"] as? String == "capture_quality" }, "dropped_events"
      ).reduce(0, +),
      "duration_seconds": (rows.compactMap { $0["elapsed_seconds"] as? Double }.max() ?? 0),
      "completed": rows.contains { $0["event"] as? String == "stop" },
      "limitations": [
        "Lifecycle signals do not measure displayed pixels.", "CPU uses one core = 100%.",
        "Missing metrics are unavailable, not zero.",
      ],
    ]
    try JSONSerialization.data(withJSONObject: summary, options: [.prettyPrinted, .sortedKeys])
      .write(to: folder.appendingPathComponent("summary.json"), options: .atomic)
    let table = stats.sorted { $0.key < $1.key }.map { name, stat in
      "<tr><td>\(name)</td><td>\(stat["count"]!)</td><td>\(stat["median_ms"]!)</td><td>\(stat["p95_ms"] ?? "样本不足20次")</td><td>\(stat["max_ms"]!)</td></tr>"
    }.joined()
    let html = """
      <!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Sill 性能追踪</title>
      <style>body{font:15px system-ui;max-width:1000px;margin:40px auto;padding:24px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}</style>
      <h1>Sill 性能追踪</h1><p>采样次数：\(samples.count)。主线程延迟事件：\(summary["main_thread_delays"]!)。丢弃事件：\(summary["dropped_events"]!)。</p>
      <p>下表为应用处理阶段，单位毫秒。它不等于屏幕实际呈现耗时；帧卡顿与调用栈请结合 Instruments 查看。</p>
      <table><tr><th>阶段</th><th>次数</th><th>中位数</th><th>P95</th><th>最大</th></tr>\(table)</table>
      <p>trace.jsonl 为逐条事件，summary.json 为汇总，session.json 为环境信息。完整时间线与基线比较可使用仓库的 perf:macos report 命令生成。</p></html>
      """
    try html.write(
      to: folder.appendingPathComponent("report.html"), atomically: true, encoding: .utf8)

  }
}
