import AppKit
import SillKit
import SwiftUI

struct CardMenuAnchor: PreferenceKey {
  static let defaultValue: [String: Anchor<CGRect>] = [:]
  static func reduce(
    value: inout [String: Anchor<CGRect>], nextValue: () -> [String: Anchor<CGRect>]
  ) {
    value.merge(nextValue(), uniquingKeysWith: { _, next in next })
  }
}

struct CardMenu: View {
  @Environment(Workspace.self) private var model
  let card: Card
  let anchor: CGRect
  let available: CGSize
  @State private var visible = false
  @State private var scale = AppleMetrics.motionMenuScale
  @State private var travel = -AppleMetrics.motionMenuY
  @State private var height: CGFloat = 0
  @State private var highlighted = 0
  @FocusState private var focused: Bool
  private var titles: [String] {
    var result = [
      Copy.appleView, Copy.appleSelect, Copy.appleToggleBookmarkMenu, Copy.appleToggleLaterMenu,
    ]
    if card.readable {
      result.append(
        model.items[card.id]?["read"]?.bool == true ? Copy.appleUnreadAction : Copy.appleRead)
    }
    result.append(
      model.items[card.id]?["archived"]?.bool == true ? Copy.appleRestore : Copy.appleArchive)
    return result
  }
  var body: some View {
    let bottom =
      available.height - AppleMetrics.railEdge - AppleMetrics.railRow - AppleMetrics.space8
    let top = max(AppleMetrics.space8, min(anchor.maxY + AppleMetrics.space4, bottom - height))
    ZStack(alignment: .topLeading) {
      Color.clear.contentShape(Rectangle()).onTapGesture { model.closeCardMenu() }
      VStack(spacing: AppleMetrics.space2) {
        ForEach(Array(titles.enumerated()), id: \.offset) { index, title in
          if index == 2 { Divider().padding(.vertical, AppleMetrics.space4) }
          Button {
            perform(index)
          } label: {
            Text(title).frame(maxWidth: .infinity, alignment: .leading)
              .padding(.horizontal, AppleMetrics.space12).frame(height: AppleMetrics.space36)
              .background(
                highlighted == index ? AppleColors.surface : .clear,
                in: RoundedRectangle(cornerRadius: AppleMetrics.space8))
          }.buttonStyle(.plain).onHover { if $0 { highlighted = index } }
        }
      }.font(.system(size: AppleMetrics.font14)).padding(AppleMetrics.space6)
        .frame(width: AppleMetrics.scopeMenuWidth)
        .background {
          RoundedRectangle(cornerRadius: AppleMetrics.space12).fill(AppleColors.glassThick)
            .overlay(
              RoundedRectangle(cornerRadius: AppleMetrics.space12).strokeBorder(
                AppleColors.lineCard)
            )
            .modifier(NativeShadow(kind: .floating))
        }
        .onGeometryChange(for: CGFloat.self) {
          $0.size.height
        } action: {
          height = $0
        }
        .opacity(visible ? 1 : 0)
        .scaleEffect(scale, anchor: .topTrailing)
        .offset(y: travel)
        .offset(x: max(AppleMetrics.space8, anchor.maxX - AppleMetrics.scopeMenuWidth), y: top)
        .allowsHitTesting(model.cardMenuVisible).accessibilityHidden(!model.cardMenuVisible)
        .focusable().focusEffectDisabled().focused($focused)
        .onKeyPress(keys: [.upArrow, .downArrow, .return, .escape]) { key in
          switch key.key {
          case .upArrow: highlighted = max(0, highlighted - 1)
          case .downArrow: highlighted = min(titles.count - 1, highlighted + 1)
          case .return: perform(highlighted)
          default: model.closeCardMenu(immediate: true)
          }
          return .handled
        }
    }.onChange(of: model.cardMenuVisible, initial: true) { _, shown in
      let generation = model.cardMenuGeneration
      let animation =
        model.menuImmediate
        ? nil
        : NativeMotion.ease(
          shown ? AppleMetrics.motionMenuOpen : AppleMetrics.motionMenuClose)
      Task { @MainActor in
        if shown { await Task.yield() }
        guard model.cardMenuGeneration == generation else { return }
        withAnimation(animation, completionCriteria: .removed) {
          visible = shown
          if shown {
            scale = 1
            travel = 0
          }
        } completion: {
          if !shown && model.cardMenuGeneration == generation { model.cardMenuID = nil }
        }
      }
      if shown { focused = true }
    }
  }
  private func perform(_ index: Int) {
    model.closeCardMenu(immediate: NSApp.currentEvent?.type == .keyDown)
    switch index {
    case 0: model.selected = card.id
    case 1:
      if model.selection.contains(card.id) {
        model.selection.remove(card.id)
      } else {
        model.selection.insert(card.id)
      }
    case 2: model.toggle("bookmarked", card: card)
    case 3: model.toggle("later", card: card)
    case 4 where card.readable: model.toggle("read", card: card)
    default:
      model.patch(
        [card.id], values: ["archived": .bool(model.items[card.id]?["archived"]?.bool != true)])
    }
  }
}
