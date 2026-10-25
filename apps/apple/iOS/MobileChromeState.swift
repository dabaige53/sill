#if os(iOS)
  import Observation
  import SillKit
  import SwiftUI

  /// The phone rail follows the same travel and idle thresholds as ChromeAutoHide on the Web.
  @MainActor @Observable final class MobileChromeState {
    private(set) var hidden = false
    var paused = false
    @ObservationIgnored private var last: CGFloat = 0
    @ObservationIgnored private var down: CGFloat = 0
    @ObservationIgnored private var up: CGFloat = 0
    @ObservationIgnored private var rest: Task<Void, Never>?

    func scrolled(_ metrics: MobileScrollMetrics) {
      guard !paused else {
        rest?.cancel()
        return
      }
      let delta = metrics.offset - last
      last = metrics.offset
      guard delta != 0 else { return }
      rest?.cancel()
      if metrics.offset <= AppleMetrics.space24 || metrics.bottomDistance <= AppleMetrics.space24 {
        show()
        return
      }
      if delta > 0 {
        down += delta
        up = 0
        if down >= AppleMetrics.chromeHideTravel {
          withAnimation(MobileMotion.ease(AppleMetrics.motionRailHide)) { hidden = true }
        }
      } else {
        up -= delta
        down = 0
        if up >= AppleMetrics.chromeShowTravel { show() }
      }
      if hidden {
        rest = Task { [weak self] in
          do { try await Task.sleep(for: .seconds(AppleMetrics.chromeRest)) } catch { return }
          guard let self, !paused else { return }
          show()
        }
      }
    }

    func sync(_ offset: CGFloat) {
      last = offset
      down = 0
      up = 0
      show()
    }

    func show() {
      rest?.cancel()
      down = 0
      up = 0
      withAnimation(MobileMotion.ease(AppleMetrics.motionRailShow)) { hidden = false }
    }
  }
#endif
