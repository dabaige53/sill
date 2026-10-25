#if os(iOS)
  import SillKit
  import SwiftUI

  /// Neighbor cards slide horizontally; the first and last card never bend or overscroll.
  struct MobileStack: View {
    let workspace: MobileWorkspace
    let entry: MobileFeedState.Entry
    @Binding var position: Int
    @Binding var selected: Set<String>
    let open: (String) -> Void
    let expand: () -> Void
    @State private var translation: CGFloat = 0
    @State private var width: CGFloat = 1
    @State private var horizontal = false
    @State private var settling = false
    @State private var suppressUntil = Date.distantPast
    @State private var settleTask: Task<Void, Never>?
    @State private var samples: [(Date, CGFloat)] = []
    @GestureState private var touching = false

    private var index: Int { min(max(0, position), max(0, entry.cards.count - 1)) }
    private var current: MobileCard? { card(index) }
    private var next: MobileCard? { card(index + 1) }
    private var previous: MobileCard? { card(index - 1) }

    var body: some View {
      Group {
        if let current {
          ZStack(alignment: .bottom) {
            edge(deep: true)
            edge(deep: false)
            tile(current, interactive: true)
              .offset(x: translation < 0 && next != nil ? translation : 0)
              .background(alignment: .top) {
                if let next {
                  tile(next, interactive: false)
                    .offset(
                      y: AppleMetrics.motionDeckInset * (1 - min(1, -min(0, translation) / width)))
                }
              }
              .overlay(alignment: .top) {
                if let previous, translation > 0 {
                  tile(previous, interactive: false)
                    .offset(x: -width - AppleMetrics.space24 + translation)
                }
              }
          }
          .background(
            GeometryReader { geometry in
              Color.clear.onAppear { width = geometry.size.width }
                .onChange(of: geometry.size.width) { _, value in width = value }
            }
          )
          .simultaneousGesture(drag)
          .simultaneousGesture(
            LongPressGesture(minimumDuration: AppleMetrics.holdToSelect).onEnded { _ in
              guard !horizontal else { return }
              suppressUntil = .now.addingTimeInterval(AppleMetrics.holdToSelect)
              select(current.id)
            }
          )
          .padding(.bottom, AppleMetrics.stackLayoutExtra)
          .onChange(of: touching) { _, touching in
            if !touching && horizontal && !settling { settle(0) }
          }
          .onDisappear {
            settleTask?.cancel()
            translation = 0
            horizontal = false
          }
        }
      }
    }

    private var drag: some Gesture {
      DragGesture(minimumDistance: AppleMetrics.motionDeckGestureStart)
        .updating($touching) { _, touching, _ in touching = true }
        .onChanged { value in
          let x = value.translation.width
          let y = value.translation.height
          guard horizontal || abs(x) > abs(y) * AppleMetrics.mobileGestureDirectionRatio else {
            return
          }
          if !horizontal {
            settleTask?.cancel()
            settling = false
            horizontal = true
            samples = []
          }
          samples.append((value.time, x))
          samples.removeAll {
            value.time.timeIntervalSince($0.0) > AppleMetrics.gestureVelocityWindow
          }
          translation = (x < 0 && next != nil) || (x > 0 && previous != nil) ? x : 0
        }
        .onEnded { value in
          guard horizontal else { return }
          let x = value.translation.width
          let first = samples.first
          let elapsed = first.map { value.time.timeIntervalSince($0.0) } ?? 0
          let speed =
            elapsed > 0 && elapsed <= AppleMetrics.gestureVelocityWindow
            ? abs(x - (first?.1 ?? x)) / elapsed / 1000 : 0
          let crossed =
            abs(x) > width * AppleMetrics.motionDeckTravel
            || (abs(x) > AppleMetrics.motionDeckMinFlick && speed > AppleMetrics.motionDeckSpeed)
          let direction = crossed ? (x < 0 ? 1 : -1) : 0
          settle(direction)
        }
    }

    private func tile(_ card: MobileCard, interactive: Bool) -> some View {
      MobileCardTile(
        workspace: workspace, card: card, selected: selected.contains(card.id),
        onSelect: { select(card.id) }, stackLabel: "\(index + 1) / \(entry.cards.count)",
        onExpand: expand, openRelated: open
      ) {
        guard !horizontal, !settling, suppressUntil <= .now else { return }
        if selected.isEmpty { open(card.id) } else { select(card.id) }
      }
      .allowsHitTesting(interactive)
      .accessibilityHidden(!interactive)
    }

    private func edge(deep: Bool) -> some View {
      RoundedRectangle(cornerRadius: AppleMetrics.deckEdgeRadius)
        .fill(AppleColors.card)
        .overlay(
          RoundedRectangle(cornerRadius: AppleMetrics.deckEdgeRadius)
            .strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth)
        )
        .frame(height: AppleMetrics.deckEdgeHeight)
        .padding(.horizontal, deep ? AppleMetrics.deckEdgeDeepInset : AppleMetrics.deckEdgeInset)
        .offset(y: deep ? AppleMetrics.deckEdgeDeepDrop : AppleMetrics.deckEdgeDrop)
        .opacity(deep ? AppleMetrics.deckEdgeDeepOpacity : 1)
        .accessibilityHidden(true)
    }

    private func card(_ index: Int) -> MobileCard? {
      guard entry.cards.indices.contains(index) else { return nil }
      return workspace.card(entry.cards[index])
    }
    private func select(_ id: String) {
      if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
    }
    private func settle(_ requested: Int) {
      let direction =
        requested == 1 && next == nil || requested == -1 && previous == nil ? 0 : requested
      settling = true
      suppressUntil = .now.addingTimeInterval(
        AppleMetrics.motionDeckDuration + AppleMetrics.motionPress)
      withAnimation(MobileMotion.stack) {
        translation =
          direction == 1
          ? -width * AppleMetrics.motionDeckExitTravel
          : direction == -1 ? width + AppleMetrics.space24 : 0
      }
      settleTask?.cancel()
      settleTask = Task {
        do { try await Task.sleep(for: .seconds(AppleMetrics.motionDeckDuration)) } catch { return }
        MobileMotion.instantly {
          position = index + direction
          translation = 0
          horizontal = false
          settling = false
        }
      }
    }
  }
#endif
