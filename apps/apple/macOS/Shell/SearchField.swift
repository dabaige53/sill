import SillKit
import SwiftUI

/// Desktop interface state shared by the top bar, the commands and the keyboard.
@MainActor @Observable final class Shell {
  /// Incremented by ⌘K; the search field focuses itself when it changes.
  private(set) var searchRequest = 0
  /// Incremented by Esc when the field has nothing left to clear; the field gives up focus.
  private(set) var blurRequest = 0
  var searchFocused = false
  /// The field's frame in window coordinates (top-left origin); a click outside it blurs search.
  @ObservationIgnored var searchFrame: CGRect = .zero
  let menu = ScopeMenuState()

  func focusSearch() { searchRequest += 1 }
  func blurSearch() { blurRequest += 1 }

}

/// The search field in the top bar. The tab is a token in the field; home filter and search share
/// one state. At rest it is a short capsule; focus stretches it, and a query or token keeps it
/// open. No focus ring: the longer field and the caret show where typing goes.
struct SearchField: View {
  @Environment(DesktopInteraction.self) private var interaction
  @Environment(Feed.self) private var feed
  @Environment(Shell.self) private var shell
  @State private var text = ""
  @State private var hovered = false
  @FocusState private var focused: Bool

  var body: some View {
    let placeholder =
      feed.scope == .all
      ? Copy.text("web.home.searchPlaceholder")
      : Copy.text("web.home.searchInPrefix") + feed.scope.label
        + Copy.text("web.home.searchInSuffix")
    HStack(spacing: AppleMetrics.space8) {
      Icon("search", size: AppleMetrics.space20).foregroundStyle(AppleColors.secondary)
      if feed.scope != .all {
        Button {
          feed.select(.all)
        } label: {
          Text(feed.scope.label)
            .font(.sans(AppleMetrics.font13, .semibold))
            .foregroundStyle(AppleColors.card)
            .padding(.horizontal, AppleMetrics.searchTokenPaddingX)
            .frame(height: AppleMetrics.searchTokenHeight)
            .background(Capsule().fill(AppleColors.primary))
        }
        .buttonStyle(.plain)
        .modifier(HandCursor())
        .accessibilityLabel("\(Copy.text("web.home.removeTab")) \(feed.scope.label)")
      }
      TextField(
        "", text: $text, prompt: Text(placeholder).foregroundStyle(AppleColors.secondary)
      )
      .textFieldStyle(.plain)
      .font(.sans(AppleMetrics.font15))
      .foregroundStyle(AppleColors.primary)
      .focused($focused)
      .accessibilityIdentifier("home-search")
      .accessibilityLabel(Copy.text("web.search.inputLabel"))
      .onKeyPress(.delete) {
        // Delete at the start removes the last token.
        guard text.isEmpty, feed.scope != .all else { return .ignored }
        feed.select(.all)
        return .handled
      }
      .onKeyPress(.escape) { escape() }
      if text.isEmpty {
        Text(verbatim: "⌘K").font(.sans(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
          .padding(.trailing, AppleMetrics.space6)
          .accessibilityHidden(true)
      } else {
        Button {
          clear()
        } label: {
          Icon("x", size: AppleMetrics.font12)
            .foregroundStyle(AppleColors.card)
            .padding(AppleMetrics.space3)
            .background(Circle().fill(AppleColors.secondary))
            .frame(width: AppleMetrics.searchClearSize, height: AppleMetrics.searchClearSize)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .modifier(HandCursor())
        .accessibilityLabel(Copy.text("web.search.clear"))
      }
    }
    .padding(.leading, AppleMetrics.space14)
    .padding(.trailing, AppleMetrics.space8)
    // The whole capsule takes typing, so the I-beam covers it, not only the text.
    .modifier(TextCursor())
    .modifier(SearchSurface(width: width))
    .animation(Motion.keyboardDriven ? nil : Motion.state, value: width)
    .onGeometryChange(for: CGRect.self) {
      $0.frame(in: .global)
    } action: {
      shell.searchFrame = $0
    }
    .disabled(!interaction.canSearch)
    .onHover { hovered = $0 }
    .onTapGesture { interaction.focusSearch() }
    .onChange(of: text) { _, value in feed.scheduleSearch(value) }
    .onChange(of: feed.query) { _, value in if value != text { text = value } }
    .onChange(of: focused) { _, value in shell.searchFocused = value }
    .onChange(of: shell.searchRequest) {
      Motion.instantly { focused = true }
    }
    .onChange(of: shell.blurRequest) { focused = false }
    // Losing focus elsewhere (a click, the reader, a panel) must not leave the field marked focused.
    .onChange(of: interaction.canSearch) { _, allowed in if !allowed { focused = false } }
  }

  /// Rest, holding a query or token, focused.
  private var width: CGFloat {
    if focused { return AppleMetrics.searchFocusedWidth }
    return text.isEmpty && feed.scope == .all
      ? AppleMetrics.searchWidth : AppleMetrics.searchTaggedWidth
  }

  private func clear() {
    text = ""
    feed.search("")
  }

  /// Esc steps back one layer at a time: text → token → focus.
  private func escape() -> KeyPress.Result {
    if !text.isEmpty {
      clear()
    } else if feed.scope != .all {
      feed.select(.all)
    } else {
      focused = false
    }
    return .handled
  }
}

/// The capsule takes the width it is given and shrinks only when the window has no room.
private struct SearchSurface: ViewModifier {
  var width: CGFloat
  func body(content: Content) -> some View {
    content
      .frame(minWidth: min(width, AppleMetrics.searchWidth), idealWidth: width, maxWidth: width)
      .frame(height: AppleMetrics.searchHeight)
      .modifier(SearchGlass())
  }
}

/// Clear native glass; readability comes from the scroll edge behind the field.
private struct SearchGlass: ViewModifier {
  @ViewBuilder func body(content: Content) -> some View {
    if #available(macOS 26.0, *) {
      content.glassEffect(.clear, in: Capsule())
    } else {
      content.desktopGlass(Capsule())
    }
  }
}
