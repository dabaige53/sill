import SillKit
import SwiftUI

/// One toolbar action: shared ones are ink, the card's own ones accent (at most three).
struct ReaderAction: Identifiable, Equatable {
  enum Kind: Equatable {
    case bookmark, tag, later, open, reply, join, snooze, restoreReminder, dismiss, download
  }
  let kind: Kind
  let key: String
  let icon: String
  let label: String
  var active = false
  var own = false
  var id: String { key + icon }
}

@MainActor enum ReaderTools {
  /// Web `tools` + `own`: shared actions, a divider, then up to three of the card's own actions,
  /// after removing unavailable and hidden ones.
  static func actions(card: CardModel, state: CardState, hidden: Set<String>) -> [ReaderAction] {
    let shared = [
      ReaderAction(
        kind: .bookmark, key: "bookmark", icon: "bookmark",
        label: Copy.text(state.bookmarked ? "web.preview.removeBookmark" : "web.bookmark"),
        active: state.bookmarked),
      ReaderAction(
        kind: .tag, key: "tag", icon: "tag", label: Copy.text("web.editor.openTagsAndNote")),
      ReaderAction(
        kind: .later, key: "later", icon: "glasses",
        label: Copy.text(state.later ? "web.preview.removeLater" : "web.later"), active: state.later
      ),
    ].filter { !hidden.contains($0.key) }
    let own = Array(
      ownActions(card: card, state: state).filter { !hidden.contains($0.key) }.prefix(3))
    return shared + own
  }

  private static func ownActions(card: CardModel, state: CardState) -> [ReaderAction] {
    func make(_ kind: ReaderAction.Kind, _ key: String, _ icon: String, _ label: String)
      -> ReaderAction
    {
      ReaderAction(kind: kind, key: key, icon: icon, label: label, own: true)
    }
    let reminder: ReaderAction? =
      card.kind.remindable
      ? (state.dismissed || state.snoozedUntil > 0 || (state.reminderDone && card.kind != .reminder)
        ? make(.restoreReminder, "snooze", "bell", Copy.text("web.templates.4b03be14c1f4"))
        : make(.snooze, "snooze", "snooze", Copy.text("web.reminder.again")))
      : nil
    let dismiss: ReaderAction? =
      card.kind.remindable && !(state.dismissed || state.reminderDone || state.snoozedUntil > 0)
      ? make(.dismiss, "dismiss", "bell-off", Copy.text("web.preview.dismissReminder")) : nil
    switch card.kind {
    case .mail:
      return card.url == nil ? [] : [make(.reply, "reply", "reply", Copy.text("web.preview.reply"))]
    case .event:
      let start = card.start ?? 0
      let join: ReaderAction? =
        card.meeting != nil
          && Format.eventTimely(start: start, end: card.end ?? start, now: Format.milliseconds())
        ? make(.join, "join", "video", Copy.text("web.templates.451755e3831f")) : nil
      let download = make(
        .download, "download", "download", Copy.text("web.preview.downloadCalendar"))
      return (join != nil ? [join, reminder, dismiss, download] : [reminder, download, dismiss])
        .compactMap { $0 }
    case .task, .reminder:
      return [reminder, dismiss].compactMap { $0 }
    case .file:
      return []
    default:
      return card.url == nil ? [] : [make(.open, "open", "external", externalLabel(card))]
    }
  }

  static func externalLabel(_ card: CardModel) -> String {
    if card.kind == .media, card.isPodcast { return Copy.text("web.preview.podcast.openApp") }
    let kind = SourceKind.label(card.sourceKind)
    let generic = ["RSS", Copy.text("web.local"), Copy.text("web.cards.e727b8cc2df0")]
    return Copy.text("web.preview.openSourcePrefix")
      + (kind.map { generic.contains($0) ? Copy.text("web.preview.originalSource") : $0 }
        ?? Copy.text("web.preview.originalSource"))
  }
}

/// The card toolbar: icons in one glass capsule, shared actions then a divider then own actions.
struct ReaderToolbar: View {
  let card: CardModel
  let state: CardState
  let actions: [ReaderAction]
  @Environment(\.readerIntents) private var intents
  @State private var tips = ToolbarTips()

  var body: some View {
    let shared = actions.filter { !$0.own }
    let own = actions.filter(\.own)
    HStack(spacing: AppleMetrics.space4) {
      ForEach(shared) { action in button(action) }
      if !shared.isEmpty, !own.isEmpty {
        Rectangle().fill(AppleColors.lineHover)
          .frame(width: AppleMetrics.lineWidth, height: AppleMetrics.toolbarSeparatorHeight)
          .padding(.horizontal, AppleMetrics.space6)
          .accessibilityHidden(true)
      }
      ForEach(own) { action in button(action) }
    }
    .padding(AppleMetrics.railInset)
    .frame(height: AppleMetrics.railRow)
    .glass(Capsule())
    .onHover { inside in if !inside { tips.leaveBar() } }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Copy.text("web.preview.cardTools"))
  }

  private func button(_ action: ReaderAction) -> some View {
    let edge: ToolbarTip.Edge =
      action.id == actions.first?.id
      ? .leading : action.id == actions.last?.id ? .trailing : .center
    return ToolButton(
      icon: action.icon, label: action.label, active: action.active, accent: action.own,
      help: false
    ) {
      intents.perform(action.kind, card.id)
    }
    .modifier(ToolbarTip(id: action.id, label: action.label, edge: edge, tips: tips))
    .disabled(
      state.isWriting && action.kind != .open && action.kind != .reply && action.kind != .join)
  }
}

/// A 44 icon button (Web `.icon-button`). Active shared actions turn accent and fill their glyph.
struct ToolButton: View {
  let icon: String
  let label: String
  var active = false
  var accent = false
  /// The system help tag; off where the toolbar draws its own name (`ToolbarTip`).
  var help = true
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      ZStack {
        if active {
          IconFill(name: icon, size: AppleMetrics.font18).foregroundStyle(
            AppleColors.accent.opacity(0.9))
        }
        Icon(icon, size: AppleMetrics.font18)
      }
      .foregroundStyle(active || accent ? AppleColors.accent : AppleColors.primary)
      .frame(width: AppleMetrics.iconButton, height: AppleMetrics.iconButton)
      .contentShape(Circle())
    }
    .buttonStyle(IconPress())
    .accessibilityLabel(label)
    .help(help ? label : "")
  }
}

/// Toolbar names (interaction.md, Web `toolbarTips`): the first hover shows a name after 0.5s;
/// once one is showing, moving to another tool in the same bar shows its name at once, until the
/// pointer leaves the bar. Keyboard focus shows the name too.
@MainActor @Observable final class ToolbarTips {
  private(set) var shown: String?
  @ObservationIgnored private var warm = false
  @ObservationIgnored private var timer: Task<Void, Never>?

  func enter(_ id: String) {
    timer?.cancel()
    if warm {
      shown = id
      return
    }
    timer = Task { [weak self] in
      try? await Task.sleep(for: .seconds(AppleMetrics.tipDelay))
      guard let self, !Task.isCancelled else { return }
      self.shown = id
      self.warm = true
    }
  }

  func leave(_ id: String) {
    timer?.cancel()
    if shown == id { shown = nil }
  }

  func leaveBar() {
    timer?.cancel()
    warm = false
    shown = nil
  }
}

/// Web `.float-bar .icon-button::after`: the name above the tool, `ink` with `card` text; the
/// first and last tools open their names inward.
struct ToolbarTip: ViewModifier {
  enum Edge { case leading, center, trailing }
  let id: String
  let label: String
  let edge: Edge
  let tips: ToolbarTips
  @FocusState private var focused: Bool

  func body(content: Content) -> some View {
    let alignment: Alignment =
      edge == .leading ? .topLeading : edge == .trailing ? .topTrailing : .top
    content
      .focused($focused)
      .onHover { inside in inside ? tips.enter(id) : tips.leave(id) }
      .overlay(alignment: alignment) {
        if tips.shown == id || (focused && Keyboard.focusVisible) {
          Text(label)
            .font(.sans(AppleMetrics.font13, .medium))
            .foregroundStyle(AppleColors.card)
            .lineLimit(1)
            .fixedSize()
            .padding(.vertical, AppleMetrics.space6)
            .padding(.horizontal, AppleMetrics.space10)
            .background(
              RoundedRectangle(cornerRadius: AppleMetrics.tipRadius).fill(AppleColors.primary)
            )
            .alignmentGuide(.top) { $0[.bottom] + AppleMetrics.tipGap }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
      }
  }
}

/// The filled form of a glyph, for active toolbar icons (`fill: currentColor`).
struct IconFill: View {
  let name: String
  let size: CGFloat
  var body: some View {
    let glyph = IconGlyph.named(name)
    Canvas { context, canvas in
      let scale = canvas.width / 24
      for layer in glyph.layers {
        context.fill(
          layer.path.applying(CGAffineTransform(scaleX: scale, y: scale)), with: .foreground)
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

/// What reader toolbar buttons do. Not observable.
/// Set once on the main actor before any view reads it.
final class ReaderIntents: @unchecked Sendable {
  var perform: @MainActor (ReaderAction.Kind, String) -> Void = { _, _ in }
}

private struct ReaderIntentsKey: EnvironmentKey {
  static let defaultValue = ReaderIntents()
}

extension EnvironmentValues {
  var readerIntents: ReaderIntents {
    get { self[ReaderIntentsKey.self] }
    set { self[ReaderIntentsKey.self] = newValue }
  }
}
