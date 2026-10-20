import SillKit
import SwiftUI

/// The card area. It observes the feed's entries and the preferences that change every card;
/// each tile observes only its own state.
struct FeedView: View {
  let geometry: ColumnGeometry
  let scroll: FeedScroll
  let topInset: CGFloat
  @Environment(Workspace.self) private var workspace
  @Environment(Feed.self) private var feed
  @Environment(Selection.self) private var selection

  var body: some View {
    let preferences = workspace.preferences
    let context = CardContext(
      now: feed.now, query: feed.query.trimmingCharacters(in: .whitespaces),
      fadeRead: preferences.fadeRead, summaryLines: preferences.summaryLines)
    ScrollView(.vertical) {
      VStack(spacing: 0) {
        Color.clear.frame(height: topInset)
        if feed.empty != .none {
          EmptyFeed(empty: feed.empty)
          if shelf {
            ShelfEntry(count: feed.shelfCount).frame(width: geometry.columnWidth)
          }
        } else {
          let entering = !feed.entered
          MasonryLayout(geometry: geometry) {
            ForEach(Array(feed.entries.enumerated()), id: \.element.id) { index, entry in
              FeedEntryView(entry: entry, context: context)
                .modifier(Entrance(delay: entering ? Entrance.delay(index) : nil))
                .transition(FeedMotion.arrival)
                .layoutValue(
                  key: StackSpacing.self, value: entry.isStack ? AppleMetrics.stackLayoutExtra : 0)
            }
            // Web `ShelfView`: one more item after the last page of the desk.
            if shelf { ShelfEntry(count: feed.shelfCount).transition(.opacity) }
          }
          .frame(width: geometry.width)
          .animation(Motion.layout, value: feed.entries)
          .onAppear { feed.entered = true }
        }
        Color.clear.frame(height: AppleMetrics.feedBottom)
      }
      .frame(maxWidth: .infinity)
      .background(ScrollProbe(scroll: scroll))
    }
    .scrollIndicators(.hidden)
    .environment(\.relatedCards, { [workspace] id in workspace.model(id) })
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

/// Only the first screen enters: 10px up and in over 220ms, the first ten 30ms apart.
struct Entrance: ViewModifier {
  let delay: Double?
  @State private var shown: Bool

  init(delay: Double?) {
    self.delay = delay
    _shown = State(initialValue: delay == nil)
  }

  static func delay(_ index: Int) -> Double {
    index < Int(AppleMetrics.motionFirstCount) ? Double(index) * AppleMetrics.motionStagger : 0
  }

  func body(content: Content) -> some View {
    content
      .opacity(shown ? 1 : 0)
      .offset(y: shown ? 0 : AppleMetrics.motionDetailEnterY)
      .onAppear {
        guard !shown, let delay else { return }
        withAnimation(Motion.open.delay(delay)) { shown = true }
      }
  }
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
    .background(GeometryReader { proxy in Color.clear.onAppear { width = proxy.size.width } })
    .scaleEffect(pressed ? AppleMetrics.motionPressScale : 1)
    .animation(Motion.press, value: pressed)
    .zIndex(dragX != 0 || settling ? 20 : 0)
    .contentShape(shape)
    .onHover { hovered = $0 }
    .gesture(deckGesture)
    .focusable()
    .focusEffectDisabled()
    .focused($focused)
    .onKeyPress(.return) {
      intents.openStack(key)
      return .handled
    }
    .onKeyPress(.leftArrow) {
      settle(-1)
      return .handled
    }
    .onKeyPress(.rightArrow) {
      settle(1)
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
      CardTitle(text: card.title).afterHead()
      if !card.summary.isEmpty { CardSummary(text: card.summary, lines: 2).afterTitle() }
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
        if dragX == 0 && !pressed && abs(dx) < AppleMetrics.space6 && abs(dy) < AppleMetrics.space6
        {
          pressed = true
          return
        }
        guard abs(dx) >= AppleMetrics.space6 || dragX != 0 else { return }
        pressed = false
        // Horizontal only: the hand follows directly, one draw per frame.
        let index = position.index
        dragX = dx < 0 ? (index + 1 < cards.count ? dx : 0) : (index > 0 ? dx : 0)
      }
      .onEnded { value in
        defer { pressed = false }
        if dragX == 0 {
          if abs(value.translation.width) < AppleMetrics.space6 {
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

  /// 260ms settle without bounce; at either end the card stays.
  private func settle(_ direction: Int) {
    let target = position.index + direction
    guard direction == 0 || cards.indices.contains(target) else {
      withAnimation(Motion.deck) { dragX = 0 }
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
