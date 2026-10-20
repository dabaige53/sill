import SillKit
import SwiftUI

/// The desktop top bar (web-interaction.md, 桌面顶栏与 AI 框). Drawn in the content area under a
/// transparent title bar. Icon, Sill, ⌄, search and avatar are 40 high on one center line; the
/// icon's left edge and the avatar's right edge align with the card area.
struct TopBar: View {
  let edge: CGFloat
  let menu: ScopeMenuState
  let scrollToTop: () -> Void
  @Environment(Chrome.self) private var chrome
  @Environment(\.openSettings) private var openSettings

  var body: some View {
    HStack(spacing: AppleMetrics.space8) {
      HStack(spacing: AppleMetrics.space2) {
        Button(action: scrollToTop) {
          HStack(spacing: AppleMetrics.space10) {
            BrandMark()
            Text(verbatim: "Sill")
              .font(.sans(AppleMetrics.font34, .bold))
              .tracking(AppleMetrics.font34 * AppleMetrics.brandTracking)
              .foregroundStyle(AppleColors.primary)
          }
          .frame(minHeight: AppleMetrics.hitTarget)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Copy.text("web.home.top"))
        ScopeToggle(menu: menu)
      }
      Spacer(minLength: AppleMetrics.space8)
      SearchField()
      AccountButton { openSettings() }
        .padding(.trailing, -AppleMetrics.space2)
    }
    .frame(height: AppleMetrics.space60)
    .padding(.top, AppleMetrics.topBarInset)
    .padding(.horizontal, edge)
    .background(AppleColors.canvas)
    .overlay(alignment: .topLeading) {
      ScopeMenu(menu: menu)
        .padding(.leading, menu.anchor - AppleMetrics.space6)
        // Under the brand row (44 high, centered in the 60 bar), 8 apart (Web `.home-menu`).
        .padding(
          .top,
          AppleMetrics.topBarInset + (AppleMetrics.space60 + AppleMetrics.hitTarget) / 2
            + AppleMetrics.space8)
    }
    .coordinateSpace(.named(TopBarSpace.name))
    .modifier(
      Tuck(tucked: chrome.tucked, travel: -(AppleMetrics.topBarInset + AppleMetrics.space60)))
  }
}

/// The avatar: settings. No real photo exists, so the existing person icon.
struct AccountButton: View {
  let action: () -> Void
  @State private var hovered = false
  var body: some View {
    Button(action: action) {
      Icon("person", size: AppleMetrics.accountIcon)
        .foregroundStyle(AppleColors.primary)
        .frame(width: AppleMetrics.searchHeight, height: AppleMetrics.searchHeight)
        .background(Circle().fill(hovered ? AppleColors.surface : AppleColors.card))
        .overlay(Circle().strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth))
        .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .onHover { hovered = $0 }
    .animation(Motion.hover, value: hovered)
    .accessibilityLabel(Copy.text("web.nav.settings"))
  }
}
