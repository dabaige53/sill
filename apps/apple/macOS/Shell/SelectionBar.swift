import SillKit
import SwiftUI

/// What the selection bar does. Not observable.
final class SelectionIntents: @unchecked Sendable {
  var bookmark: @MainActor () -> Void = {}
  var later: @MainActor () -> Void = {}
  var tag: @MainActor () -> Void = {}
  var toAI: @MainActor () -> Void = {}
  var cancel: @MainActor () -> Void = {}
}

/// Web `#selection-bar`: while cards are selected it takes the AI box's place, 640 wide glass,
/// with the count, bookmark, read later, tags, hand to AI and cancel. Right-click opens the same
/// actions as a menu.
struct SelectionBar: View {
  let intents: SelectionIntents
  @Environment(Selection.self) private var selection

  var body: some View {
    HStack(spacing: AppleMetrics.space4) {
      Text("\(selection.count)")
        .font(.number(AppleMetrics.font13, .semibold))
        .foregroundStyle(AppleColors.fixedWhite)
        .padding(.horizontal, AppleMetrics.space8)
        .frame(minWidth: AppleMetrics.countBadgeSize, minHeight: AppleMetrics.countBadgeSize)
        .background(Capsule().fill(AppleColors.accentFill))
        .padding(.horizontal, AppleMetrics.space8)
        .accessibilityLabel("\(selection.count)\(Copy.text("web.common.cardCountSuffix"))")
      ToolButton(
        icon: "bookmark",
        label: Copy.text(
          selection.allBookmarked ? "web.preview.removeBookmark" : "web.app.87aeb7040c82"),
        active: selection.allBookmarked, action: intents.bookmark
      )
      .disabled(selection.writing)
      ToolButton(
        icon: "glasses",
        label: Copy.text(selection.allLater ? "web.preview.removeLater" : "web.app.d108c0a7e2c3"),
        active: selection.allLater, action: intents.later
      )
      .disabled(selection.writing)
      ToolButton(icon: "tag", label: Copy.text("web.app.b5816e5fd0be"), action: intents.tag)
      ToolButton(icon: "chat", label: Copy.text("web.selection.toAI"), action: intents.toAI)
      Rectangle().fill(AppleColors.lineHover)
        .frame(width: AppleMetrics.lineWidth, height: AppleMetrics.toolbarSeparatorHeight)
        .padding(.horizontal, AppleMetrics.space6)
        .accessibilityHidden(true)
      ToolButton(icon: "x", label: Copy.text("web.app.74966e20df2e"), action: intents.cancel)
    }
    .padding(AppleMetrics.railInset)
    .fixedSize(horizontal: true, vertical: false)
    .frame(height: AppleMetrics.railRow)
    .desktopGlass(Capsule())
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Copy.text("web.app.461e085d5ca2"))
  }
}

/// Web `.selection-drag-preview`: the carried cards as a small pile centered on the pointer. Up
/// to three real cards at 176 wide, the first chosen on top, the others fanned behind it, and the
/// count in an accent badge.
struct DragPile: View {
  let cardWidth: CGFloat
  @Environment(CardDrag.self) private var drag
  @Environment(Workspace.self) private var workspace
  @Environment(Feed.self) private var feed
  @State private var height = AppleMetrics.dragStackFallbackHeight

  var body: some View {
    let ids = Array(drag.ids.prefix(3))
    ZStack(alignment: .topTrailing) {
      ForEach(Array(ids.indices.reversed()), id: \.self) { index in
        face(ids[index], top: index == 0)
          .modifier(PileLayer(layer: index))
      }
      Text("\(drag.ids.count)")
        .font(.number(AppleMetrics.font13, .semibold))
        .foregroundStyle(AppleColors.fixedWhite)
        .padding(.horizontal, AppleMetrics.space8)
        .frame(minWidth: AppleMetrics.countBadgeSize, minHeight: AppleMetrics.countBadgeSize)
        .background(Capsule().fill(AppleColors.accentFill))
        .shadow(
          color: AppleColors.fixedBlack18, radius: AppleMetrics.dragCountShadowBlur / 2,
          y: AppleMetrics.dragCountShadowY
        )
        .offset(x: AppleMetrics.dragCountOffset, y: -AppleMetrics.dragCountOffset)
    }
    .frame(width: AppleMetrics.dragStackWidth, height: height)
    .position(drag.location)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }

  private func face(_ id: String, top: Bool) -> some View {
    let shape = RoundedRectangle(cornerRadius: AppleMetrics.dragFaceRadius, style: .continuous)
    let full = max(cardWidth, AppleMetrics.dragStackWidth)
    let scale = AppleMetrics.dragStackWidth / full
    return ZStack(alignment: .topLeading) {
      if let card = workspace.model(id) {
        CardBody(card: card, state: workspace.state(id), context: CardContext(now: feed.now))
          .frame(width: full)
          .fixedSize(horizontal: false, vertical: true)
          .onGeometryChange(for: CGFloat.self) {
            $0.size.height
          } action: { value in
            guard top else { return }
            height = min(
              AppleMetrics.dragStackMaxHeight, max(AppleMetrics.dragStackMinHeight, value * scale))
          }
          .scaleEffect(scale, anchor: .topLeading)
      }
    }
    .frame(width: AppleMetrics.dragStackWidth, height: height, alignment: .topLeading)
    .background(AppleColors.card)
    .clipShape(shape)
    .overlay(shape.strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth / 2))
    .shadow(
      color: AppleColors.fixedBlack6, radius: AppleMetrics.dragFaceNearBlur / 2,
      y: AppleMetrics.dragFaceNearY
    )
    .shadow(
      color: AppleColors.fixedBlack14, radius: AppleMetrics.dragFaceFarBlur / 2,
      y: AppleMetrics.dragFaceFarY)
  }
}

/// Layer 1 leans right behind the top card, layer 2 left behind that one.
private struct PileLayer: ViewModifier {
  let layer: Int
  func body(content: Content) -> some View {
    switch layer {
    case 1:
      content
        .scaleEffect(AppleMetrics.dragLayerOneScale)
        .rotationEffect(.degrees(AppleMetrics.dragLayerRotation))
        .offset(x: AppleMetrics.dragLayerOffsetX, y: AppleMetrics.dragLayerOneY)
    case 2:
      content
        .scaleEffect(AppleMetrics.dragLayerTwoScale)
        .rotationEffect(.degrees(-AppleMetrics.dragLayerRotation))
        .offset(x: -AppleMetrics.dragLayerOffsetX, y: AppleMetrics.dragLayerTwoY)
    default: content
    }
  }
}
