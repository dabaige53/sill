import SillKit
import SwiftUI

struct LoadingFeedback: View {
  let active: Bool
  var initiated = false
  var success = true
  @State private var visible = false
  @State private var started: ContinuousClock.Instant?
  @State private var wasInitiated = false
  var body: some View {
    Group {
      if visible {
        Group {
          if active {
            ProgressView().controlSize(.small)
          } else if success {
            NativeIcon(name: "check", size: AppleMetrics.space20)
          }
        }.frame(width: AppleMetrics.space40, height: AppleMetrics.space40)
          .background(AppleColors.card, in: Circle()).modifier(NativeShadow(kind: .floating))
          .transition(NativeMotion.fade)
      }
    }.task(id: active) {
      if active {
        started = .now
        wasInitiated = initiated
        if !initiated {
          do { try await Task.sleep(for: .seconds(AppleMetrics.loadingDelay)) } catch { return }
        }
        guard !Task.isCancelled else { return }
        withAnimation(NativeMotion.ease(AppleMetrics.motionFast)) { visible = true }
      } else {
        if wasInitiated, let started {
          let remaining = max(
            .zero, .seconds(AppleMetrics.loadingDelay) - started.duration(to: .now))
          do { try await Task.sleep(for: remaining) } catch { return }
        }
        guard !Task.isCancelled else { return }
        withAnimation(NativeMotion.ease(AppleMetrics.motionFast)) { visible = false }
      }
    }.accessibilityLabel(Copy.text(active ? "web.refresh.loading" : "web.refresh.success"))
  }
}
