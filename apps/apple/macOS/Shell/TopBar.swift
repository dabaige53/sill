import AppKit
import SillKit
import SwiftUI

/// The desktop top bar (web-interaction.md, 桌面顶栏与 AI 框). Drawn in the content area under a
/// transparent title bar. Icon, Sill, ⌄, search and avatar are 40 high on one center line. On the
/// Mac window controls occupy a separate row; both navigation edges align with the cards.
/// @design top-bar
struct TopBar: View {
  let edge: CGFloat
  let menu: ScopeMenuState
  let scrollToTop: () -> Void
  @Environment(Workspace.self) private var workspace
  @Environment(Chrome.self) private var chrome
  @Environment(Panels.self) private var panels

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
        .modifier(HandCursor())
        .accessibilityLabel(Copy.text("web.home.top"))
        ScopeToggle(menu: menu)
      }
      Spacer(minLength: AppleMetrics.space8)
      DesktopGlassGroup {
        HStack(spacing: AppleMetrics.space8) {
          if let notice = workspace.notice, notice.isFailure {
            FailureNotice(notice: notice) {
              if workspace.notice == notice { workspace.notice = nil }
            }
            .id(notice.id)
          }
          SearchField()
          AccountButton { panels.open(.settings) }
            .padding(.trailing, -AppleMetrics.space2)
        }
      }
    }
    .frame(height: AppleMetrics.space64)
    .padding(.top, AppleMetrics.topBarInset)
    .padding(.leading, edge)
    .padding(.trailing, edge)
    .background {
      if #available(macOS 26.0, *) {
        Color.clear
      } else {
        Rectangle().fill(.regularMaterial)
          .mask(LinearGradient(colors: [.black, .black, .clear], startPoint: .top, endPoint: .bottom))
          .allowsHitTesting(false)
      }
    }
    .coordinateSpace(.named(TopBarSpace.name))
    .modifier(Tuck(tucked: chrome.tucked, travel: 0))
  }
}

/// The avatar: settings. No real photo exists, so the existing person icon.
struct AccountButton: View {
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Icon("person", size: AppleMetrics.space20)
        .foregroundStyle(AppleColors.primary)
        .frame(width: AppleMetrics.searchHeight, height: AppleMetrics.searchHeight)
        .desktopGlass(Circle(), interactive: true)
        .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .modifier(HandCursor())
    .accessibilityIdentifier("settings-open")
    .accessibilityLabel(Copy.text("web.nav.settings"))
  }
}
