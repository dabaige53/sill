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
  @ObservationIgnored private var rawDistance: CGFloat = 0
  @ObservationIgnored let drawn = DrawnValue()
  @ObservationIgnored private var dragBase: CGFloat?
  @ObservationIgnored private var wheelPeak: CGFloat = 0
  @ObservationIgnored private var wheelPrevious: CGFloat = 0
  @ObservationIgnored private var wheelDecay = 0
  @ObservationIgnored private var samples: [(TimeInterval, CGFloat)] = []

  static func resisted(_ travel: CGFloat) -> CGFloat {
    let dimension = AppleMetrics.refreshRubberDimension
    return dimension * (1 - 1 / (max(0, travel) * AppleMetrics.refreshRubber / dimension + 1))
  }

  private static func settle(velocity: Double = 0) -> Animation {
    .interpolatingSpring(
      mass: AppleMetrics.refreshSpringMass,
      stiffness: AppleMetrics.refreshSpringStiffness, damping: AppleMetrics.refreshSpringDamping,
      initialVelocity: velocity)
  }

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
    guard phase == .pulling || (atTop && delta > 0 && phase != .loading) else { return false }
    let starting = phase != .pulling
    if input == .discrete {
      if starting {
        wheelPeak = delta
        wheelPrevious = delta
        wheelDecay = 0
      } else {
        wheelDecay = delta > 0 && delta < wheelPrevious ? wheelDecay + 1 : 0
        wheelPrevious = delta
        wheelPeak = max(wheelPeak, delta)
        if wheelDecay >= 3 && delta <= wheelPeak * 0.5 {
          release()
          return true
        }
      }
    }
    pull(starting ? 0 : delta, discrete: input == .discrete)
    return true
  }

  func pull(_ delta: CGFloat, discrete: Bool = true) {
    guard phase != .loading else { return }
    if phase != .pulling { beginPull() }
    Motion.instantly {
      phase = .pulling
      rawDistance = max(0, rawDistance + delta)
      distance = Self.resisted(rawDistance)
    }
    sample()
    rest?.cancel()
    guard discrete else { return }
    rest = Task { [weak self] in
      do { try await Task.sleep(for: .seconds(AppleMetrics.refreshWheelRest)) } catch { return }
      self?.release()
    }
  }

  /// Absolute mouse travel: preview immediately, never schedule a timeout to commit it.
  func drag(_ travel: CGFloat) {
    guard phase != .loading else { return }
    if phase != .pulling { beginPull() }
    rest?.cancel()
    if dragBase == nil { dragBase = rawDistance - max(0, travel) }
    Motion.instantly {
      phase = .pulling
      rawDistance = max(0, (dragBase ?? 0) + travel)
      distance = Self.resisted(rawDistance)
    }
    sample()
  }

  func release(cancelled: Bool = false) {
    rest?.cancel()
    guard phase == .pulling else { return }
    dragBase = nil
    if !cancelled && distance >= AppleMetrics.gestureRefreshDistance {
      refresh(fromPull: true)
    } else {
      withAnimation(Self.settle(velocity: releaseVelocity)) {
        distance = 0
        rawDistance = 0
        phase = .idle
      }
    }
  }

  func refresh(fromPull: Bool = false) {
    guard phase != .loading else { return }
    generation += 1
    let token = generation
    let start = ProcessInfo.processInfo.systemUptime
    withAnimation(Self.settle(velocity: releaseVelocity)) {
      distance = 0
      rawDistance = 0
      phase = .loading
    }
    request { [weak self] success in
      guard let self, self.generation == token, self.phase == .loading else { return }
      self.feedback = Task { [weak self] in
        let remaining = max(
          0,
          success ? AppleMetrics.loadingDelay - (ProcessInfo.processInfo.systemUptime - start) : 0)
        do { try await Task.sleep(for: .seconds(remaining)) } catch { return }
        guard let self, self.generation == token else { return }
        withAnimation(Motion.fast) { self.phase = success ? .success : .error }
        withAnimation(Self.settle(velocity: self.releaseVelocity)) { self.distance = 0 }
        if !success { return }
        do { try await Task.sleep(for: .seconds(AppleMetrics.gestureRefreshSuccessHold)) } catch {
          return
        }
        guard self.generation == token else { return }
        withAnimation(Motion.fast) {
          self.distance = 0
          self.phase = .idle
        }
      }
    }
  }

  private func beginPull() {
    generation += 1
    feedback?.cancel()
    let visible = max(0, min(AppleMetrics.refreshRubberDimension - 0.1, drawn.value))
    rawDistance =
      visible * AppleMetrics.refreshRubberDimension
      / (AppleMetrics.refreshRubber * (AppleMetrics.refreshRubberDimension - visible))
    samples = []
    dragBase = nil
  }

  private func sample() {
    let now = ProcessInfo.processInfo.systemUptime
    samples.append((now, distance))
    samples.removeAll { now - $0.0 > AppleMetrics.gestureVelocityWindow }
  }

  private var releaseVelocity: Double {
    guard let first = samples.first, let last = samples.last, last.0 > first.0, distance > 0 else {
      return 0
    }
    let speed = min(60, Double(last.1 - first.1) / (last.0 - first.0))
    return -speed / Double(distance)
  }

  func cancel() {
    generation += 1
    rest?.cancel()
    feedback?.cancel()
    dragBase = nil
    withAnimation(Self.settle(velocity: releaseVelocity)) {
      distance = 0
      rawDistance = 0
      phase = .idle
    }
  }
}

struct FeedPullOffset: ViewModifier {
  let refresh: FeedRefresh
  func body(content: Content) -> some View {
    content.offset(y: refresh.offset).modifier(
      TrackDrawnValue(value: refresh.distance, drawn: refresh.drawn))
  }
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
                  context.date.timeIntervalSinceReferenceDate.truncatingRemainder(
                    dividingBy: AppleMetrics.refreshSpinnerPeriod)
                    * 360 / AppleMetrics.refreshSpinnerPeriod)
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
