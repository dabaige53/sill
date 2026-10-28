import SillKit
import SwiftUI

/// Web `.card-more-menu`, solid card color with a line and the glass shadow. A right-click
/// opens it at the pointer, toward the lower right; near the window's right edge it opens to the
/// left, and near the bottom (or the AI box) it opens upward. Without a pointer (VoiceOver) it
/// sits under the card's top-right corner as on Web. It grows from the corner at the pointer:
/// 4px and 95% to full in 180ms, back in 140ms.
struct CardMenuLayer: View {
  let card: CardModel
  let state: CardState
  var sourceFrame: CGRect?
  @Environment(\.cardIntents) private var intents
  @Environment(CardMenu.self) private var menu
  @Environment(CardDrag.self) private var drag
  @Environment(Selection.self) private var selection
  @State private var size: CGSize = .zero
  @State private var appeared = false

  var body: some View {
    GeometryReader { proxy in
      let container = proxy.frame(in: .global)
      let box = sourceFrame ?? container
      let place = placement(box, cardWidth: box.width)
      // Hidden until measured, so the first frame is already in the right place.
      let open = appeared && size != .zero && menu.id == card.id
      items
        .frame(width: width(box.width))
        // Layout size (the scale is only drawn); the window frame for outside clicks.
        .onGeometryChange(for: CGSize.self) {
          $0.size
        } action: {
          size = $0
        }
        .onGeometryChange(for: CGRect.self) {
          $0.frame(in: .global)
        } action: {
          menu.frame = $0
        }
        .scaleEffect(open ? 1 : AppleMetrics.motionMenuScale, anchor: place.anchor)
        .offset(y: open ? 0 : (place.up ? AppleMetrics.motionMenuY : -AppleMetrics.motionMenuY))
        .opacity(open ? 1 : 0)
        .animation(open ? Motion.menuOpen : Motion.menuClose, value: open)
        .offset(
          x: place.origin.x + box.minX - container.minX,
          y: place.origin.y + box.minY - container.minY
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    .onAppear {
      // A menu opened from the keyboard appears at once (Web skips the motion for keys).
      if Motion.keyboardDriven { Motion.instantly { appeared = true } } else { appeared = true }
    }
  }

  private func width(_ cardWidth: CGFloat) -> CGFloat {
    min(AppleMetrics.cardMenuWidth, cardWidth - 2 * AppleMetrics.cardMenuInset)
  }

  private struct Placement {
    var origin: CGPoint
    var anchor: UnitPoint
    var up: Bool
  }

  /// The menu's top-left corner inside the card, and the corner it grows from.
  private func placement(_ box: CGRect, cardWidth: CGFloat) -> Placement {
    let window =
      NSApp.keyWindow?.contentView?.bounds.size
      ?? CGSize(width: CGFloat.infinity, height: CGFloat.infinity)
    let floor =
      min(window.height, drag.target.isNull ? window.height : drag.target.minY)
      - AppleMetrics.space12
    let edge = AppleMetrics.cardMenuEdge
    let w = width(cardWidth)
    let h = size.height
    guard let point = menu.point else {
      // Web: `min(48, floor − cardTop − menuHeight)`, never above 8px from the window top.
      var top = min(AppleMetrics.cardMenuTop, floor - box.minY - h)
      if top < AppleMetrics.cardMenuTop { top = max(edge - box.minY, top) }
      return Placement(
        origin: CGPoint(x: box.width - AppleMetrics.cardMenuInset - w, y: top),
        anchor: .topTrailing, up: false)
    }
    let left = point.x + w > window.width - edge
    let up = point.y + h > floor
    let x = max(edge, left ? point.x - w : point.x)
    let y = max(edge, up ? point.y - h : point.y)
    return Placement(
      origin: CGPoint(x: x - box.minX, y: y - box.minY),
      anchor: UnitPoint(x: left ? 1 : 0, y: up ? 1 : 0), up: up)
  }

  private var items: some View {
    VStack(spacing: 0) {
      item(
        "bookmark",
        state.bookmarked ? Copy.text("web.preview.removeBookmark") : Copy.text("web.bookmark")
      ) { intents.bookmark(card.id) }
      item("glasses", state.later ? Copy.text("web.app.1056291ba162") : Copy.text("web.later")) {
        intents.later(card.id)
      }
      item("tag", Copy.text("web.app.09fe39e89e28")) { intents.edit([card.id]) }
      if card.kind.readable {
        item(
          state.read ? "undo" : "circle",
          state.read ? Copy.text("web.app.fe32886b3172") : Copy.text("web.app.82f35d89b827")
        ) { intents.toggleRead(card.id) }
      }
      item(
        "check-circle",
        state.selected ? Copy.text("web.app.74966e20df2e") : Copy.text("web.app.c11330b85234")
      ) { selection.select(card.id) }
    }
    .padding(AppleMetrics.space6)
    .background(
      RoundedRectangle(cornerRadius: AppleMetrics.cardMenuRadius, style: .continuous)
        .fill(AppleColors.card)
    )
    .overlay(
      RoundedRectangle(cornerRadius: AppleMetrics.cardMenuRadius, style: .continuous)
        .strokeBorder(AppleColors.line, lineWidth: AppleMetrics.lineWidth)
    )
    .shadow(.glass)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Copy.text("web.templates.ee9430845e26"))
  }

  private func item(_ icon: String, _ label: String, action: @escaping () -> Void) -> some View {
    Button {
      menu.close()
      action()
    } label: {
      HStack(spacing: AppleMetrics.space12) {
        Icon(icon, size: AppleMetrics.font18)
        Text(label).lineLimit(1)
        Spacer(minLength: 0)
      }
      .font(.sans(AppleMetrics.font14))
      .foregroundStyle(AppleColors.primary)
      .padding(.horizontal, AppleMetrics.space12)
      .frame(minHeight: AppleMetrics.hitTarget)
    }
    .buttonStyle(RowStyle(highlight: AppleColors.fixedBlack5, radius: AppleMetrics.controlRadius))
  }
}

/// A reused collection item cannot own a menu that extends across its neighbors.
/// Keep the same SwiftUI menu in the window layer, including its delayed close.
struct FeedMenuOverlay: View {
  @Environment(CardMenu.self) private var menu
  @Environment(Workspace.self) private var workspace
  @Environment(Reader.self) private var reader
  @State private var retainedID: String?

  var body: some View {
    GeometryReader { proxy in
      if let id = retainedID, workspace.state(id).menuOpen,
        let card = workspace.model(id), let frame = reader.cardFrame(id)
      {
        let local = proxy.frame(in: .named("card-workspace"))
        let global = proxy.frame(in: .global)
        CardMenuLayer(
          card: card, state: workspace.state(id),
          sourceFrame: frame.offsetBy(dx: global.minX - local.minX, dy: global.minY - local.minY)
        )
        .id(id)
      }
    }
    .onChange(of: menu.id, initial: true) { _, id in
      if let id { retainedID = id }
    }
  }
}
