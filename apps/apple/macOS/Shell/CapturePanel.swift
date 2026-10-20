import SillKit
import SwiftUI

/// Web `Panels.capture` (N): one field for a note or a link, the next meeting within three hours
/// with its join button when it is near, and 「存」. ⌘↩ saves. Saving closes the panel; a
/// duplicate shows its notice and makes no card.
struct CapturePanel: View {
  @Environment(Workspace.self) private var workspace
  @Environment(Panels.self) private var panels
  @State private var text = ""
  @FocusState private var focused: Bool

  var body: some View {
    let now = Format.milliseconds()
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top, spacing: AppleMetrics.space10) {
        Icon("plus", size: AppleMetrics.font18)
          .foregroundStyle(AppleColors.iconSecondary)
          .padding(.top, AppleMetrics.space12)
        ZStack(alignment: .topLeading) {
          if text.isEmpty {
            Text(Copy.text("web.capture.placeholder"))
              .textStyle(AppleMetrics.font16, leading: AppleMetrics.captureLeading)
              .foregroundStyle(AppleColors.secondary)
              .padding(.vertical, AppleMetrics.space10)
              .allowsHitTesting(false)
          }
          TextEditor(text: $text)
            .scrollContentBackground(.hidden)
            .textStyle(AppleMetrics.font16, leading: AppleMetrics.captureLeading)
            .foregroundStyle(AppleColors.primary)
            .padding(.vertical, AppleMetrics.space10)
            .padding(.horizontal, -AppleMetrics.space4)
            .frame(minHeight: AppleMetrics.captureMinHeight)
            .focused($focused)
            .accessibilityLabel(Copy.text("web.capture.placeholder"))
            .onChange(of: text) { _, value in
              if value.count > Capture.limit { text = String(value.prefix(Capture.limit)) }
            }
        }
      }
      .padding(.vertical, AppleMetrics.space4)
      .padding(.trailing, AppleMetrics.space44)
      if let event = Self.nextEvent(workspace.cards, now: now) {
        NextEvent(card: event, now: now)
      }
      HStack(spacing: AppleMetrics.space12) {
        HStack(spacing: AppleMetrics.space4) {
          Kbd(key: "N")
          Text(Copy.text("web.capture.shortcutHint"))
        }
        .font(.sans(AppleMetrics.font13))
        .foregroundStyle(AppleColors.secondary)
        Spacer(minLength: 0)
        Button(Copy.text("web.capture.save"), action: save)
          .buttonStyle(SolidButtonStyle())
          .keyboardShortcut(.return, modifiers: .command)
      }
      .padding(.top, AppleMetrics.space22)
    }
    .accessibilityLabel(Copy.text("web.capture.title"))
    .onAppear { focused = true }
  }

  private func save() {
    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    panels.close()
    workspace.capture(text)
  }

  /// The next meeting that has not ended and starts within three hours.
  static func nextEvent(_ cards: [CardModel], now: Double) -> CardModel? {
    cards
      .filter { card in
        guard card.kind == .event, let start = card.start, let end = card.end else { return false }
        return end > now && start - now < 3 * 3_600_000
      }
      .min { ($0.start ?? 0) < ($1.start ?? 0) }
  }
}

/// Web `.next-event`: the start time large, the title with how soon in accent, and 「加入」 when
/// the meeting is near and has a link.
private struct NextEvent: View {
  let card: CardModel
  let now: Double
  var body: some View {
    let start = card.start ?? 0
    let end = card.end ?? 0
    HStack(spacing: AppleMetrics.space12) {
      Text(Format.time(start)).font(.number(AppleMetrics.font20, .semibold))
        .foregroundStyle(AppleColors.primary)
      VStack(alignment: .leading, spacing: 0) {
        Text(card.title).font(.sans(AppleMetrics.font14, .medium))
          .foregroundStyle(AppleColors.primary).lineLimit(1)
        Text(Format.eventRelative(start: start, end: end, now: now))
          .font(.sans(AppleMetrics.font12)).foregroundStyle(AppleColors.accent)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if Format.eventTimely(start: start, end: end, now: now), let url = card.meeting?.url {
        Button(Copy.text("web.templates.451755e3831f")) { NSWorkspace.shared.open(url) }
          .buttonStyle(SolidButtonStyle())
      }
    }
    .padding(.vertical, AppleMetrics.space12)
    .padding(.horizontal, AppleMetrics.space14)
    .background(
      RoundedRectangle(cornerRadius: AppleMetrics.nextEventRadius, style: .continuous)
        .fill(AppleColors.surface)
    )
    .padding(.top, AppleMetrics.space8)
  }
}
