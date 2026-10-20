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
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Copy.text("web.preview.cardTools"))
  }

  private func button(_ action: ReaderAction) -> some View {
    ToolButton(icon: action.icon, label: action.label, active: action.active, accent: action.own) {
      intents.perform(action.kind, card.id)
    }
    .disabled(
      state.isWriting && action.kind != .open && action.kind != .reply && action.kind != .join)
  }
}

/// A 44 icon button. Active shared actions turn accent and fill their glyph.
struct ToolButton: View {
  let icon: String
  let label: String
  var active = false
  var accent = false
  let action: () -> Void
  @State private var pressed = false
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
    .buttonStyle(PressBackground())
    .accessibilityLabel(label)
    .help(label)
  }
}

/// `.icon-button:active` background.
struct PressBackground: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(Circle().fill(configuration.isPressed ? AppleColors.surface : .clear))
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
