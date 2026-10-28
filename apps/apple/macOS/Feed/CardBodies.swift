import SillKit
import SwiftUI

/// Faded: read (when the preference is on), an ended event, or finished work.
@MainActor func cardFaded(_ card: CardModel, _ state: CardState, _ context: CardContext) -> Bool {
  (card.kind.readable && state.read && context.fadeRead)
    || (card.kind == .event && context.now >= (card.end ?? .infinity))
    || ((card.kind == .task || card.kind == .reminder) && state.completed(card))
}

/// The HTML card body uses one 8-point gap between content blocks.
struct BodyStack<Content: View>: View {
  var spacing = AppleMetrics.space8
  var bottom = AppleMetrics.cardPadding
  var compact = false
  @ViewBuilder var content: Content
  @Environment(\.cardPaddingScale) private var paddingScale
  var body: some View {
    VStack(alignment: .leading, spacing: spacing * paddingScale) { content }
      .padding(.horizontal, AppleMetrics.cardPadding * paddingScale)
      .padding(
        .top, (compact ? AppleMetrics.compactCardPaddingY : AppleMetrics.cardPadding) * paddingScale
      )
      .padding(.bottom, (compact ? AppleMetrics.compactCardPaddingY : bottom) * paddingScale)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct ReadingProgress: View {
  let card: CardModel
  let state: CardState
  var body: some View {
    let progress =
      card.kind == .media
      ? (card.duration.map { $0 > 0 ? min(1, state.playbackPosition / Double($0)) : 0 } ?? 0)
      : state.progress
    if card.kind.readable, !state.read, progress > 0 {
      HStack(spacing: AppleMetrics.space4) {
        ProgressRing(progress: progress)
        Text("\(Int((progress * 100).rounded()))%").textStyle(
          AppleMetrics.font13, .medium, number: true)
      }
      .foregroundStyle(AppleColors.accent)
    }
  }
}

struct CardCover<Overlay: View>: View {
  let card: CardModel
  var faded = false
  @ViewBuilder var overlay: Overlay
  var body: some View {
    CoverImage(name: card.cover, faded: faded)
      .aspectRatio(16 / 9, contentMode: .fit)
      .frame(maxWidth: .infinity)
      .overlay(alignment: .bottomTrailing) { overlay }
      .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius, style: .continuous))
      .padding([.horizontal, .top], AppleMetrics.coverInset)
  }
}

/// A task row is its own checkbox. It takes the click; the card never sees it.
struct TaskRow: View {
  @Environment(\.contentAppearance) private var appearance
  let task: CardModel.TaskItem
  var locked = false
  var large = false
  let toggle: () -> Void
  @State private var hovered = false
  var body: some View {
    Button(action: toggle) {
      HStack(alignment: .top, spacing: AppleMetrics.space10) {
        CheckDot(
          done: task.done, size: large ? AppleMetrics.taskDotSize : AppleMetrics.space18,
          highlighted: hovered && !task.done
        )
        .padding(
          .top,
          (LineHeight.height(
            size: (large ? AppleMetrics.font15 : AppleMetrics.font14) * appearance.scale)
            - (large ? AppleMetrics.taskDotSize : AppleMetrics.space18)) / 2)
        Text(task.text)
          .strikethrough(task.done)
          .textStyle(
            large ? AppleMetrics.font15 : AppleMetrics.font14, leading: AppleMetrics.summaryLeading
          )
          .foregroundStyle(task.done ? AppleColors.secondary : AppleColors.primary)
          .lineLimit(large ? nil : 2)
          .frame(maxWidth: .infinity, alignment: .leading)
          .fixedSize(horizontal: false, vertical: true)
      }
      .padding(.vertical, AppleMetrics.space2)
      .frame(minHeight: large ? AppleMetrics.hitTarget : AppleMetrics.checkRowHeight)
      .contentShape(Rectangle())
    }
    .buttonStyle(CheckPress())
    .disabled(locked)
    .onHover { hovered = $0 }
    .accessibilityLabel(task.text)
    .accessibilityValue(
      Copy.text(task.done ? "web.templates.f28461bb49c8" : "web.templates.6707de42c29d")
    )
    .accessibilityAddTraits(.isToggle)
  }
}

/// A 44-point target around the reminder circle. It changes Sill state only.
struct ReminderCheck: View {
  let card: CardModel
  let state: CardState
  var large = false
  private var size: CGFloat { large ? AppleMetrics.space24 : AppleMetrics.reminderDotSize }
  @Environment(\.cardIntents) private var intents
  @State private var hovered = false
  var body: some View {
    let done = state.reminderDone
    Button {
      intents.reminder(card.id, done ? .restore : .complete)
    } label: {
      CheckDot(
        done: done, size: size, line: AppleMetrics.reminderDotLine,
        highlighted: hovered && !done
      )
      .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
      .contentShape(Circle())
    }
    .buttonStyle(CheckPress())
    .padding((size - AppleMetrics.hitTarget) / 2)
    .disabled(state.isWriting)
    .onHover { hovered = $0 }
    .accessibilityLabel(Copy.text(done ? "web.reminder.restore" : "web.reminder.complete"))
    .accessibilityAddTraits(done ? .isSelected : [])
  }
}

struct RelatedRow: View {
  let card: CardModel
  var background = AppleColors.surface
  let open: () -> Void
  var body: some View {
    Button(action: open) {
      HStack(spacing: AppleMetrics.space8) {
        Icon(card.kind.icon, size: AppleMetrics.font15).foregroundStyle(AppleColors.iconSecondary)
        Text(card.title).lineLimit(1).truncationMode(.tail)
          .frame(maxWidth: .infinity, alignment: .leading)
        Icon("chevron", size: AppleMetrics.font14).foregroundStyle(AppleColors.iconSecondary)
      }
      .textStyle(AppleMetrics.font13)
      .foregroundStyle(AppleColors.primary)
      .padding(.horizontal, AppleMetrics.space10)
      .padding(.vertical, AppleMetrics.space9)
    }
    .buttonStyle(RowStyle(fill: background, radius: AppleMetrics.space12))
  }
}

struct PhotoGrid: View {
  let photos: [String]
  var faded = false
  var body: some View {
    let gap = AppleMetrics.space2
    switch photos.count {
    case 0: Cover.tone(nil)
    case 1: CoverImage(name: photos[0], faded: faded)
    case 2:
      HStack(spacing: gap) {
        CoverImage(name: photos[0], faded: faded)
        CoverImage(name: photos[1], faded: faded)
      }
    default:
      GeometryReader { proxy in
        HStack(spacing: gap) {
          CoverImage(name: photos[0], faded: faded)
            .frame(width: (proxy.size.width - gap) * 2 / 3)
          VStack(spacing: gap) {
            CoverImage(name: photos[1], faded: faded)
            CoverImage(name: photos[2], faded: faded)
          }
        }
      }
    }
  }
}

private struct CardFadedKey: EnvironmentKey { static let defaultValue = false }
private struct RelatedCardsKey: EnvironmentKey {
  static let defaultValue: @MainActor @Sendable (String) -> CardModel? = { _ in nil }
}

extension EnvironmentValues {
  /// Set by the tile from its own state, so card bodies do not compute it again.
  var cardFaded: Bool {
    get { self[CardFadedKey.self] }
    set { self[CardFadedKey.self] = newValue }
  }
  /// Looks up related cards without observing the workspace.
  var relatedCards: @MainActor @Sendable (String) -> CardModel? {
    get { self[RelatedCardsKey.self] }
    set { self[RelatedCardsKey.self] = newValue }
  }
}
