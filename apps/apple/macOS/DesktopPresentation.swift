import SillKit
import SwiftUI

/// Counts only the time for which a visible toast is available for reading.
struct ToastLifetime {
  private(set) var remaining: Duration
  private var started: ContinuousClock.Instant?

  init(duration: Duration) { remaining = duration }

  mutating func pause(at now: ContinuousClock.Instant) {
    guard let started else { return }
    remaining = max(.zero, remaining - started.duration(to: now))
    self.started = nil
  }

  mutating func resume(at now: ContinuousClock.Instant) {
    guard started == nil else { return }
    started = now
  }
}

/// Presentation identity outlives selection only while the reader fades out.
struct DetailPresentation {
  private(set) var cardID: String?
  var visible = false
  private(set) var generation = 0

  mutating func prepare(_ id: String?) -> Int {
    generation += 1
    if let id {
      if cardID == nil { visible = false }
      cardID = id
    }
    return generation
  }

  mutating func finishClose(_ closingGeneration: Int) {
    guard generation == closingGeneration, !visible else { return }
    cardID = nil
  }

  mutating func invalidate() { generation += 1 }
}

@MainActor extension Workspace {
  /// High-frequency navigation commits immediately without a selection transition.
  func presentNavigation(_ destination: String) {
    settingsPresented = destination == "settings"
    if destination == "search" { searchFocusRequest += 1 }
    if destination == "ai" { aiFocusRequest += 1 }
    page = "home"
  }
}

/// Raw scroll samples do not invalidate the SwiftUI tree. Only visibility does.
@MainActor final class ScrollChromeState {
  var feedEntryCount = 0
  var lastOffset: CGFloat = 0
  var downward: CGFloat = 0
  var upward: CGFloat = 0
  var revealTask: Task<Void, Never>?
}
