import SillKit
import SwiftUI

/// Desktop interface state shared by the top bar, the commands and the keyboard.
@MainActor @Observable final class Shell {
  /// Incremented by ⌘K; the search field focuses itself when it changes.
  private(set) var searchRequest = 0
  /// Incremented by Esc when the field has nothing left to clear; the field gives up focus.
  private(set) var blurRequest = 0
  var searchFocused = false
  /// The text as typed, before the search delay; the # list follows it.
  var searchText = ""
  /// Highlighted row of the # list.
  var hashIndex = 0
  /// The field's frame in window coordinates (top-left origin); a click outside it blurs search.
  var searchFrame: CGRect = .zero
  /// The # list's frame; a click on it keeps the field focused.
  @ObservationIgnored var hashFrame: CGRect = .zero
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
  @State private var hovered = false
  @FocusState private var focused: Bool

  private var text: String {
    get { shell.searchText }
    nonmutating set { shell.searchText = newValue }
  }

  var body: some View {
    @Bindable var shell = shell
    let marked = feed.mark != nil || feed.tag != nil
    let placeholder =
      feed.scope != .all
      ? Copy.text("web.home.searchInPrefix") + feed.scope.label
        + Copy.text("web.home.searchInSuffix")
      : marked ? "" : Copy.text("web.home.searchPlaceholder")
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
      // # conditions follow the tab token in accent (web-interaction.md 搜索).
      if let mark = feed.mark {
        HashToken(label: "#" + mark.label) { feed.removeMark() }
      }
      if let tag = feed.tag {
        HashToken(label: "#" + tag) { feed.removeTag() }
      }
      TextField(
        "", text: $shell.searchText,
        prompt: Text(placeholder).foregroundStyle(AppleColors.secondary)
      )
      .textFieldStyle(.plain)
      .font(.sans(AppleMetrics.font15))
      .foregroundStyle(AppleColors.primary)
      .focused($focused)
      .accessibilityIdentifier("home-search")
      .accessibilityLabel(Copy.text("web.search.inputLabel"))
      .onKeyPress(.delete) {
        // Delete at the start removes the last token: the # tag, the # status, then the tab.
        guard text.isEmpty else { return .ignored }
        if feed.tag != nil {
          feed.removeTag()
        } else if feed.mark != nil {
          feed.removeMark()
        } else if feed.scope != .all {
          feed.select(.all)
        } else {
          return .ignored
        }
        return .handled
      }
      .onKeyPress(.escape) { escape() }
      // The # list takes arrows and Return while it is open.
      .onKeyPress(.downArrow) { moveHash(1) }
      .onKeyPress(.upArrow) { moveHash(-1) }
      .onKeyPress(.return) { pickHash() }
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
    .onChange(of: shell.searchText) { old, value in
      if Feed.hashFragment(old) != Feed.hashFragment(value) { shell.hashIndex = 0 }
      feed.scheduleSearch(value)
    }
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
    return text.isEmpty && feed.scope == .all && feed.mark == nil && feed.tag == nil
      ? AppleMetrics.searchWidth : AppleMetrics.searchTaggedWidth
  }

  private func clear() {
    text = ""
    feed.search("")
  }

  /// Esc steps back one layer at a time: text → tokens → focus.
  private func escape() -> KeyPress.Result {
    if !text.isEmpty {
      clear()
    } else if feed.scope != .all || feed.mark != nil || feed.tag != nil {
      feed.clearTokens()
    } else {
      focused = false
    }
    return .handled
  }

  private var hashOptions: [HashOption] {
    guard focused, let fragment = Feed.hashFragment(text) else { return [] }
    return feed.hashOptions(fragment)
  }

  private func moveHash(_ step: Int) -> KeyPress.Result {
    let options = hashOptions
    guard !options.isEmpty else { return .ignored }
    shell.hashIndex = (shell.hashIndex + step + options.count) % options.count
    return .handled
  }

  private func pickHash() -> KeyPress.Result {
    let options = hashOptions
    guard !options.isEmpty else { return .ignored }
    text = feed.pick(options[min(shell.hashIndex, options.count - 1)], in: text)
    shell.hashIndex = 0
    return .handled
  }
}

/// A # condition in the field: accent, removed with a click.
private struct HashToken: View {
  let label: String
  let remove: () -> Void
  var body: some View {
    Button(action: remove) {
      Text(label)
        .font(.sans(AppleMetrics.font13, .semibold))
        .foregroundStyle(AppleColors.fixedWhite)
        .lineLimit(1)
        .padding(.horizontal, AppleMetrics.searchTokenPaddingX)
        .frame(height: AppleMetrics.searchTokenHeight)
        .background(Capsule().fill(AppleColors.accent))
    }
    .buttonStyle(.plain)
    .modifier(HandCursor())
    .accessibilityLabel("\(Copy.text("web.search.removeCondition")) \(label)")
  }
}

/// Typing # lists the statuses, then the existing tags, under the field (Web `searchHashList`).
/// It floats in the window layer over the cards and pushes nothing; arrows move the highlight.
struct HashList: View {
  @Environment(Feed.self) private var feed
  @Environment(Shell.self) private var shell

  var body: some View {
    let options =
      shell.searchFocused ? Feed.hashFragment(shell.searchText).map(feed.hashOptions) ?? [] : []
    if !options.isEmpty {
      let active = min(shell.hashIndex, options.count - 1)
      VStack(alignment: .leading, spacing: 0) {
        group(options, marks: true, title: Copy.text("web.search.hashStatus"), active: active)
        group(options, marks: false, title: Copy.text("web.search.hashTag"), active: active)
      }
      .padding(AppleMetrics.space6)
      .frame(width: shell.searchFrame.width, alignment: .leading)
      .background(
        RoundedRectangle(cornerRadius: AppleMetrics.scopeMenuRadius, style: .continuous)
          .fill(AppleColors.card)
          .shadow(.floating)
      )
      .onGeometryChange(for: CGRect.self) {
        $0.frame(in: .global)
      } action: {
        shell.hashFrame = $0
      }
      .onDisappear { shell.hashFrame = .zero }
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Copy.text("web.search.hashList"))
    }
  }

  @ViewBuilder private func group(
    _ options: [HashOption], marks: Bool, title: String, active: Int
  ) -> some View {
    let rows = options.enumerated().filter {
      if case .mark = $0.element.value { return marks }
      return !marks
    }
    if !rows.isEmpty {
      Text(title)
        .font(.sans(AppleMetrics.font12, .semibold))
        .foregroundStyle(AppleColors.secondary)
        .padding(.horizontal, AppleMetrics.space10)
        .padding(.top, AppleMetrics.space8)
        .padding(.bottom, AppleMetrics.space4)
      ForEach(rows, id: \.element) { index, option in
        HashRow(label: option.label, active: index == active) {
          shell.searchText = feed.pick(option, in: shell.searchText)
          shell.hashIndex = 0
        }
      }
    }
  }
}

private struct HashRow: View {
  let label: String
  let active: Bool
  let action: () -> Void
  @State private var hovered = false
  var body: some View {
    Button(action: action) {
      Text(label)
        .font(.sans(AppleMetrics.font15))
        .foregroundStyle(AppleColors.primary)
        .lineLimit(1)
        .padding(.horizontal, AppleMetrics.space10)
        .frame(maxWidth: .infinity, minHeight: AppleMetrics.scopeMenuRow, alignment: .leading)
        .background(
          RoundedRectangle(cornerRadius: AppleMetrics.space10)
            .fill(active || hovered ? AppleColors.faint : .clear)
        )
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .modifier(HandCursor())
    .onHover { hovered = $0 }
    .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
  }
}

/// Type chips under the top bar while there is text; types without results stay out.
struct KindChips: View {
  @Environment(Feed.self) private var feed

  var body: some View {
    ScrollView(.horizontal) {
      HStack(spacing: AppleMetrics.space8) {
        chip(nil, label: Copy.text("web.all"))
        ForEach(
          SearchKind.all.filter { feed.kinds.contains($0.kind) || feed.kind == $0.kind }, id: \.kind
        ) {
          chip($0.kind, label: $0.label)
        }
      }
    }
    .scrollIndicators(.hidden)
    .frame(height: AppleMetrics.space32)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Copy.text("web.search.filters.type"))
  }

  private func chip(_ kind: CardKind?, label: String) -> some View {
    let active = feed.kind == kind
    return Button {
      feed.selectKind(kind)
    } label: {
      Text(label)
        .font(.sans(AppleMetrics.font14, active ? .semibold : .regular))
        .foregroundStyle(active ? AppleColors.card : AppleColors.primary)
        .padding(.horizontal, AppleMetrics.space14)
        .frame(height: AppleMetrics.space32)
        .background(Capsule().fill(active ? AppleColors.primary : AppleColors.surface))
    }
    .buttonStyle(.plain)
    .modifier(HandCursor())
    .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
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
