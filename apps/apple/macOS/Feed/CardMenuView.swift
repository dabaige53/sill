import SillKit
import SwiftUI

/// Web `.card-more-menu`: under the card's top-right corner, solid card color with a line and the
/// glass shadow. Near the bottom it moves up only as far as it must to stay clear of the AI box.
/// It opens from 4px up at 95% in 180ms and closes the same way in 140ms.
struct CardMenuLayer: View {
  let card: CardModel
  let state: CardState
  @Environment(\.cardIntents) private var intents
  @Environment(CardMenu.self) private var menu
  @Environment(CardDrag.self) private var drag
  @Environment(Selection.self) private var selection
  @State private var height: CGFloat = 0

  var body: some View {
    GeometryReader { proxy in
      let box = proxy.frame(in: .global)
      items
        .frame(
          width: min(AppleMetrics.cardMenuWidth, proxy.size.width - 2 * AppleMetrics.cardMenuInset)
        )
        .onGeometryChange(for: CGRect.self) {
          $0.frame(in: .global)
        } action: { frame in
          height = frame.height
          menu.frame = frame
        }
        .padding(.top, top(box))
        .padding(.trailing, AppleMetrics.cardMenuInset)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
    }
    .transition(
      .opacity
        .combined(with: .scale(scale: AppleMetrics.motionMenuScale, anchor: .topTrailing))
        .combined(with: .offset(y: -AppleMetrics.motionMenuY)))
  }

  /// Web: `min(48, floor − cardTop − menuHeight)`, never above 8px from the window top.
  private func top(_ box: CGRect) -> CGFloat {
    let window = NSApp.keyWindow?.contentView?.bounds.height ?? .infinity
    let floor = min(window, drag.target.isNull ? window : drag.target.minY) - AppleMetrics.space12
    let top = min(AppleMetrics.cardMenuTop, floor - box.minY - height)
    return top < AppleMetrics.cardMenuTop ? max(AppleMetrics.cardMenuEdge - box.minY, top) : top
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
