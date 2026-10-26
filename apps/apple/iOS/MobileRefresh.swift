#if os(iOS)
  import Observation
  import SillKit
  import SwiftUI

  @MainActor @Observable final class MobileRefresh {
    enum Phase { case idle, pulling, loading, success, failed }
    private(set) var phase = Phase.idle
    private(set) var progress: Double = 0
    var retry = 0
    @ObservationIgnored private var eligible = false
    @ObservationIgnored private var metrics: MobileScrollMetrics?

    func measured(_ value: MobileScrollMetrics) { metrics = value }

    func pan(
      _ sample: MobilePanSample, enabled: Bool, proxy: MobileScrollProxy,
      action: @escaping @MainActor () async -> Bool
    ) {
      guard phase != .loading && phase != .success else { return }
      switch sample.phase {
      case .began:
        eligible = enabled && (metrics?.offset ?? 1) <= 0 && sample.touches == 1
      case .changed:
        guard eligible, enabled, sample.touches == 1 else {
          cancel()
          return
        }
        guard sample.translation.height > AppleMetrics.dragStartDistance,
          sample.translation.height > abs(sample.translation.width)
        else { return }
        phase = .pulling
        progress = min(1, max(0, -(metrics?.offset ?? 0)) / AppleMetrics.gestureRefreshDistance)
      case .ended:
        let submit = eligible && enabled && phase == .pulling && progress >= 1
        eligible = false
        if submit { Task { await run(proxy: proxy, action: action) } } else { cancel() }
      case .cancelled: cancel()
      }
    }

    func cancel() {
      eligible = false
      guard phase == .pulling else { return }
      withAnimation(MobileMotion.base) {
        phase = .idle
        progress = 0
      }
    }

    func run(proxy: MobileScrollProxy, action: @escaping @MainActor () async -> Bool) async {
      guard phase != .loading && phase != .success else { return }
      phase = .loading
      progress = 1
      proxy.holdPull(AppleMetrics.gestureRefreshDistance)
      let began = Date()
      let slow = Task {
        do { try await Task.sleep(for: .seconds(AppleMetrics.gestureRefreshRelease)) } catch {
          return
        }
        if phase == .loading { proxy.releasePull() }
      }
      let success = await action()
      let remaining = AppleMetrics.loadingDelay - Date().timeIntervalSince(began)
      if remaining > 0 { try? await Task.sleep(for: .seconds(remaining)) }
      slow.cancel()
      proxy.releasePull()
      withAnimation(MobileMotion.fast) { phase = success ? .success : .failed }
      if success {
        try? await Task.sleep(for: .seconds(AppleMetrics.gestureRefreshSuccessHold))
        withAnimation(MobileMotion.fast) {
          phase = .idle
          progress = 0
        }
      }
    }
  }

  struct MobileRefreshIndicator: View {
    let state: MobileRefresh
    @State private var spinning = false

    var body: some View {
      Button {
        if state.phase == .failed { state.retry += 1 }
      } label: {
        ZStack {
          if state.phase == .success {
            MobileIcon("check", size: AppleMetrics.space20)
          } else if state.phase == .failed {
            MobileIcon("refresh", size: AppleMetrics.space20)
          } else {
            Circle().trim(from: 0, to: state.phase == .loading ? 0.75 : state.progress)
              .stroke(
                AppleColors.primary,
                style: StrokeStyle(lineWidth: AppleMetrics.selectionLineWidth, lineCap: .round)
              )
              .rotationEffect(.degrees(spinning ? 270 : -90))
              .animation(
                state.phase == .loading
                  ? .linear(duration: AppleMetrics.aiSpinTurn).repeatForever(autoreverses: false)
                  : nil, value: spinning)
          }
        }.frame(width: AppleMetrics.space20, height: AppleMetrics.space20)
      }
      .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
      .buttonStyle(.plain)
      .allowsHitTesting(state.phase == .failed)
      .accessibilityLabel(
        Copy.text(state.phase == .failed ? "apple.retry" : "apple.refresh.loading")
      )
      .onChange(of: state.phase) { _, phase in spinning = phase == .loading }
    }
  }
#endif
