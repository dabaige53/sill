import SillKit
import SwiftUI

/// Desktop interface state shared by the top bar, the commands and the keyboard.
@MainActor @Observable final class Shell {
  /// Incremented by ⌘K; the search field focuses itself when it changes.
  private(set) var searchRequest = 0
  /// Incremented by Esc when the field has nothing left to clear; the field gives up focus.
  private(set) var blurRequest = 0
  var searchFocused = false
  let menu = ScopeMenuState()

  func focusSearch() { searchRequest += 1 }
  func blurSearch() { blurRequest += 1 }
}

/// The search field in the top bar. The tab is a token in the field; home filter and search share
/// one state. Width 280, 360 with a token, 480 while focused; the right edge stays put and the
/// background stretches while the content slides (220ms `ease`). Text and caret never scale.
struct SearchField: View {
  @Environment(Feed.self) private var feed
  @Environment(Shell.self) private var shell
  @State private var text = ""
  @State private var hovered = false
  @FocusState private var focused: Bool

  private var target: CGFloat {
    focused
      ? AppleMetrics.searchFocusedWidth
      : feed.scope != .all ? AppleMetrics.searchTaggedWidth : AppleMetrics.searchWidth
  }

  var body: some View {
    let placeholder =
      feed.scope == .all
      ? Copy.text("web.home.searchPlaceholder")
      : Copy.text("web.home.searchInPrefix") + feed.scope.label
        + Copy.text("web.home.searchInSuffix")
    HStack(spacing: AppleMetrics.space8) {
      Icon("search", size: AppleMetrics.space16).foregroundStyle(AppleColors.secondary)
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
        .accessibilityLabel("\(Copy.text("web.home.removeTab")) \(feed.scope.label)")
      }
      TextField(
        "", text: $text, prompt: Text(placeholder).foregroundStyle(AppleColors.iconSecondary)
      )
      .textFieldStyle(.plain)
      .font(.sans(AppleMetrics.font15))
      .foregroundStyle(AppleColors.primary)
      .focused($focused)
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
            .background(Circle().fill(AppleColors.iconSecondary))
            .frame(width: AppleMetrics.searchClearSize, height: AppleMetrics.searchClearSize)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Copy.text("web.search.clear"))
      }
    }
    .padding(.leading, AppleMetrics.space14)
    .padding(.trailing, AppleMetrics.space8)
    .modifier(SearchResize(target: target, focused: focused))
    .onHover { hovered = $0 }
    .onTapGesture { focused = true }
    .onChange(of: text) { _, value in feed.search(value) }
    .onChange(of: feed.query) { _, value in if value != text { text = value } }
    .onChange(of: focused) { _, value in shell.searchFocused = value }
    .onChange(of: shell.searchRequest) {
      Motion.instantly { focused = true }
    }
    .onChange(of: shell.blurRequest) { focused = false }
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

/// The field keeps its final width in layout at once; the drawn background follows with the
/// state animation from the fixed right edge, and the content slides with it.
private struct SearchResize: ViewModifier {
  var target: CGFloat
  var focused: Bool
  @State private var drawn: CGFloat = AppleMetrics.searchWidth

  func body(content: Content) -> some View {
    content
      .frame(width: target, height: AppleMetrics.searchHeight)
      .offset(x: target - drawn)
      .mask(alignment: .trailing) { Capsule().frame(width: drawn) }
      .background(alignment: .trailing) {
        Capsule().fill(AppleColors.card)
          .overlay(
            Capsule().strokeBorder(
              focused ? AppleColors.accent : AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth
            )
          )
          .background(
            Capsule().stroke(
              AppleColors.accent.opacity(focused ? AppleMetrics.searchFocusOpacity : 0),
              lineWidth: AppleMetrics.searchFocusRing * 2)
          )
          .frame(width: drawn)
      }
      .onAppear { drawn = target }
      .onChange(of: target) { _, value in
        if Motion.keyboardDriven {
          Motion.instantly { drawn = value }
        } else {
          withAnimation(Motion.state) { drawn = value }
        }
      }
  }
}
