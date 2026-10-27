import Foundation
import SillKit

/// Background records: `seen`, reading position and reading time. They are written in the
/// background after the opening animation, coalesce while they wait, change no observed
/// property and never lock a card.
@MainActor final class ActivityRecorder {
  private struct ReadingProgress {
    var value: Double
    var baseline: Double
  }

  private unowned let workspace: Workspace
  private var seen: Set<String> = []
  private var progress: [String: ReadingProgress] = [:]
  private var readingSeconds = 0
  private var sending: (seen: Set<String>, progress: [String: ReadingProgress], seconds: Int) =
    ([], [:], 0)
  private var flushTask: Task<Void, Never>?

  init(workspace: Workspace) { self.workspace = workspace }

  /// A new account must never inherit a previous account's delayed activity.
  func reset() {
    flushTask?.cancel()
    flushTask = nil
    seen = []
    progress = [:]
    readingSeconds = 0
    sending = ([], [:], 0)
  }

  var hasRecords: Bool { !seen.isEmpty || !progress.isEmpty || readingSeconds > 0 }

  /// Opening a card marks it seen. The write waits until the opening animation is over.
  func opened(_ id: String) {
    let state = workspace.state(id)
    guard !state.seen else { return }
    state.markSeenLocally()
    seen.insert(id)
    schedule(after: AppleMetrics.motionDetailOpen)
  }

  /// Reading position, kept off the observed state while the reader is open.
  func read(_ id: String, progress value: Double) {
    let state = workspace.state(id)
    let next = max(state.liveProgress, min(1, max(0, value)))
    guard next > state.liveProgress else { return }
    state.liveProgress = next
    progress[id] = ReadingProgress(
      value: next, baseline: state.confirmed["progress"]?.number ?? 0)
  }

  func readingSecond() { readingSeconds += 1 }

  /// Called when the reader closes, the window loses focus or the app quits.
  func flush() {
    flushTask?.cancel()
    flushTask = nil
    guard hasRecords, sending.seen.isEmpty, sending.progress.isEmpty, sending.seconds == 0 else {
      return
    }
    let build: () -> [WorkspaceOperation] = { [weak self] in self?.drain() ?? [] }
    workspace.queue.background(expectedRevision: workspace.revision, build) { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let snapshot):
        self.workspace.accept(snapshot) {
          for (id, sent) in self.sending.progress {
            if self.progress[id]?.baseline == sent.baseline,
              snapshot.items[id]?["progress"]?.number == sent.value
            {
              self.progress[id]?.baseline = sent.value
            }
          }
          self.sending = ([], [:], 0)
          if self.hasRecords { self.flush() }
        }
      case .failure(let error):
        // Seen and position are idempotent and wait for the next flush after the check.
        // Reading time returns only when the error confirms that nothing was written.
        self.seen.formUnion(self.sending.seen)
        self.progress.merge(self.sending.progress) { current, sent in
          current.baseline == sent.baseline && sent.value > current.value ? sent : current
        }
        let seconds = self.sending.seconds
        self.sending = ([], [:], 0)
        if Self.definitelyNotWritten(error) { self.readingSeconds += seconds }
        if Self.isConflict(error) {
          // The user did nothing here: check quietly instead of showing a conflict.
          self.workspace.refresh()
        } else {
          self.workspace.report(error)
        }
      case nil: break
      }
    }
  }

  private func schedule(after delay: Double) {
    guard flushTask == nil else { return }
    flushTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(delay))
      guard !Task.isCancelled else { return }
      await Task.yield()
      self?.flushTask = nil
      self?.flush()
    }
  }

  /// One kind of change per write: item records first, then reading time.
  private func drain() -> [WorkspaceOperation] {
    if !seen.isEmpty || !progress.isEmpty {
      var patches: [String: [String: JSONValue]] = [:]
      for id in seen { patches[id, default: [:]]["seen"] = .bool(true) }
      for (id, record) in progress
      where (workspace.state(id).confirmed["progress"]?.number ?? 0) == record.baseline {
        patches[id, default: [:]]["progress"] = .number(record.value)
      }
      sending = (seen, progress, 0)
      seen = []
      progress = [:]
      let operations: [WorkspaceOperation] = patches.filter { workspace.model($0.key) != nil }
        .sorted { $0.key < $1.key }.map {
          .itemPatch(id: $0.key, values: $0.value)
        }
      if !operations.isEmpty { return operations }
      sending = ([], [:], 0)
    }
    guard readingSeconds > 0 else { return [] }
    let amount = min(86400, readingSeconds)
    readingSeconds -= amount
    sending = ([], [:], amount)
    return [.reading(seconds: amount)]
  }

  private static func isConflict(_ error: any Error) -> Bool {
    if case StoreError.conflict = error { return true }
    if case CloudWorkspaceError.service(_, 409) = error { return true }
    return false
  }

  private static func definitelyNotWritten(_ error: any Error) -> Bool {
    if let error = error as? StoreError { return error != .unknownWrite }
    // apply() reports uncertain POST failures as unknownWrite. Service errors confirm no write.
    if case CloudWorkspaceError.service = error { return true }
    return false
  }
}
