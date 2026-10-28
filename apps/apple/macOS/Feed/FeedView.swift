import AppKit
import SillKit
import SwiftUI

/// The card area. It observes the feed's entries and the preferences that change every card;
/// each tile observes only its own state.
struct FeedView: View {
  let geometry: ColumnGeometry
  let scroll: FeedScroll
  @State private var mousePull: Bool?
  let topInset: CGFloat
  @Environment(Workspace.self) private var workspace
  @Environment(Feed.self) private var feed
  @Environment(Selection.self) private var selection

  var body: some View {
    let preferences = workspace.preferences
    let context = CardContext(
      now: feed.now, query: feed.query.trimmingCharacters(in: .whitespaces),
      fadeRead: preferences.fadeRead, appearance: preferences.cardAppearance,
      paddingScale: preferences.cardPadding.scale, columnWidth: geometry.columnWidth)
    ScrollView(.vertical) {
      VStack(spacing: 0) {
        Color.clear.frame(height: topInset)
        if feed.empty != .none {
          EmptyFeed(empty: feed.empty)
          if shelf {
            ShelfEntry(count: feed.shelfCount).frame(width: geometry.columnWidth)
          }
        } else {
          MasonryLayout(geometry: geometry) {
            ForEach(Array(feed.entries.enumerated()), id: \.element.id) { index, entry in
              FeedEntryView(entry: entry, context: context)
                .transition(feed.animateChanges ? FeedMotion.arrival : .identity)
                .layoutValue(key: FeedItemID.self, value: entry.measurementID)
                .layoutValue(
                  key: StackSpacing.self, value: entry.isStack ? AppleMetrics.stackLayoutExtra : 0)
            }
            // Web `ShelfView`: one more item after the last page of the desk.
            if shelf { ShelfEntry(count: feed.shelfCount).transition(.opacity) }
          }
          .frame(width: geometry.width)
          .animation(
            feed.animateChanges && !Motion.keyboardDriven ? Motion.layout : nil, value: feed.entries
          )
          .animation(Motion.keyboardDriven ? nil : Motion.layout, value: geometry)
          .transaction { transaction in
            if feed.scrollRequest != nil {
              transaction.animation = nil
              transaction.disablesAnimations = true
            }
          }
          .onAppear { feed.entered = true }
        }
        Color.clear.frame(height: AppleMetrics.feedBottom)
      }
      .frame(maxWidth: .infinity)
      .background {
        // Only empty feed space owns this gesture; cards and controls keep their own input.
        Color.clear.contentShape(Rectangle())
          .gesture(
            DragGesture(minimumDistance: 4, coordinateSpace: .named("card-workspace"))
              .onChanged { value in
                if mousePull == nil {
                  mousePull =
                    scroll.refreshAllowed() && scroll.offset <= 0
                    && value.translation.height > abs(value.translation.width)
                }
                guard mousePull == true else { return }
                guard scroll.refreshAllowed(), scroll.offset <= 0,
                  value.translation.height >= -4,
                  abs(value.translation.width) <= max(12, value.translation.height)
                else {
                  scroll.refresh.release(cancelled: true)
                  mousePull = false
                  return
                }
                scroll.chrome.show()
                scroll.refresh.drag(value.translation.height)
              }
              .onEnded { _ in
                if mousePull == true {
                  scroll.refresh.release(cancelled: !scroll.refreshAllowed())
                }
                mousePull = nil
              }
          )
      }
      .background(
        ScrollProbe(
          scroll: scroll, request: feed.scrollRequest,
          restored: { feed.restoredScroll($0, at: $1) })
      )
      .modifier(FeedPullOffset(refresh: scroll.refresh))
    }
    .scrollIndicators(.hidden)
    .onReceive(NotificationCenter.default.publisher(for: NSWindow.didResignKeyNotification)) { _ in
      if mousePull == true { scroll.refresh.release(cancelled: true) }
      mousePull = nil
    }
  }

  /// Browsing only, after the last page, and only with something on the shelf.
  private var shelf: Bool { !feed.filtering && !feed.hasMore && feed.shelfCount > 0 }
}

/// Feed motion (motion.md): cards that stay move to their new place in `layout` 220ms; new cards
/// drop 10px from above in 220ms; leaving cards stop taking input and fade out where they were
/// in `fast` 140ms while the others close the gap.
@MainActor enum FeedMotion {
  static let arrival = AnyTransition.asymmetric(
    insertion: .opacity.combined(with: .offset(y: -AppleMetrics.motionDetailEnterY)),
    removal: .opacity.animation(Motion.fast))
}

extension FeedEntry {
  var isStack: Bool {
    if case .stack = self { return true }
    return false
  }
}

private struct FeedEntryView: View {
  let entry: FeedEntry
  let context: CardContext
  @Environment(Workspace.self) private var workspace
  @Environment(Feed.self) private var feed
  @Environment(Selection.self) private var selection

  var body: some View {
    switch entry {
    case .card(let id):
      if let card = workspace.model(id) {
        let state = workspace.state(id)
        CardTile(card: card, state: state, context: context, selecting: selection.active)
          .zIndex(state.menuOpen ? 10 : 0)
      }
    case .stack(let key, let ids):
      StackTile(
        key: key, cards: ids.compactMap(workspace.model), position: feed.stackPosition(key))
    case .openStack(let key, let ids):
      OpenStack(key: key, cards: ids.compactMap(workspace.model), context: context)
        .zIndex(ids.contains { workspace.state($0).menuOpen } ? 10 : 0)
    }
  }
}

/// No cards here: the existing empty state, top bar unchanged.
struct EmptyFeed: View {
  let empty: Feed.Empty
  @Environment(Feed.self) private var feed
  var body: some View {
    VStack(spacing: AppleMetrics.space8) {
      Text(title).font(.sans(AppleMetrics.font15)).foregroundStyle(AppleColors.secondary)
      if empty != .clean {
        Button(Copy.text("web.app.657d9cbf45ec")) { feed.clearFilter() }
          .buttonStyle(TextLinkStyle())
      }
    }
    .multilineTextAlignment(.center)
    .padding(.vertical, AppleMetrics.space32)
    .padding(.horizontal, AppleMetrics.space28)
    .frame(maxWidth: AppleMetrics.emptyMaxWidth)
    .padding(.top, AppleMetrics.space64)
  }
  private var title: String {
    switch empty {
    case .noMatch(let query): "\(Copy.text("web.search.noResultsPrefix"))\(query)」"
    case .filtered: Copy.text("web.app.4a684ec67af5")
    default: Copy.text("web.app.a510cac879f0")
    }
  }
}

/// Five or more unread cards from one source within an hour, as one deck. The top card follows
/// the hand; past a third of the width or a quick flick it flies out and the next one shows.
struct StackTile: View {
  let key: String
  let cards: [CardModel]
  let position: StackPosition
  @Environment(\.cardIntents) private var intents
  @State private var dragX: CGFloat = 0
  @State private var hovered = false
  @State private var pressed = false
  @State private var width: CGFloat = 1
  @State private var settling = false
  @State private var settlement = 0
  @State private var axis: Bool?
  @State private var dragOrigin: CGFloat = 0
  @State private var drawn = DrawnValue()
  @State private var wheelIdle: Task<Void, Never>?
  @FocusState private var focused: Bool

  var body: some View {
    let index = min(position.index, cards.count - 1)
    let shape = RoundedRectangle(cornerRadius: AppleMetrics.cardRadius, style: .continuous)
    ZStack {
      ForEach(Array(cards.enumerated()), id: \.element.id) { offset, card in
        if offset == index - 1 && dragX > 0 {
          deckCard(card, offset: offset, shape: shape, lifted: false)
            .offset(x: -width - AppleMetrics.space24 + dragX)
            .zIndex(4)
        } else if offset == index {
          deckCard(card, offset: offset, shape: shape, lifted: hovered || focused)
            .offset(x: dragX < 0 && index + 1 < cards.count ? dragX : 0)
            .zIndex(3)
        } else if offset == index + 1 {
          let reveal = dragX < 0 ? min(1, -dragX / max(1, width)) : 0
          deckCard(card, offset: offset, shape: shape, lifted: false, shadow: false)
            .offset(y: AppleMetrics.motionDeckInset * (1 - reveal))
            .zIndex(2)
        }
      }
    }
    .background(alignment: .bottom) { edges }
    .onGeometryChange(for: CGFloat.self) {
      $0.size.width
    } action: {
      width = $0
    }
    .modifier(TrackDrawnValue(value: dragX, drawn: drawn))
    .scaleEffect(pressed ? AppleMetrics.motionPressScale : 1)
    .animation(Motion.press, value: pressed)
    .zIndex(dragX != 0 || settling ? 20 : 0)
    .contentShape(shape)
    .onHover { inside in
      hovered = inside
      StackWheel.shared.hover(key, inside: inside, scroll: wheel)
    }
    .gesture(deckGesture)
    .onReceive(NotificationCenter.default.publisher(for: NSApplication.didResignActiveNotification))
    { _ in
      guard axis != nil || settling || dragX != 0 else { return }
      interrupt()
      axis = nil
      pressed = false
      dragOrigin = 0
      withAnimation(Motion.deck) { dragX = 0 }
    }
    .focusable()
    .focusEffectDisabled()
    .focused($focused)
    .onKeyPress(.return) {
      intents.openStack(key)
      return .handled
    }
    .onKeyPress(.space) {
      intents.openStack(key)
      return .handled
    }
    .onKeyPress(.leftArrow) {
      settle(-1, keyboard: true)
      return .handled
    }
    .onKeyPress(.rightArrow) {
      settle(1, keyboard: true)
      return .handled
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      "\(cards.first?.sourceName ?? "")：\(cards.count)\(Copy.text("web.templates.50091bfc40b5"))"
    )
    .accessibilityAddTraits(.isButton)
    .accessibilityAction { intents.openStack(key) }
  }

  private func deckCard(
    _ card: CardModel, offset: Int, shape: RoundedRectangle, lifted: Bool, shadow: Bool = true
  ) -> some View {
    BodyStack {
      CardHead(card: card, text: card.sourceName) {
        HStack(spacing: 0) {
          Text("\(offset + 1)").foregroundStyle(AppleColors.primary).fontWeight(.semibold)
          Text("/\(cards.count)").foregroundStyle(AppleColors.secondary)
        }
        .font(.number(AppleMetrics.font13, .medium))
      }
      CardTitle(text: card.title)
      if !card.summary.isEmpty { CardSummary(text: card.summary) }
    }
    .background(shape.fill(AppleColors.card))
    .overlay(
      shape.strokeBorder(
        lifted ? AppleColors.lineHover : AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth)
    )
    .shadow(lifted ? .hover : .card, visible: shadow)
  }

  private var edges: some View {
    let radius = AppleMetrics.deckEdgeRadius
    let shape = UnevenRoundedRectangle(bottomLeadingRadius: radius, bottomTrailingRadius: radius)
    return ZStack(alignment: .bottom) {
      shape.fill(AppleColors.card)
        .overlay(shape.stroke(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth))
        .shadow(.card)
        .opacity(AppleMetrics.deckEdgeDeepOpacity)
        .frame(height: AppleMetrics.deckEdgeHeight)
        .padding(.horizontal, AppleMetrics.deckEdgeDeepInset)
        .offset(y: AppleMetrics.deckEdgeDeepDrop)
      shape.fill(AppleColors.card)
        .overlay(shape.stroke(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth))
        .shadow(.card)
        .frame(height: AppleMetrics.deckEdgeHeight)
        .padding(.horizontal, AppleMetrics.deckEdgeInset)
        .offset(y: AppleMetrics.deckEdgeDrop)
    }
    .accessibilityHidden(true)
  }

  private var deckGesture: some Gesture {
    DragGesture(minimumDistance: 0)
      .onChanged { value in
        let dx = value.translation.width
        let dy = value.translation.height
        if axis == nil {
          guard max(abs(dx), abs(dy)) >= AppleMetrics.space6 else {
            pressed = true
            return
          }
          axis = abs(dx) > abs(dy)
          guard axis == true else {
            pressed = false
            return
          }
          interrupt()
          dragOrigin = dragX - dx
        }
        guard axis == true else { return }
        pressed = false
        // Horizontal only: the hand follows directly, one draw per frame.
        let index = position.index
        let travel = dragOrigin + dx
        dragX = travel < 0 ? (index + 1 < cards.count ? travel : 0) : (index > 0 ? travel : 0)
      }
      .onEnded { value in
        defer {
          pressed = false
          axis = nil
          dragOrigin = 0
        }
        guard axis != false else { return }
        if dragX == 0 {
          if max(abs(value.translation.width), abs(value.translation.height)) < AppleMetrics.space6
          {
            intents.openStack(key)
          }
          return
        }
        let speed = abs(value.velocity.width) / 1000
        let go =
          abs(dragX) > width * AppleMetrics.motionDeckTravel
          || (speed > AppleMetrics.motionDeckSpeed && abs(dragX) > AppleMetrics.motionDeckMinFlick)
        settle(go ? (dragX < 0 ? 1 : -1) : 0)
      }
  }

  /// Web trackpad deck: a sideways swipe drags the top card; past 35% of the width it goes to
  /// the next card, and a hand that stops for 140ms short of that lets the card settle back.
  /// Coasting after the hand lifts does nothing.
  private func wheel(_ delta: CGFloat) {
    if settling { interrupt() }
    wheelIdle?.cancel()
    let index = position.index
    let next = max(-width, min(width, dragX + delta))
    dragX = next < 0 ? (index + 1 < cards.count ? next : 0) : (index > 0 ? next : 0)
    if abs(dragX) > width * AppleMetrics.motionDeckWheelTravel {
      settle(dragX < 0 ? 1 : -1)
      return
    }
    wheelIdle = Task {
      try? await Task.sleep(for: .seconds(AppleMetrics.motionDeckWheelIdle))
      guard !Task.isCancelled, !settling, dragX != 0 else { return }
      settle(0)
    }
  }

  /// 260ms settle without bounce; at either end the card stays.
  private func interrupt() {
    settlement += 1
    wheelIdle?.cancel()
    Motion.instantly { dragX = drawn.value }
    settling = false
  }

  private func settle(_ direction: Int, keyboard: Bool = false) {
    settlement += 1
    let generation = settlement
    wheelIdle?.cancel()
    let target = position.index + direction
    guard direction == 0 || cards.indices.contains(target) else {
      withAnimation(Motion.deck) { dragX = 0 }
      return
    }
    if keyboard {
      Motion.instantly {
        position.index = target
        dragX = 0
      }
      settling = false
      return
    }
    settling = true
    let exit: CGFloat =
      direction == 1
      ? -width * AppleMetrics.motionDeckExitTravel
      : direction == -1 ? width + AppleMetrics.space24 : 0
    withAnimation(Motion.deck, completionCriteria: .logicallyComplete) {
      dragX = exit
    } completion: {
      guard generation == settlement else { return }
      Motion.instantly {
        if direction != 0 { position.index = target }
        dragX = 0
      }
      settling = false
    }
  }
}

/// An opened stack: a head with the source and a close link, then each card compact.
struct OpenStack: View {
  let key: String
  let cards: [CardModel]
  let context: CardContext
  @Environment(Workspace.self) private var workspace
  @Environment(Selection.self) private var selection
  @Environment(\.cardIntents) private var intents
  var body: some View {
    var compact = context
    compact.compact = true
    return VStack(spacing: AppleMetrics.space10) {
      HStack(spacing: AppleMetrics.space6) {
        if let first = cards.first {
          Icon(SourceKind.icon(first.sourceKind) ?? "rss", size: AppleMetrics.font15)
            .foregroundStyle(AppleColors.iconSecondary)
          Text("\(first.sourceName) · ") + Text("\(cards.count)").font(.number(AppleMetrics.font13))
        }
        Spacer(minLength: 0)
        Button(Copy.text("web.templates.afd4b783536b")) { intents.closeStack(key) }
          .buttonStyle(TextLinkStyle())
      }
      .font(.sans(AppleMetrics.font13))
      .foregroundStyle(AppleColors.secondary)
      .frame(minHeight: AppleMetrics.stackOpenHeadHeight)
      .padding(.horizontal, AppleMetrics.space4)
      ForEach(cards) { card in
        let state = workspace.state(card.id)
        CardTile(card: card, state: state, context: compact, selecting: selection.active)
          .zIndex(state.menuOpen ? 10 : 0)
      }
    }
  }
}

/// Sideways scrolling goes to the stack under the pointer. One window-level monitor for every
/// stack; vertical scrolling and momentum pass through to the feed.
@MainActor final class StackWheel {
  static let shared = StackWheel()
  private var hovered: (key: String, scroll: (CGFloat) -> Void)?
  private var monitor: Any?

  func hover(_ key: String, inside: Bool, scroll: @escaping (CGFloat) -> Void) {
    if inside {
      hovered = (key, scroll)
    } else if hovered?.key == key {
      hovered = nil
    }
    install()
  }

  private func install() {
    guard monitor == nil else { return }
    monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { event in
      let dx = event.scrollingDeltaX
      let dy = event.scrollingDeltaY
      let coasting = !event.momentumPhase.isEmpty
      let precise = event.hasPreciseScrollingDeltas
      guard abs(dx) > abs(dy) else { return event }
      let handled = MainActor.assumeIsolated {
        guard let stack = StackWheel.shared.hovered, PointerRouter.shared.enabled else {
          return false
        }
        if !coasting { stack.scroll(precise ? dx : dx * AppleMetrics.wheelLineHeight) }
        return true
      }
      return handled ? nil : event
    }
  }
}
