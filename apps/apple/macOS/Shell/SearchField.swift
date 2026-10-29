import AppKit
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
  var hashIndex = -1
  var hashScrollRequest = 0
  var suggestionsDismissed = false
  /// The field's frame in window coordinates (top-left origin); a click outside it blurs search.
  var searchFrame: CGRect = .zero
  /// The # list's frame; a click on it keeps the field focused.
  @ObservationIgnored var hashFrame: CGRect = .zero
  let menu = ScopeMenuState()

  func focusSearch() {
    suggestionsDismissed = false
    guard !searchFocused else { return }
    searchRequest += 1
  }
  func blurSearch() { blurRequest += 1 }

}

/// The search field in the top bar. The tab is a token in the field; home filter and search share
/// one state. The capsule keeps its width while focus and suggestions change.
struct SearchField: View {
  @Environment(DesktopInteraction.self) private var interaction
  @Environment(Reader.self) private var reader
  @Environment(Feed.self) private var feed
  @Environment(Shell.self) private var shell
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
      Icon("search", size: AppleMetrics.space16).foregroundStyle(AppleColors.secondary)
      if feed.scope != .all {
        HashToken(label: feed.scope.label, tint: AppleColors.primary, foreground: AppleColors.card)
        {
          feed.select(.all)
        }
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
        prompt: Text(placeholder).foregroundStyle(AppleColors.primary)
      )
      .textFieldStyle(.plain)
      .font(.sans(AppleMetrics.font15))
      .frame(height: AppleMetrics.space32)
      .foregroundStyle(AppleColors.primary)
      .focused($focused)
      .modifier(TextCursor())
      // Focus feedback belongs to the capsule; never animate the AppKit field editor's layout.
      .transaction { $0.animation = nil }
      .simultaneousGesture(TapGesture().onEnded { shell.suggestionsDismissed = false })
      .accessibilityIdentifier("home-search")
      .accessibilityLabel(Copy.text("web.search.inputLabel"))
      .onKeyPress(.delete) {
        // Delete at the start removes the last token: the # tag, the # status, then the tab.
        guard text.isEmpty, !composing else { return .ignored }
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
      .onKeyPress(.return) {
        guard !composing else { return .ignored }
        feed.search(text)
        if !hashOptions.isEmpty {
          shell.hashIndex = max(0, shell.hashIndex)
          return pickHash()
        }
        shell.suggestionsDismissed = true
        return .handled
      }
      .onKeyPress(.tab) { !composing && shell.hashIndex >= 0 ? pickHash() : .ignored }
      .onKeyPress(.home) { selectEdge(last: false) }
      .onKeyPress(.end) { selectEdge(last: true) }
      ZStack {
        if text.isEmpty {
          Text(verbatim: "⌘K").font(.sans(AppleMetrics.font13)).foregroundStyle(
            AppleColors.secondary
          )
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
          .buttonStyle(SearchPress())
          .modifier(HandCursor())
          .accessibilityLabel(Copy.text("web.search.clear"))
          .transition(
            .opacity.combined(with: .scale(scale: 0.25)).combined(
              with: Motion.blur(AppleMetrics.space4)))
        }
      }.frame(width: AppleMetrics.space32, height: AppleMetrics.space32)
        .animation(
          Motion.keyboardDriven
            ? nil : .spring(duration: AppleMetrics.searchIconDuration, bounce: 0),
          value: text.isEmpty)
    }
    .padding(.leading, AppleMetrics.space14)
    .padding(.trailing, AppleMetrics.space8)
    // The whole capsule takes typing, so the I-beam covers it, not only the text.
    .modifier(SearchSurface(width: width))
    .overlay {
      Capsule().strokeBorder(
        AppleColors.accent.opacity(focused ? AppleMetrics.searchFocusOpacity : 0),
        lineWidth: AppleMetrics.searchFocusRing
      ).animation(Motion.keyboardDriven ? nil : Motion.fast, value: focused)
        .allowsHitTesting(false)
    }
    // Only empty space focuses the field. A parent tap gesture competes with token removal.
    .background {
      Color.clear.contentShape(Capsule()).onTapGesture { interaction.focusSearch() }
    }
    .onGeometryChange(for: CGRect.self) {
      $0.frame(in: .global)
    } action: {
      shell.searchFrame = $0
    }
    .disabled(!interaction.canSearch)
    .onChange(of: shell.searchText) { old, value in
      shell.hashIndex = -1
      shell.suggestionsDismissed = false
      if (NSApp.keyWindow?.firstResponder as? NSTextView)?.hasMarkedText() != true {
        feed.scheduleSearch(value)
      }
    }
    .onChange(of: feed.query) { _, value in if value != text { text = value } }
    .onChange(of: focused) { _, value in
      shell.searchFocused = value
      shell.suggestionsDismissed = false
      shell.hashIndex = value ? feed.suggestions(text).firstIndex(where: feed.selected) ?? -1 : -1
      if value { shell.hashScrollRequest += 1 }
    }
    .onChange(of: shell.searchRequest) {
      if Motion.keyboardDriven { Motion.instantly { focused = true } } else { focused = true }
    }
    .onChange(of: shell.blurRequest) { focused = false }
    // Losing focus elsewhere (a click, the reader, a panel) must not leave the field marked focused.
    .onChange(of: interaction.canSearch) { _, allowed in if !allowed { focused = false } }
  }

  private var width: CGFloat { AppleMetrics.searchFocusedWidth }

  private func clear() {
    text = ""
    feed.search("")
  }

  /// Esc steps back one layer at a time: text → tokens → focus.
  private var composing: Bool {
    (NSApp.keyWindow?.firstResponder as? NSTextView)?.hasMarkedText() == true
  }

  private func escape() -> KeyPress.Result {
    guard !composing else { return .ignored }
    if !hashOptions.isEmpty {
      shell.suggestionsDismissed = true
      shell.hashIndex = -1
    } else if !text.isEmpty {
      clear()
    } else if feed.scope != .all || feed.mark != nil || feed.tag != nil {
      feed.clearTokens()
    } else {
      focused = false
    }
    return .handled
  }

  private var hashOptions: [HashOption] {
    guard focused, !shell.suggestionsDismissed else { return [] }
    return feed.suggestions(text)
  }

  private func moveHash(_ step: Int) -> KeyPress.Result {
    guard !composing else { return .ignored }
    shell.suggestionsDismissed = false
    let options = hashOptions
    guard !options.isEmpty else { return .ignored }
    shell.hashIndex =
      shell.hashIndex < 0
      ? (step > 0 ? 0 : options.count - 1)
      : (shell.hashIndex + step + options.count) % options.count
    shell.hashScrollRequest += 1
    return .handled
  }

  private func selectEdge(last: Bool) -> KeyPress.Result {
    guard !composing, !hashOptions.isEmpty else { return .ignored }
    shell.hashIndex = last ? hashOptions.count - 1 : 0
    shell.hashScrollRequest += 1
    return .handled
  }

  private func pickHash() -> KeyPress.Result {
    let options = hashOptions
    guard !composing, !options.isEmpty, shell.hashIndex >= 0 else { return .ignored }
    let option = options[min(shell.hashIndex, options.count - 1)]
    if case .card(let id, _, _) = option.value {
      focused = false
      reader.open(id)
    } else {
      text = feed.pick(option, in: text)
    }
    shell.hashIndex = -1
    shell.suggestionsDismissed = true
    return .handled
  }
}

/// A # condition in the field: accent, removed with a click.
private struct HashToken: View {
  let label: String
  var tint = AppleColors.accent
  var foreground = AppleColors.fixedWhite
  let remove: () -> Void
  @State private var hovered = false
  var body: some View {
    Button(action: remove) {
      HStack(spacing: AppleMetrics.space4) {
        Text(label).lineLimit(1).fixedSize()
        Icon("x", size: AppleMetrics.font12)
          .opacity(hovered ? 1 : 0.6)
          .animation(Motion.hover, value: hovered)
      }
      .font(.sans(AppleMetrics.font13, .semibold))
      .foregroundStyle(foreground)
      .padding(.horizontal, AppleMetrics.searchTokenPaddingX)
      .frame(height: AppleMetrics.searchTokenHeight)
      .background(Capsule().fill(tint))
      .frame(height: AppleMetrics.space32)
      .contentShape(Rectangle())
    }
    .buttonStyle(SearchPress())
    .highPriorityGesture(TapGesture().onEnded { remove() })
    .onHover { hovered = $0 }
    .accessibilityLabel("\(Copy.text("web.search.removeCondition")) \(label)")
  }
}

/// Search controls respond without scaling or shifting their text.
private struct SearchPress: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(configuration.isPressed ? AppleMetrics.textLinkPressOpacity : 1)
      .animation(Motion.keyboardDriven ? nil : Motion.press, value: configuration.isPressed)
      .modifier(HandCursor())
  }
}

/// Matching cards and # conditions share the same keyboard-driven suggestion list.
struct HashList: View {
  @Environment(Reader.self) private var reader
  @Environment(Feed.self) private var feed
  @Environment(Shell.self) private var shell

  @Namespace private var highlight

  var body: some View {
    let options =
      shell.searchFocused && !shell.suggestionsDismissed ? feed.suggestions(shell.searchText) : []
    let visible = shell.searchFocused && !shell.suggestionsDismissed
    ZStack {
      if visible {
        ScrollViewReader { proxy in
          ScrollView {
            VStack(alignment: .leading, spacing: 0) {
              if options.isEmpty {
                Text(
                  Feed.searchText(shell.searchText).isEmpty
                    ? Copy.text("web.search.noSuggestions")
                    : Copy.text("web.search.noResultsPrefix") + Feed.searchText(shell.searchText)
                      + "」"
                )
                .font(.sans(AppleMetrics.font14)).foregroundStyle(AppleColors.secondary)
                .padding(AppleMetrics.space12)
              }
              ForEach(Array(options.enumerated()), id: \.element) { index, option in
                if option.group != "card", index == 0 || options[index - 1].group != option.group {
                  Text(
                    Copy.text(
                      option.group == "status" ? "web.search.hashStatus" : "web.search.hashTag")
                  )
                  .font(.sans(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
                  .padding(.horizontal, AppleMetrics.space10).frame(height: AppleMetrics.space28)
                }
                Button {
                  if case .card(let id, _, _) = option.value {
                    shell.blurSearch()
                    reader.open(id)
                  } else {
                    shell.searchText = feed.pick(option, in: shell.searchText)
                  }
                  shell.hashIndex = -1
                  shell.suggestionsDismissed = true
                } label: {
                  HStack(spacing: AppleMetrics.space12) {
                    Text(matched(option.label)).font(.sans(AppleMetrics.font14)).lineLimit(1)
                    Spacer(minLength: 0)
                    if let kind = feed.suggestionKind(option) {
                      HStack(spacing: AppleMetrics.space4) {
                        Icon(option.icon, size: AppleMetrics.space14)
                        Text(kind).font(.sans(AppleMetrics.font12))
                      }.foregroundStyle(AppleColors.secondary).frame(
                        width: AppleMetrics.space48, alignment: .trailing)
                    }
                    if feed.selected(option) { Icon("check", size: AppleMetrics.space16) }
                  }
                  .foregroundStyle(AppleColors.primary)
                  .padding(.horizontal, AppleMetrics.space10)
                  .frame(height: AppleMetrics.space40)
                  .background {
                    if shell.hashIndex == index {
                      RoundedRectangle(cornerRadius: AppleMetrics.space10).fill(AppleColors.faint)
                        .matchedGeometryEffect(id: "highlight", in: highlight)
                    }
                  }
                  .contentShape(Rectangle())
                }
                .buttonStyle(SearchPress())
                .modifier(HandCursor())
                .onHover { if $0 { shell.hashIndex = index } }
                .accessibilityAddTraits(shell.hashIndex == index ? .isSelected : [])
                .id(index)
              }
            }.padding(AppleMetrics.space4)
              .animation(
                Motion.keyboardDriven ? nil : Motion.ease(AppleMetrics.searchHighlightDuration),
                value: shell.hashIndex)
          }
          .scrollIndicators(.hidden)
          .frame(
            height: min(
              CGFloat(max(1, options.count)) * AppleMetrics.space40 + AppleMetrics.space8
                + CGFloat(Set(options.map(\.group)).subtracting(["card"]).count)
                * AppleMetrics.space28,
              AppleMetrics.searchSuggestionsHeight)
          )
          .onChange(of: shell.hashScrollRequest) {
            if options.indices.contains(shell.hashIndex) {
              Motion.instantly { proxy.scrollTo(shell.hashIndex) }
            }
          }
          .onAppear {
            if options.indices.contains(shell.hashIndex) {
              Motion.instantly { proxy.scrollTo(shell.hashIndex) }
            }
          }
        }
        .frame(width: shell.searchFrame.width)
        .background(
          RoundedRectangle(cornerRadius: AppleMetrics.scopeMenuRadius)
            .fill(AppleColors.card).shadow(.floating)
        )
        .onGeometryChange(for: CGRect.self) {
          $0.frame(in: .global)
        } action: {
          shell.hashFrame = $0
        }
        .onDisappear { shell.hashFrame = .zero }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Copy.text("web.search.hashList"))
        .accessibilityValue("\(options.count)" + Copy.text("web.search.suggestionCountSuffix"))
        .transition(
          .opacity.combined(with: .scale(scale: AppleMetrics.searchListScale, anchor: .top)))
      }
    }.animation(
      Motion.keyboardDriven
        ? nil
        : Motion.ease(visible ? AppleMetrics.searchAnimation : AppleMetrics.searchExitDuration),
      value: visible)
  }
  private func matched(_ label: String) -> AttributedString {
    var result = AttributedString(label)
    let needle = Feed.hashFragment(shell.searchText) ?? Feed.searchText(shell.searchText)
    if !needle.isEmpty, let range = result.range(of: needle, options: .caseInsensitive) {
      result[range].font = .sans(AppleMetrics.font14, .semibold)
    }
    return result
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
        .font(.sans(AppleMetrics.font14, .medium))
        .foregroundStyle(active ? AppleColors.card : AppleColors.primary)
        .padding(.horizontal, AppleMetrics.space14)
        .frame(height: AppleMetrics.space32)
        .background(Capsule().fill(active ? AppleColors.primary : AppleColors.surface))
    }
    .buttonStyle(SearchPress())
    .animation(Motion.keyboardDriven ? nil : Motion.fast, value: active)
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

/// Regular native glass keeps text legible over cards in both appearances.
private struct SearchGlass: ViewModifier {
  @ViewBuilder func body(content: Content) -> some View {
    if #available(macOS 26.0, *) {
      content.glassEffect(.regular, in: Capsule())
    } else {
      content.desktopGlass(Capsule())
    }
  }
}
