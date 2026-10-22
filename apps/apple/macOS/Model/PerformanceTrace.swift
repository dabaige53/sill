import AppKit
import Darwin
import Foundation
import OSLog
import Observation
import SillKit

/// Opt-in local diagnostics. Events contain fixed names and numeric measurements only.
@MainActor @Observable final class PerformanceTrace {
  static let shared = PerformanceTrace()
  struct Span {
    let session: UUID
    let name: Operation
    let start: TimeInterval
    let id: UUID
    let signpost: OSSignpostIntervalState
  }
  enum Operation: String {
    case search, selectScope, openCard, openSettings, read, write, queueWait
    case snapshotDiff, snapshotApply, feedRebuild, menuOpen, menuSelect, settingsSelect
  }
  enum Reason: String {
    case user, backgroundActivity, refresh, preferences, cardState, content, unknown
  }
  enum Event: String {
    case menuOpened, menuClosed, menuSelected, settingsChanged, viewAppeared, windowResized
  }
  private let signposter = OSSignposter(subsystem: "app.sill", category: "PointsOfInterest")
  private var activeSpans: [UUID: Span] = [:]
  private(set) var exporting = false
  private(set) var recording = false
  private(set) var folder: URL?
  private var session = UUID()
  private var started = 0.0
  private var sampler: TraceSampler?
  private var sink: TraceSink?
  private let logger = Logger(subsystem: "app.sill", category: "Performance")

  func start(directory: URL? = nil, sampling: Bool = true) throws {
    guard !recording, !exporting else { return }
    let root =
      directory
      ?? FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("Logs/Sill/Performance", isDirectory: true)
    session = UUID()
    let destination = root.appendingPathComponent(session.uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
    sink = try TraceSink(url: destination.appendingPathComponent("trace.jsonl"))
    folder = destination
    started = ProcessInfo.processInfo.systemUptime
    recording = true
    emit("start", values: ["unix_time": Date().timeIntervalSince1970])
    logger.info("Performance recording started")
    let metadata: [String: Any] = [
      "schema_version": 2, "pid": ProcessInfo.processInfo.processIdentifier,
      "mode": ProcessInfo.processInfo.environment["SILL_PERF_AUTOMATED"] == "1"
        ? "automated" : "manual",
      "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "test",
      "build": Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "test",
      "os": ProcessInfo.processInfo.operatingSystemVersionString,
      "processor_count": ProcessInfo.processInfo.processorCount,
      "physical_memory_bytes": ProcessInfo.processInfo.physicalMemory,
      "scenario": ProcessInfo.processInfo.environment["SILL_PERF_SCENARIO"] ?? "manual",
      "automation_token": ProcessInfo.processInfo.environment["SILL_PERF_TOKEN"] ?? "",
      "cpu_basis": "one_core_100_percent", "memory_basis": "resident_bytes",
      "presentation_timing": "view lifecycle proxy; use Instruments for rendered frames",
      "started_unix": Date().timeIntervalSince1970,
    ]
    try JSONSerialization.data(withJSONObject: metadata, options: [.prettyPrinted, .sortedKeys])
      .write(to: destination.appendingPathComponent("session.json"), options: .atomic)
    if sampling, let sink {
      sampler = TraceSampler(sink: sink, started: started)
      sampler?.start()
    }
  }

  func begin(_ name: Operation, reason: Reason = .user, parent: Span? = nil) -> Span? {
    guard recording else { return nil }
    let id = UUID()
    let state = signposter.beginInterval(
      "SillOperation", id: signposter.makeSignpostID(), "\(name.rawValue, privacy: .public)")
    let span = Span(
      session: session, name: name, start: ProcessInfo.processInfo.systemUptime, id: id,
      signpost: state)
    activeSpans[id] = span
    emit(
      name.rawValue, values: [:],
      attributes: [
        "phase": "begin", "span_id": id.uuidString,
        "parent_span_id": parent?.id.uuidString ?? "", "reason": reason.rawValue,
      ])
    return span
  }

  func end(_ span: Span?, success: Bool = true, values: [String: Double] = [:]) {
    guard recording, let span, span.session == session,
      activeSpans.removeValue(forKey: span.id) != nil
    else { return }
    signposter.endInterval("SillOperation", span.signpost)
    let milliseconds = (ProcessInfo.processInfo.systemUptime - span.start) * 1000
    emit(
      span.name.rawValue,
      values: values.merging(["milliseconds": milliseconds, "success": success ? 1 : 0]) { _, b in b
      },
      attributes: [
        "phase": "end", "span_id": span.id.uuidString, "outcome": success ? "success" : "failure",
      ])
  }

  func event(_ event: Event, values: [String: Double] = [:]) {
    guard recording else { return }
    emit(event.rawValue, values: values)
  }

  func mark() {
    if recording {
      signposter.emitEvent("UserMarker")
      emit("marker")
    }
  }

  @discardableResult func stop() throws -> URL? {
    guard recording, let folder, let sink else { return nil }
    sampler?.stop()
    sampler = nil
    for span in activeSpans.values {
      signposter.endInterval("SillOperation", span.signpost)
      emit(
        span.name.rawValue,
        attributes: ["phase": "end", "span_id": span.id.uuidString, "outcome": "incomplete"])
    }
    activeSpans.removeAll()
    emit("stop")
    recording = false
    self.sink = nil
    try sink.finish()
    try TraceSummary.write(folder: folder)
    logger.info("Performance recording stopped")
    return folder
  }

  private func emit(
    _ event: String, values: [String: Double] = [:], attributes: [String: String] = [:]
  ) {
    sink?.record(
      event, elapsed: ProcessInfo.processInfo.systemUptime - started, values: values,
      attributes: attributes)
  }

  func startFromMenu() {
    do { try start() } catch { showError() }
  }
  func exportFromMenu() {
    guard recording, !exporting, let folder, let sink else { return }
    sampler?.stop()
    sampler = nil
    for span in activeSpans.values {
      signposter.endInterval("SillOperation", span.signpost)
      emit(
        span.name.rawValue,
        attributes: ["phase": "end", "span_id": span.id.uuidString, "outcome": "incomplete"])
    }
    activeSpans.removeAll()
    emit("stop")
    recording = false
    exporting = true
    self.sink = nil
    Task {
      do {
        try await Task.detached {
          try sink.finish()
          try TraceSummary.write(folder: folder)
        }.value
        exporting = false
        NSWorkspace.shared.activateFileViewerSelecting([folder])
      } catch {
        exporting = false
        showError()
      }
    }
  }
  func stopForQuit() -> Bool {
    do {
      try stop()
      return true
    } catch {
      showError()
      return false
    }
  }

  private func showError() {
    let alert = NSAlert()
    alert.messageText = Copy.text("apple.trace.error")
    alert.runModal()
  }
}
