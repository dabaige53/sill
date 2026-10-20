import SillKit
import SwiftUI

struct ScopeMenu: View {
  @Environment(Workspace.self) private var model
  @Binding var presented: Bool
  let anchor: CGPoint
  let immediate: Bool
  let removed: () -> Void
  @State private var visible = false
  @State private var generation = 0
  @State private var highlighted = 0
  @State private var keyboardClosing = false
  @FocusState private var focused: Bool
  var body: some View {
    ZStack(alignment: .topLeading) {
      Color.clear.contentShape(Rectangle()).onTapGesture { presented = false }
      VStack(spacing: AppleMetrics.space2) {
        ForEach(Array(FeedScope.tabs.enumerated()), id: \.element.id) { index, scope in
          Button {
            select(index)
          } label: {
            HStack(spacing: AppleMetrics.space8) {
              NativeIcon(name: "check", size: AppleMetrics.font14).opacity(
                model.feedScope == scope ? 1 : 0)
              Text(scope.label)
              Spacer()
              Text("⌘\(index + 1)").foregroundStyle(AppleColors.secondary)
            }.padding(.horizontal, AppleMetrics.space12).frame(height: AppleMetrics.space36)
              .background(
                highlighted == index ? AppleColors.surface : .clear,
                in: RoundedRectangle(cornerRadius: AppleMetrics.space8))
          }.buttonStyle(.plain).onHover { if $0 { highlighted = index } }
        }
        Divider()
        Button(Copy.appleNewNote) { select(FeedScope.tabs.count) }
          .buttonStyle(.plain).frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, AppleMetrics.space12).frame(height: AppleMetrics.space36)
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
        .opacity(visible ? 1 : 0)
        .scaleEffect(visible ? 1 : AppleMetrics.motionMenuScale, anchor: .topLeading)
        .offset(x: max(0, anchor.x), y: max(0, anchor.y))
        .allowsHitTesting(presented).accessibilityHidden(!presented)
        .focusable().focusEffectDisabled().focused($focused)
        .onKeyPress(keys: [.upArrow, .downArrow, .return, .escape]) { key in
          keyboardClosing = true
          switch key.key {
          case .upArrow: highlighted = max(0, highlighted - 1)
          case .downArrow: highlighted = min(FeedScope.tabs.count, highlighted + 1)
          case .return: select(highlighted)
          default: presented = false
          }
          return .handled
        }
    }.task {
      highlighted = FeedScope.tabs.firstIndex(of: model.feedScope) ?? 0
      focused = true
      await Task.yield()
      guard presented else { return }
      withAnimation(immediate ? nil : NativeMotion.ease(AppleMetrics.motionMenuOpen)) {
        visible = true
      }
    }.onChange(of: presented) { _, presented in
      generation += 1
      let current = generation
      withAnimation(
        immediate || keyboardClosing
          ? nil
          : NativeMotion.ease(
            presented ? AppleMetrics.motionMenuOpen : AppleMetrics.motionMenuClose),
        completionCriteria: .removed
      ) {
        visible = presented
      } completion: {
        if !presented && generation == current { removed() }
      }
    }
  }
  private func select(_ index: Int) {
    presented = false
    if FeedScope.tabs.indices.contains(index) {
      model.feedScope = FeedScope.tabs[index]
    } else {
      model.capturePresented = true
    }
  }
}
