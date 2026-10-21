import Foundation
import Observation
import SillKit
import SwiftUI

/// Pull feedback belongs to the local refresh result, never to an assumed external sync.
@MainActor @Observable final class FeedRefresh {
  enum Phase { case idle, pulling, loading, success, error }
  private(set) var phase = Phase.idle
  private(set) var distance: CGFloat = 0
  @ObservationIgnored var request: (@escaping (Bool) -> Void) -> Void = { $0(false) }
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var rest: Task<Void, Never>?
  @ObservationIgnored private var feedback: Task<Void, Never>?
  @ObservationIgnored private var hold: Task<Void, Never>?

  var offset: CGFloat { distance * AppleMetrics.gestureRefreshTravel }
  var visible: Bool { phase != .idle }

  /// Own a pull from the top until its terminal event, including zero-delta endings.
  func receive(delta: CGFloat, input: WheelPhase, atTop: Bool) -> Bool {
    if input == .ended || input == .cancelled {
      let owned = phase == .pulling
      if owned { release(cancelled: input == .cancelled) }
      return owned
    }
    if input == .momentum { return phase == .pulling }
    guard phase == .pulling || (atTop && delta > 0 && phase == .idle) else { return false }
    pull(delta, discrete: input == .discrete)
    return true
  }

  func pull(_ delta: CGFloat, discrete: Bool = true) {
    guard phase == .idle || phase == .pulling else { return }
    Motion.instantly {
      phase = .pulling
      distance = max(0, min(AppleMetrics.gestureRefreshDistance * 2, distance + delta))
    }
    rest?.cancel()
    guard discrete else { return }
    rest = Task { [weak self] in
      do { try await Task.sleep(for: .seconds(AppleMetrics.gestureWheelRest)) } catch { return }
      self?.release()
    }
  }

  /// Absolute mouse travel: preview immediately, never schedule a timeout to commit it.
  func drag(_ travel: CGFloat) {
    guard phase == .idle || phase == .pulling else { return }
    rest?.cancel()
    let travel = max(0, travel)
    Motion.instantly {
      phase = .pulling
      distance = min(72, min(travel, 80) * 0.65 + max(0, travel - 80) * 0.18)
    }
  }

  func release(cancelled: Bool = false) {
    rest?.cancel()
    guard phase == .pulling else { return }
    if !cancelled && distance >= AppleMetrics.gestureRefreshDistance {
      refresh(fromPull: true)
    } else {
      withAnimation(Motion.spring()) {
        distance = 0
        phase = .idle
      }
    }
  }

  func refresh(fromPull: Bool = false) {
    guard phase != .loading else { return }
    generation += 1
    let token = generation
    let start = ProcessInfo.processInfo.systemUptime
    withAnimation(Motion.spring()) {
      distance = fromPull ? AppleMetrics.gestureRefreshDistance : 0
      phase = .loading
    }
    // Let the content return during a slow read; the progress indicator stays visible.
    hold?.cancel()
    hold = Task { [weak self] in
      do { try await Task.sleep(for: .seconds(AppleMetrics.gestureRefreshRelease)) } catch {
        return
      }
      guard let self, self.generation == token, self.phase == .loading else { return }
      withAnimation(Motion.spring()) { self.distance = 0 }
    }
    request { [weak self] success in
      guard let self, self.generation == token, self.phase == .loading else { return }
      self.feedback = Task { [weak self] in
        let remaining = max(
          0, AppleMetrics.loadingDelay - (ProcessInfo.processInfo.systemUptime - start))
        do { try await Task.sleep(for: .seconds(remaining)) } catch { return }
        guard let self, self.generation == token else { return }
        self.hold?.cancel()
        withAnimation(Motion.fast) { self.phase = success ? .success : .error }
        withAnimation(Motion.spring()) { self.distance = 0 }
        if !success { return }
        do { try await Task.sleep(for: .seconds(AppleMetrics.gestureRefreshSuccessHold)) } catch {
          return
        }
        guard self.generation == token else { return }
        withAnimation(Motion.spring()) {
          self.distance = 0
          self.phase = .idle
        }
      }
    }
  }

  func cancel() {
    generation += 1
    rest?.cancel()
    feedback?.cancel()
    hold?.cancel()
    withAnimation(Motion.spring()) {
      distance = 0
      phase = .idle
    }
  }
}

struct FeedPullOffset: ViewModifier {
  let refresh: FeedRefresh
  func body(content: Content) -> some View { content.offset(y: refresh.offset) }
}

struct FeedRefreshIndicator: View {
  let refresh: FeedRefresh
  var body: some View {
    Button {
      if refresh.phase == .error { refresh.refresh() }
    } label: {
      ZStack {
        if refresh.phase == .success {
          Icon("check", size: AppleMetrics.space20)
        } else if refresh.phase == .error {
          Icon("refresh", size: AppleMetrics.space20)
        } else if refresh.phase == .loading {
          TimelineView(.animation(minimumInterval: 1 / 30)) { context in
            Circle().trim(from: 0, to: 0.75)
              .stroke(
                AppleColors.accent,
                style: StrokeStyle(lineWidth: AppleMetrics.selectionLineWidth, lineCap: .round)
              )
              .rotationEffect(
                .degrees(
                  context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1)
                    * 360)
              )
              .padding(AppleMetrics.space8)
          }
        } else {
          Circle().trim(
            from: 0, to: min(1, refresh.distance / AppleMetrics.gestureRefreshDistance)
          )
          .stroke(
            AppleColors.accent,
            style: StrokeStyle(lineWidth: AppleMetrics.selectionLineWidth, lineCap: .round)
          )
          .rotationEffect(.degrees(-90)).padding(AppleMetrics.space8)
        }
      }
      .foregroundStyle(AppleColors.accent)
      .frame(width: AppleMetrics.searchHeight, height: AppleMetrics.searchHeight)
      .desktopGlass(Circle())
      .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
      .contentShape(Circle())
    }
    .buttonStyle(IconPress())
    .allowsHitTesting(refresh.phase == .error)
    .accessibilityLabel(
      Copy.text(
        refresh.phase == .error
          ? "apple.retry"
          : refresh.phase == .success ? "apple.refresh.success" : "apple.refresh.loading")
    )
    .opacity(
      refresh.phase == .idle
        ? 0 : refresh.phase == .pulling ? min(1, refresh.distance / AppleMetrics.space18) : 1
    )
    .animation(refresh.phase == .pulling ? nil : Motion.fast, value: refresh.phase)
    .accessibilityHidden(!refresh.visible)
  }
}
