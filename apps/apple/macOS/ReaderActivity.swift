import Foundation
import Observation

/// Only the progress indicator observes changes; raw activity never invalidates the reader body.
@MainActor @Observable final class ReaderActivity {
  private(set) var progress = 0.0
  @ObservationIgnored var lastInteraction = Date.now

  func updateProgress(_ value: Double) {
    let displayed = (min(1, max(0, value)) * 100).rounded(.down) / 100
    if progress != displayed { progress = displayed }
  }

  func reset() {
    progress = 0
    lastInteraction = .now
  }
}
