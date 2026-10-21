import AppKit
import Darwin
import Foundation

/// Resource sampling continues even when the main actor cannot service input.
final class TraceSampler: @unchecked Sendable {
  private let queue = DispatchQueue(label: "app.sill.performance.sampling", qos: .utility)
  private let sink: TraceSink
  private let started: Double
  private var timer: DispatchSourceTimer?
  private var stopped = false
  private var pending: Double?
  private var asleep = false
  private var background = false
  private var sampleTime: Double
  private var cpu: Double
  private var observers: [NSObjectProtocol] = []

  init(sink: TraceSink, started: Double) {
    self.sink = sink
    self.started = started
    sampleTime = started
    cpu = Self.cpuSeconds()
  }
  @MainActor func start() {
    background = !(NSApp?.isActive ?? false)
    for (name, event) in [
      (NSWorkspace.willSleepNotification, "sleep"), (NSWorkspace.didWakeNotification, "wake"),
    ] {
      observers.append(
        NSWorkspace.shared.notificationCenter.addObserver(forName: name, object: nil, queue: nil) {
          [weak self] _ in
          self?.queue.async { [weak self] in
            guard let self, !self.stopped else { return }
            self.asleep = event == "sleep"
            self.pending = nil
            self.sink.record(event, elapsed: ProcessInfo.processInfo.systemUptime - self.started)
          }
        })
    }
    for (name, active) in [
      (NSApplication.didBecomeActiveNotification, true),
      (NSApplication.didResignActiveNotification, false),
    ] {
      observers.append(
        NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) {
          [weak self] _ in
          self?.queue.async { [weak self] in
            guard let self, !self.stopped else { return }
            self.background = !active
            self.sink.record(
              active ? "foreground" : "background",
              elapsed: ProcessInfo.processInfo.systemUptime - self.started)
          }
        })
    }
    installTimer()
  }

  private func installTimer() {
    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(
      deadline: .now() + .milliseconds(100), repeating: .milliseconds(100),
      leeway: .milliseconds(10))
    timer.setEventHandler { [weak self] in self?.tick() }
    self.timer = timer
    timer.resume()
  }
  func stop() {
    for observer in observers {
      NotificationCenter.default.removeObserver(observer)
      NSWorkspace.shared.notificationCenter.removeObserver(observer)
    }
    observers = []
    queue.sync {
      stopped = true
      timer?.cancel()
      timer = nil
      if let pending {
        sink.record(
          "main_probe_incomplete", elapsed: ProcessInfo.processInfo.systemUptime - started,
          values: ["milliseconds": (ProcessInfo.processInfo.systemUptime - pending) * 1000])
      }
      pending = nil
    }
  }
  private func tick() {
    guard !stopped, !asleep else { return }
    let now = ProcessInfo.processInfo.systemUptime
    if now - sampleTime >= 1 {
      let next = Self.cpuSeconds()
      let percent = max(0, (next - cpu) / (now - sampleTime) * 100)
      var values = [
        "cpu_percent": percent, "interval_seconds": now - sampleTime,
        "background": background ? 1.0 : 0.0,
        "thermal_state": Double(ProcessInfo.processInfo.thermalState.rawValue),
      ]
      if let memory = Self.memoryBytes() { values["resident_bytes"] = Double(memory) }
      if now - sampleTime > 3 {
        sink.record("sampling_gap", elapsed: now - started, values: ["seconds": now - sampleTime])
      }
      sink.record("sample", elapsed: now - started, values: values)
      cpu = next
      sampleTime = now
    }
    guard pending == nil else { return }
    pending = now
    DispatchQueue.main.async { [weak self] in
      let acknowledged = ProcessInfo.processInfo.systemUptime
      self?.queue.async { [weak self] in
        guard let self, !self.stopped, self.pending == now else { return }
        self.pending = nil
        let delay = acknowledged - now
        if delay >= 0.05 {
          self.sink.record(
            "main_thread_delay", elapsed: acknowledged - self.started,
            values: ["milliseconds": delay * 1000, "background": self.background ? 1 : 0])
        }
      }
    }
  }
  private static func cpuSeconds() -> Double {
    var usage = rusage()
    getrusage(RUSAGE_SELF, &usage)
    return Double(usage.ru_utime.tv_sec + usage.ru_stime.tv_sec) + Double(
      usage.ru_utime.tv_usec + usage.ru_stime.tv_usec) / 1_000_000
  }
  private static func memoryBytes() -> UInt64? {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(
      MemoryLayout<mach_task_basic_info>.size / MemoryLayout<integer_t>.size)
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
      }
    }
    return result == KERN_SUCCESS ? info.resident_size : nil
  }
}
