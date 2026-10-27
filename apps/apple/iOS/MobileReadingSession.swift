import Foundation

/// Keeps one reader's activity across preview changes, overlays and background transitions.
@MainActor
final class MobileReadingSession {
  enum SaveResult { case saved, rejected, unknown }
  private let save: (Int, Double) async -> SaveResult
  private var seconds = 0
  private var progress: Double
  private var attempted: Double
  private var confirmed: Double
  private var scheduled: Task<Void, Never>?
  private var saving: Task<Bool, Never>?
  private var generation = 0

  init(progress: Double, save: @escaping (Int, Double) async -> SaveResult) {
    self.progress = progress
    attempted = progress
    confirmed = progress
    self.save = save
  }

  func tick() { seconds += 1 }

  func advance(_ value: Double) {
    guard value.isFinite else { return }
    progress = max(progress, min(0.99, max(0, value)))
    guard progress > attempted, scheduled == nil else { return }
    // Throttle continuous scrolling instead of waiting for scrolling to stop.
    scheduled = Task { [weak self] in
      do { try await Task.sleep(for: .milliseconds(500)) } catch { return }
      guard let self else { return }
      self.scheduled = nil
      _ = await self.flush()
    }
  }

  @discardableResult
  func flush(completed: Bool = false) async -> Bool {
    scheduled?.cancel()
    scheduled = nil
    if completed { progress = 1 }
    let previous = saving
    generation += 1
    let token = generation
    let task = Task {
      if let previous { _ = await previous.value }
      let elapsed = seconds
      let target = progress
      guard elapsed > 0 || target > attempted else { return target <= confirmed }
      seconds = 0
      attempted = target
      let result = await save(elapsed, target)
      switch result {
      case .saved: confirmed = max(confirmed, target)
      case .rejected:
        seconds += elapsed
        attempted = confirmed
      case .unknown: break
      }
      // Do not replay elapsed time after an unknown write result. CloudWorkspace keeps
      // that request pending until the user checks its result.
      return result == .saved
    }
    saving = task
    let saved = await task.value
    if generation == token { saving = nil }
    return saved
  }
}
