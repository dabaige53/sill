import SillKit
import SwiftUI

/// The ⌄ tab menu: collapsed by default, opened under the toggle (180ms in, 120ms out; keyboard instant).
@MainActor @Observable final class ScopeMenuState {
  private(set) var open = false
  private(set) var shown = false
  var highlighted: Scope?
  /// x of the toggle inside the brand row.
  var anchor: CGFloat = 0
  @ObservationIgnored private var token = 0

  func toggle() { open ? close() : present() }

  func present() {
    token += 1
    open = true
    highlighted = nil
    if Motion.keyboardDriven {
      Motion.instantly { shown = true }
    } else {
      withAnimation(Motion.menuOpen) { shown = true }
    }
  }

  /// Fades out from where it is drawn; an older close never hides a newer menu.
  func close() {
    guard open else { return }
    token += 1
    let current = token
    if Motion.keyboardDriven {
      Motion.instantly { shown = false }
      open = false
      return
    }
    withAnimation(Motion.menuClose, completionCriteria: .logicallyComplete) {
      shown = false
    } completion: { [weak self] in
      guard let self, self.token == current else { return }
      self.open = false
    }
  }

  func move(_ step: Int, from scope: Scope) {
    let all = Scope.allCases
    let current = all.firstIndex(of: highlighted ?? scope) ?? 0
    highlighted = all[(current + step + all.count) % all.count]
  }
}

struct ScopeToggle: View {
  let menu: ScopeMenuState
  @State private var hovered = false
  var body: some View {
    Button {
      menu.toggle()
    } label: {
      Icon("chevron", size: AppleMetrics.font20)
        .rotationEffect(.degrees(90))
        .foregroundStyle(menu.open || hovered ? AppleColors.primary : AppleColors.secondary)
        .frame(width: AppleMetrics.space36, height: AppleMetrics.space36)
        .background(
          RoundedRectangle(cornerRadius: AppleMetrics.scopeToggleRadius)
            .fill(menu.open ? AppleColors.faint : hovered ? AppleColors.surface : .clear)
        )
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovered = $0 }
    .animation(Motion.hover, value: hovered)
    .background(
      GeometryReader { proxy in
        Color.clear
          .onAppear { menu.anchor = proxy.frame(in: .named(TopBarSpace.name)).minX }
          .onChange(of: proxy.frame(in: .named(TopBarSpace.name)).minX) { _, x in menu.anchor = x }
      }
    )
    .accessibilityLabel(Copy.text("web.home.filterMenu"))
    .accessibilityValue(menu.open ? Copy.text("web.templates.afd4b783536b") : "")
  }
}

enum TopBarSpace { static let name = "topbar" }

struct ScopeMenu: View {
  let menu: ScopeMenuState
  @Environment(Feed.self) private var feed

  var body: some View {
    if menu.open {
      VStack(spacing: 0) {
        ForEach(Scope.allCases, id: \.self) { scope in
          ScopeMenuRow(
            scope: scope, checked: feed.scope == scope, highlighted: menu.highlighted == scope
          ) {
            feed.select(scope)
            menu.close()
          }
        }
      }
      .padding(AppleMetrics.space6)
      .frame(width: AppleMetrics.scopeMenuWidth)
      .background(
        RoundedRectangle(cornerRadius: AppleMetrics.scopeMenuRadius, style: .continuous)
          .fill(AppleColors.card)
          .overlay(
            RoundedRectangle(cornerRadius: AppleMetrics.scopeMenuRadius, style: .continuous)
              .stroke(AppleColors.lineHover, lineWidth: AppleMetrics.lineWidth / 2)
          )
          .shadow(.floating)
      )
      .opacity(menu.shown ? 1 : 0)
      .scaleEffect(menu.shown ? 1 : AppleMetrics.motionMenuScale, anchor: .topLeading)
      .allowsHitTesting(menu.shown)
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Copy.text("web.home.tabs"))
    }
  }
}

private struct ScopeMenuRow: View {
  let scope: Scope
  let checked: Bool
  let highlighted: Bool
  let action: () -> Void
  @State private var hovered = false
  var body: some View {
    Button(action: action) {
      HStack(spacing: AppleMetrics.space6) {
        Icon("check", size: AppleMetrics.space16)
          .frame(width: AppleMetrics.scopeMenuCheck, height: AppleMetrics.scopeMenuCheck)
          .opacity(checked ? 1 : 0)
        Text(scope.label).font(.sans(AppleMetrics.font15, checked ? .semibold : .regular))
          .frame(maxWidth: .infinity, alignment: .leading)
        Text("⌘\(String(scope.shortcut))").font(.sans(AppleMetrics.font13))
          .foregroundStyle(AppleColors.secondary)
      }
      .foregroundStyle(AppleColors.primary)
      .padding(.leading, AppleMetrics.space6)
      .padding(.trailing, AppleMetrics.space12)
      .frame(height: AppleMetrics.scopeMenuRow)
      .background(
        RoundedRectangle(cornerRadius: AppleMetrics.scopeMenuRowRadius)
          .fill(checked || hovered || highlighted ? AppleColors.faint : .clear)
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovered = $0 }
    .accessibilityAddTraits(checked ? [.isButton, .isSelected] : .isButton)
  }
}
