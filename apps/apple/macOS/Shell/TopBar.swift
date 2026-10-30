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
    // An open card owns the desktop: the bar steps aside until it closes, except at the top.
    .modifier(TopBarReveal())
  }

  /// Icon, Sill, ⌄, search and avatar on one 64-high line.
  private var row: some View {
    HStack(spacing: AppleMetrics.space8) {
      HStack(spacing: AppleMetrics.space2) {
        Button(action: scrollToTop) {
          HStack(spacing: AppleMetrics.space10) {
            BrandMark()
            BrandWordmark()
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
/// Scrolling takes its animation from `Chrome`; an open card and the first entrance set their own.
private struct TopBarReveal: ViewModifier {
  @Environment(Chrome.self) private var chrome

  func body(content: Content) -> some View {
    let card = chrome.yielding
    let hidden = chrome.tucked || card
    let travel = AppleMetrics.topBarInset / 2 + AppleMetrics.space64 + AppleMetrics.space12
    content
      .offset(y: hidden ? -travel : 0)
      .opacity(hidden ? 0 : 1)
      .allowsHitTesting(!hidden)
      .accessibilityHidden(hidden)
      .animation(
        Motion.keyboardDriven
          ? nil
          : card ? Motion.ease(AppleMetrics.motionRailHide) : Motion.card,
        value: card
      )
      .animation(
        Motion.keyboardDriven
          ? nil : chrome.tucked ? Motion.ease(AppleMetrics.motionRailHide) : Motion.topReveal,
        value: chrome.tucked)
  }
}

/// The shared mascot portrait opens settings.
struct AccountButton: View {
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Image("account-avatar", bundle: AppResources.bundle)
        .resizable()
        .scaledToFill()
        .frame(width: AppleMetrics.searchHeight, height: AppleMetrics.searchHeight)
        .clipShape(Circle())
        .accessibilityHidden(true)
        .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
        .contentShape(Circle())
    }
    .buttonStyle(IconPress(highlight: false))
    .modifier(HandCursor())
    .accessibilityIdentifier("settings-open")
    .accessibilityLabel(Copy.text("web.nav.settings"))
  }
}
