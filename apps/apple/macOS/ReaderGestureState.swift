import Observation
import SillKit
import SwiftUI

@MainActor @Observable final class ReaderGestureState {
  var distance: CGFloat = 0
  var offset: CGFloat = 0
  var offsetX: CGFloat = 0
  var reached = false
  var submitted = false
  var confirmed = false
  var failed = false
  @ObservationIgnored var renderedOffset: CGFloat = 0
  @ObservationIgnored var renderedX: CGFloat = 0
  @ObservationIgnored var horizontalOrigin: CGFloat = 0
  @ObservationIgnored var dragOrigin: CGFloat?
  @ObservationIgnored var lastVelocity: CGFloat = 0

  func reach(_ distance: CGFloat) -> Bool {
    guard !reached, distance >= AppleMetrics.gestureFinishDistance else { return false }
    reached = true
    self.distance = AppleMetrics.gestureFinishDistance
    return true
  }
}

struct ReaderFinishIndicator: View {
  let gesture: ReaderGestureState
  var body: some View {
    ZStack {
      Circle().fill(gesture.confirmed ? AppleColors.accentFill : AppleColors.card)
        .modifier(NativeShadow(kind: .floating))
      if gesture.confirmed {
        NativeIcon(name: "check", size: AppleMetrics.space24).foregroundStyle(
          AppleColors.fixedWhite)
      } else {
        Circle().trim(from: 0, to: min(1, gesture.distance / AppleMetrics.gestureFinishDistance))
          .stroke(
            AppleColors.accent,
            style: StrokeStyle(lineWidth: AppleMetrics.selectionLineWidth, lineCap: .round)
          )
          .rotationEffect(.degrees(-90)).padding(AppleMetrics.space10)
      }
    }.frame(width: AppleMetrics.space40, height: AppleMetrics.space40)
      .opacity(
        gesture.distance <= 0 ? 0 : min(1, gesture.distance / AppleMetrics.gestureFinishReveal)
      )
      .allowsHitTesting(false).accessibilityHidden(true)
  }
}

struct ReaderChrome: ViewModifier {
  let hidden: Bool
  var top = false
  func body(content: Content) -> some View {
    content.opacity(hidden ? 0 : 1)
      .offset(y: hidden ? (top ? -AppleMetrics.space12 : AppleMetrics.motionRailTravel) : 0)
      .animation(
        NativeMotion.sheet(hidden ? AppleMetrics.motionRailHide : AppleMetrics.motionRailShow),
        value: hidden
      )
      .allowsHitTesting(!hidden).accessibilityHidden(hidden)
      .disabled(hidden)
  }
}

extension CardReader {
  func handleReaderEdge(_ sample: EdgeGestureSample, card: Card) -> Bool {
    guard model.selected == card.id else { return false }
    guard !gesture.reached else { return true }
    switch sample.phase {
    case .changed:
      gesture.lastVelocity = sample.velocity
      if gesture.dragOrigin == nil {
        gesture.dragOrigin = gesture.renderedOffset
        gesture.horizontalOrigin = gesture.renderedX
      }
      if sample.edge == "right" {
        gesture.offsetX = gesture.horizontalOrigin + sample.distance
      } else if sample.edge == "bottom", card.readable,
        model.preferences["collapseOnFinish"]?.bool != false
      {
        gesture.distance = min(sample.distance, AppleMetrics.gestureFinishDistance)
        gesture.offset = -gesture.distance * AppleMetrics.gestureFinishTravel
        if gesture.reach(sample.distance) {
          model.deferredReadAppearance.insert(card.id)
          submitFinish(card)
          return true
        }
      } else if sample.edge == "top" {
        gesture.offset = (gesture.dragOrigin ?? 0) + sample.distance
      } else {
        withAnimation(NativeMotion.sheet(AppleMetrics.motionSheet)) {
          gesture.offset =
            -AppleMetrics.gestureEdgeLimit * sample.distance
            / (sample.distance + AppleMetrics.gestureEdgeLimit)
        }
      }
    case .cancelled: cancelReaderGesture()
    case .released:
      let dismiss =
        (sample.edge == "top" || sample.edge == "right")
        && (sample.distance
          >= (sample.edge == "right"
            ? availableSize.width * AppleMetrics.motionDeckTravel
            : AppleMetrics.gestureDismissDistance)
          || sample.distance > AppleMetrics.gestureFlickDistance
            && gesture.lastVelocity > AppleMetrics.gestureFlickSpeed)
      if dismiss {
        model.dismissReader()
        return true
      }
      cancelReaderGesture()
    }
    return false
  }
  func cancelReaderGesture() {
    guard !gesture.reached else { return }
    let velocity = gesture.offset == 0 ? 0 : -gesture.lastVelocity * 1000 / gesture.offset
    gesture.dragOrigin = nil
    withAnimation(NativeMotion.spring(velocity: velocity)) {
      gesture.offset = 0
      gesture.offsetX = 0
      gesture.distance = 0
    }
    revealReaderTools()
  }
  func submitFinish(_ card: Card) {
    guard gesture.reached, !gesture.submitted, !model.busy, model.ready else { return }
    gesture.submitted = true
    let generation = model.readerGeneration
    let finish: (Bool) -> Void = { success in
      guard model.readerGeneration == generation, model.selected == card.id else {
        model.deferredReadAppearance.remove(card.id)
        return
      }
      guard success else {
        gesture.failed = true
        model.deferredReadAppearance.remove(card.id)
        return
      }
      gesture.confirmed = true
      finishTask = Task {
        do { try await Task.sleep(for: .seconds(AppleMetrics.gestureFinishHold)) } catch { return }
        model.deferredReadAppearance.remove(card.id)
        guard model.readerGeneration == generation, model.selected == card.id else { return }
        model.dismissReader()
      }
    }
    if model.items[card.id]?["read"]?.bool == true {
      finish(true)
    } else {
      model.patch(
        [card.id],
        values: [
          "read": .bool(true), "progress": .number(1),
          "readAt": .number(Date.now.timeIntervalSince1970 * 1000),
        ], completion: finish)
    }
  }
  func updateReaderChrome(offset: CGFloat, bottom: Bool) {
    if scrolled != (offset > 0) { scrolled = offset > 0 }
    let delta = offset - chrome.lastOffset
    chrome.lastOffset = offset
    chrome.revealTask?.cancel()
    if bottom || offset <= AppleMetrics.space24 {
      revealReaderTools()
      return
    }
    if delta > 0 {
      chrome.downward += delta
      chrome.upward = 0
      if chrome.downward >= AppleMetrics.chromeHideTravel { toolsHidden = true }
    } else if delta < 0 {
      chrome.upward -= delta
      chrome.downward = 0
      if chrome.upward >= AppleMetrics.chromeShowTravel { revealReaderTools() }
    }
    if toolsHidden {
      chrome.revealTask = Task {
        do { try await Task.sleep(for: .seconds(AppleMetrics.chromeRest)) } catch { return }
        revealReaderTools()
      }
    }
  }
  func revealReaderTools() {
    toolsHidden = false
    chrome.downward = 0
    chrome.upward = 0
    chrome.revealTask?.cancel()
  }
}
