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
  @Environment(Feed.self) private var feed

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      row
      // Type chips: one row under the bar while there is text (web-interaction.md 搜索).
      if TopBar.showsKinds(feed) {
        KindChips().padding(.bottom, AppleMetrics.space2)
      }
    }
    .padding(.top, (AppleMetrics.topBarInset / 2))
    .padding(.leading, edge)
    .padding(.trailing, edge)
    .background {
      // Attach the system material to the controls so both share the same reveal.
      // A custom window cannot rely on automatic scroll-edge coverage alone.
      Rectangle().fill(.regularMaterial)
        .mask(
          LinearGradient(
            stops: [
              .init(color: .black, location: 0),
              .init(color: .black.opacity(0.7), location: 0.45),
              .init(color: .clear, location: 1),
            ],
            startPoint: .top, endPoint: .bottom)
        )
        .padding(.bottom, -AppleMetrics.space12)
        .allowsHitTesting(false)
    }
    .coordinateSpace(.named(TopBarSpace.name))
    .modifier(TopBarReveal(tucked: chrome.tucked))
  }

  /// Icon, Sill, ⌄, search and avatar on one 64-high line.
  private var row: some View {
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
  }

  /// The chip row shows only while there is text to search.
  static func showsKinds(_ feed: Feed) -> Bool { !Feed.searchText(feed.query).isEmpty }
}

/// One transition owns the controls and material, including the first mounted frame.
private struct TopBarReveal: ViewModifier {
  let tucked: Bool
  @State private var entered = false

  func body(content: Content) -> some View {
    let hidden = !entered || tucked
    let travel = AppleMetrics.topBarInset / 2 + AppleMetrics.space64 + AppleMetrics.space12
    content
      .offset(y: hidden ? -travel : 0)
      .opacity(hidden ? 0 : 1)
      .allowsHitTesting(!hidden)
      .accessibilityHidden(hidden)
      .animation(
        Motion.keyboardDriven
          ? nil
          : Motion.ease(
            hidden ? AppleMetrics.motionRailHide : AppleMetrics.motionDetailOpen),
        value: hidden
      )
      .task {
        guard !entered else { return }
        // Commit the initial offscreen state before starting the entrance.
        await Task.yield()
        guard !Task.isCancelled else { return }
        entered = true
      }
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
