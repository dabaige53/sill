import SillKit
import SwiftUI

/// The same flat progress track used by the HTML player, without a system bezel.
struct PlaybackTrack: View {
  let position: Double
  let duration: Double
  var body: some View {
    GeometryReader { geometry in
      ZStack(alignment: .leading) {
        Capsule().fill(AppleColors.lineHover)
        Capsule().fill(AppleColors.primary)
          .frame(width: geometry.size.width * min(1, max(0, position / max(1, duration))))
      }
    }
  }
}

struct PlaybackScrubber: View {
  let position: Double
  let duration: Double
  let seek: (Double) -> Void
  @Environment(\.isEnabled) private var enabled
  var body: some View {
    GeometryReader { geometry in
      let trackWidth = max(1, geometry.size.width - AppleMetrics.space12)
      ZStack(alignment: .leading) {
        PlaybackTrack(position: position, duration: duration)
          .frame(height: AppleMetrics.space4).padding(.horizontal, AppleMetrics.space6)
        Circle().fill(AppleColors.primary).frame(
          width: AppleMetrics.space12, height: AppleMetrics.space12
        )
        .offset(x: trackWidth * min(1, max(0, position / max(1, duration))))
      }.frame(height: AppleMetrics.space44)
        .contentShape(Rectangle())
        .gesture(
          DragGesture(minimumDistance: 0).onChanged { value in
            if enabled {
              seek(
                min(
                  duration, max(0, (value.location.x - AppleMetrics.space6) / trackWidth * duration)
                ))
            }
          })
    }.frame(height: AppleMetrics.space44)
      .accessibilityElement()
      .accessibilityLabel(Copy.text("web.media.position"))
      .accessibilityValue(Format.duration(Int(position)))
      .accessibilityAdjustableAction { direction in
        guard enabled else { return }
        switch direction {
        case .increment: seek(min(duration, position + 15))
        case .decrement: seek(max(0, position - 15))
        @unknown default: break
        }
      }
  }
}
