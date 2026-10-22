import Darwin
import Foundation
import Testing

@testable import Sill

@MainActor struct PerformanceTraceTests {
  @Test func recordsAndStopsWithoutContent() throws {
    let root = URL(fileURLWithPath: "/private/tmp/sill-trace-test-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: root) }
    let trace = PerformanceTrace()
    #expect(trace.begin(.search) == nil)
    try trace.start(directory: root, sampling: false)
    let span = trace.begin(.search)
    trace.mark()
    trace.end(span)
    trace.end(span)  // Duplicate completion must not double count.
    let folder = try #require(try trace.stop())
    #expect(!trace.recording)
    let text = try String(contentsOf: folder.appendingPathComponent("trace.jsonl"), encoding: .utf8)
    let rows = try text.split(separator: "\n").map {
      try JSONSerialization.jsonObject(with: Data($0.utf8)) as! [String: Any]
    }
    #expect(
      rows.compactMap { $0["event"] as? String } == [
        "start", "search", "marker", "search", "stop", "capture_quality",
      ])
    #expect(
      rows.allSatisfy {
        Set($0.keys).isSubset(of: ["event", "elapsed_seconds", "metrics", "attributes"])
      })
    #expect(
      FileManager.default.fileExists(atPath: folder.appendingPathComponent("summary.json").path))
    trace.mark()
    #expect(try trace.stop() == nil)
    try trace.start(directory: root, sampling: false)
    trace.end(span)  // An operation from the previous session must not leak into this session.
    let second = try #require(try trace.stop())
    let secondText = try String(
      contentsOf: second.appendingPathComponent("trace.jsonl"), encoding: .utf8)
    #expect(!secondText.contains("search"))
  }

  @Test func samplesResources() async throws {
    let root = URL(fileURLWithPath: "/private/tmp/sill-trace-sample-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: root) }
    let trace = PerformanceTrace()
    try trace.start(directory: root)
    try await Task.sleep(for: .milliseconds(1200))
    usleep(450_000)  // Simulate a blocked main actor without browser automation.
    try await Task.sleep(for: .milliseconds(150))
    let folder = try #require(try trace.stop())
    let text = try String(contentsOf: folder.appendingPathComponent("trace.jsonl"), encoding: .utf8)
    #expect(text.contains("main_thread_delay"))
    #expect(text.contains("cpu_percent"))
    #expect(text.contains("resident_bytes"))
  }
}
