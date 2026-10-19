import SillKit
import SwiftUI

struct NativeStack: View {
  let cards: [Card]
  let expanded: Bool
  let toggle: () -> Void
  let open: (Card) -> Void
  @EnvironmentObject private var model: Workspace
  @Environment(\.controlActiveState) private var windowActivity
  @State private var selection = DeckSelection()
  @State private var width: CGFloat = 1
  @State private var offset: CGFloat = 0
  @State private var presentationOffset: CGFloat = 0
  @State private var dragOrigin: CGFloat = 0
  @State private var entering = false
  @State private var sample: (time: Date, x: CGFloat)?
  @State private var velocity: CGFloat = 0
  @State private var generation = 0
  @GestureState private var dragging = false
  private var currentIndex: Int { min(max(0, selection.index), max(0, cards.count - 1)) }
  var body: some View {
    if expanded {
      VStack(spacing: AppleMetrics.space12) {
        HStack(spacing: AppleMetrics.space8) {
          if let card = cards.first { CardSourceGlyph(card: card) }
          Text(cards.first?.source ?? "").lineLimit(1)
          Text("· \(cards.count)").monospacedDigit()
          Spacer()
          Button(Copy.text("web.templates.afd4b783536b"), action: toggle).buttonStyle(.plain)
        }.font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
        ForEach(cards) { card in CardTile(card: card, compact: true, open: { open(card) }) }
      }
    } else if !cards.isEmpty {
      stackFace(cards[currentIndex])
        .opacity(entering ? 0 : 1)
        .modifier(
          DeckPosition(x: offset) { value in
            presentationOffset = value
          }
        )
        .background {
          let neighbor = currentIndex + (offset > 0 ? -1 : 1)
          if cards.indices.contains(neighbor) {
            stackFace(cards[neighbor])
              .scaleEffect(AppleMetrics.motionDeckScale)
              .offset(y: AppleMetrics.motionDeckInset)
              .allowsHitTesting(false).accessibilityHidden(true)
          }
        }
        .background(
          GeometryReader { geometry in
            Color.clear.onAppear { width = max(1, geometry.size.width) }
              .onChange(of: geometry.size.width) { _, value in width = max(1, value) }
          }
        )
        .padding(.bottom, AppleMetrics.motionDeckInset)
        .simultaneousGesture(
          DragGesture(minimumDistance: AppleMetrics.motionDeckGestureStart)
            .updating($dragging) { _, state, _ in state = true }
            .onChanged { value in
              guard abs(value.translation.width) > abs(value.translation.height) else { return }
              if sample == nil {
                let confirmed = selection.pendingTarget != nil
                if confirmed { settleConfirmedSelection() }
                dragOrigin = confirmed ? 0 : presentationOffset
                velocity = 0
              }
              generation += 1
              let x = value.translation.width
              if let sample {
                let elapsed = value.time.timeIntervalSince(sample.time) * 1000
                if elapsed > 0 { velocity = (x - sample.x) / elapsed }
              }
              sample = (value.time, x)
              let next = currentIndex + (x < 0 ? 1 : -1)
              var transaction = Transaction()
              transaction.disablesAnimations = true
              withTransaction(transaction) {
                offset =
                  dragOrigin + x
                  * (cards.indices.contains(next) ? 1 : AppleMetrics.motionDeckResistance)
              }
            }
            .onEnded { value in
              guard abs(value.translation.width) > abs(value.translation.height) else {
                resetDrag()
                return
              }
              if let sample, value.time.timeIntervalSince(sample.time) > 0.1 { velocity = 0 }
              let target = DeckNavigation.target(
                index: currentIndex, count: cards.count,
                translation: value.translation.width, velocity: velocity, width: width)
              sample = nil
              guard target != currentIndex else {
                resetDrag()
                return
              }
              selection.confirm(target)
              generation += 1
              let completionGeneration = generation
              let destination =
                (target > currentIndex ? -1.0 : 1.0) * width * AppleMetrics.motionDeckExitTravel
              withAnimation(
                .timingCurve(0.23, 1, 0.32, 1, duration: AppleMetrics.motionDeckDuration),
                completionCriteria: .removed
              ) {
                offset = destination
              } completion: {
                guard generation == completionGeneration else { return }
                var transaction = Transaction()
                transaction.disablesAnimations = true
                withTransaction(transaction) {
                  selection.settle(count: cards.count)
                  offset = 0
                }
              }
            }
        )
        .onChange(of: dragging) { _, active in
          if !active && sample != nil { resetDrag() }
        }
        .onChange(of: windowActivity) { _, activity in
          if activity == .inactive { resetDrag() }
        }
        .onChange(of: cards.map(\.id)) { _, _ in
          selection.settle(count: cards.count)
          resetDrag()
        }
        .focusable()
        .onKeyPress(keys: [.return, .space, .leftArrow, .rightArrow]) { press in
          if press.key == .return || press.key == .space {
            resetDrag()
            toggle()
          } else {
            generation += 1
            sample = nil
            entering = false
            offset = 0
            selection.step(press.key == .rightArrow ? 1 : -1, count: cards.count)
          }
          return .handled
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
          (cards.first?.source ?? "") + "：\(cards.count)" + Copy.text("web.templates.50091bfc40b5"))
    }
  }

  private func stackFace(_ card: Card) -> some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space8) {
      HStack {
        CardSourceGlyph(card: card)
        Text(card.source).lineLimit(1)
        Spacer()
        Text("\(currentIndex + 1)/\(cards.count)").monospacedDigit()
      }.font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      Button(action: toggle) {
        Text(card.title).font(
          .system(size: AppleMetrics.font17, weight: .semibold)
        ).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
      }.buttonStyle(.plain)
      if !card.summary.isEmpty {
        Text(card.summary).font(.system(size: AppleMetrics.font15))
          .foregroundStyle(AppleColors.secondary).lineLimit(2)
      }
    }.padding(AppleMetrics.cardPadding).frame(maxWidth: .infinity, alignment: .leading)
      .background(AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.cardRadius))

  }

  private func settleConfirmedSelection() {
    var transaction = Transaction()
    transaction.disablesAnimations = true
    withTransaction(transaction) {
      selection.settle(count: cards.count)
      offset = 0
      presentationOffset = 0
      entering = false
    }
  }

  private func resetDrag() {
    generation += 1
    let confirmed = selection.pendingTarget != nil
    if confirmed { settleConfirmedSelection() }
    sample = nil
    velocity = 0
    entering = false
    guard !confirmed else { return }
    withAnimation(
      .timingCurve(0.23, 1, 0.32, 1, duration: AppleMetrics.motionDeckDuration)
    ) {
      offset = 0
    }
  }
}

/// A released gesture is a confirmed choice even if its exit animation is interrupted.
struct DeckSelection {
  private(set) var index = 0
  private(set) var pendingTarget: Int?

  mutating func confirm(_ target: Int) { pendingTarget = target }

  mutating func settle(count: Int) {
    index = min(max(0, pendingTarget ?? index), max(0, count - 1))
    pendingTarget = nil
  }

  mutating func step(_ direction: Int, count: Int) {
    settle(count: count)
    index = min(max(0, index + direction), max(0, count - 1))
  }
}

struct DeckNavigation {
  static func target(
    index: Int, count: Int, translation: CGFloat, velocity: CGFloat, width: CGFloat
  ) -> Int {
    guard count > 0 else { return 0 }
    let current = min(max(0, index), count - 1)
    let far = abs(translation) > width * AppleMetrics.motionDeckTravel
    let flick =
      abs(translation) > AppleMetrics.motionDeckMinFlick
      && abs(velocity) > AppleMetrics.motionDeckSpeed && translation * velocity > 0
    guard far || flick else { return current }
    return min(max(0, current + (translation < 0 ? 1 : -1)), count - 1)
  }
}

/// Reports the actual rendered position so a new gesture can take over a running transition.
private struct DeckPosition: AnimatableModifier {
  nonisolated var x: CGFloat
  let update: (CGFloat) -> Void
  nonisolated var animatableData: CGFloat {
    get { x }
    set { x = newValue }
  }
  func body(content: Content) -> some View {
    let position = x
    return content.offset(x: position)
      .onChange(of: position) { _, value in update(value) }
  }
}
