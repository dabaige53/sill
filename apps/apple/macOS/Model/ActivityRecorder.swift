import Foundation
import SillKit

/// Background records: `seen`, reading position and reading time. They are written in the
/// background after the opening animation, coalesce while they wait, change no observed
/// property and never lock a card.
@MainActor final class ActivityRecorder {
  private unowned let workspace: Workspace
  private var seen: Set<String> = []
  private var progress: [String: Double] = [:]
  private var readingSeconds = 0
  private var sending: (seen: Set<String>, progress: [String: Double], seconds: Int) = ([], [:], 0)
  private var flushTask: Task<Void, Never>?

  init(workspace: Workspace) { self.workspace = workspace }

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
    progress[id] = next
  }

  func readingSecond() { readingSeconds += 1 }

  /// Called when the reader closes, the window loses focus or the app quits.
  func flush() {
    flushTask?.cancel()
    flushTask = nil
    guard hasRecords else { return }
    let build: () -> [WorkspaceOperation] = { [weak self] in self?.drain() ?? [] }
    workspace.queue.background(build) { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let snapshot):
        self.sending = ([], [:], 0)
        self.workspace.accept(snapshot)
        if self.hasRecords { self.flush() }
      case .failure(let error):
        // Seen and position are idempotent and wait for the next flush after the check.
        // Reading time adds up, so it returns only when nothing was written (a conflict).
        self.seen.formUnion(self.sending.seen)
        self.progress.merge(self.sending.progress) { max($0, $1) }
        let seconds = self.sending.seconds
        self.sending = ([], [:], 0)
        if Self.isConflict(error) {
          // The user did nothing here: check quietly instead of showing a conflict.
          self.readingSeconds += seconds
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
      for (id, value) in progress { patches[id, default: [:]]["progress"] = .number(value) }
      sending = (seen, progress, 0)
      seen = []
      progress = [:]
      return patches.filter { workspace.model($0.key) != nil }.sorted { $0.key < $1.key }.map {
        .itemPatch(id: $0.key, values: $0.value)
      }
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
}
