import SillKit
import SwiftUI

/// A card is a stack of blocks: cover · head · title · text · list (Web `cards/components.tsx`).
/// Only this card's `CardState` is observed here.
struct CardBody: View {
  let card: CardModel
  let state: CardState
  let context: CardContext

  var body: some View {
    switch card.kind {
    case .article: ArticleBody(card: card, state: state, context: context)
    case .mail: MailBody(card: card, context: context)
    case .note: NoteBody(card: card, state: state, context: context)
    case .task: TaskBody(card: card, state: state, context: context)
    case .event: EventBody(card: card, context: context)
    case .reminder: ReminderBody(card: card, state: state, context: context)
    case .media: MediaBody(card: card, state: state, context: context)
    case .digest: DigestBody(card: card, context: context)
    case .suggestion: SuggestionBody(card: card, context: context)
    case .photo: PhotoBody(card: card, state: state, context: context)
    case .file: FileBody(card: card, context: context)
    case .pr: BodyStack { PullRequestContent(card: card) }
    }
  }
}

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

private struct ReadingProgress: View {
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
    CoverImage(name: card.image, faded: faded)
      .aspectRatio(16 / 9, contentMode: .fit)
      .frame(maxWidth: .infinity)
      .overlay(alignment: .bottomTrailing) { overlay }
      .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius, style: .continuous))
      .padding([.horizontal, .top], AppleMetrics.coverInset)
  }
}

struct ArticleBody: View {
  let card: CardModel
  let state: CardState
  let context: CardContext
  @Environment(\.cardFaded) private var faded
  var body: some View {
    VStack(spacing: 0) {
      if card.image != nil, !context.compact {
        CardCover(card: card, faded: faded) { EmptyView() }
      }
      BodyStack(compact: context.compact) {
        // The same head as the article preview: source · day · reading time.
        CardHead(
          card: card,
          text: [
            card.publicationName, card.articleDate.map { Format.shortDay($0) } ?? "",
            card.readingTime,
          ].filter { !$0.isEmpty }.joined(separator: " · ")
        ) {
          ReadingProgress(card: card, state: state)
        }
        CardTitle(text: card.title, faded: faded, query: context.query)
        if !context.compact {
          SummaryBlock(
            summary: card.summary.isEmpty ? card.body.first ?? "" : card.summary,
            query: context.query
          )
        }
      }
    }
  }
}

struct MailBody: View {
  let card: CardModel
  let context: CardContext
  @Environment(\.cardFaded) private var faded
  var body: some View {
    BodyStack(compact: context.compact) {
      if let sender = card.sender {
        HStack(spacing: AppleMetrics.space10) {
          Avatar(name: sender, size: AppleMetrics.space32)
          VStack(alignment: .leading, spacing: 0) {
            Text(sender).textStyle(AppleMetrics.font14, .semibold).lineLimit(1)
              .foregroundStyle(AppleColors.primary)
            HStack(spacing: AppleMetrics.space4) {
              SourceIcon(card: card, size: AppleMetrics.font12)
              Text(
                [card.sourceName, card.sentAt.flatMap(Self.date) ?? "", card.readingTime]
                  .filter { !$0.isEmpty }.joined(separator: " · ")
              )
              .textStyle(AppleMetrics.font12).foregroundStyle(AppleColors.secondary).lineLimit(1)
            }
          }
        }
        .padding(.trailing, AppleMetrics.space30)
      } else {
        CardHead(
          card: card,
          text: [
            card.sourceName.isEmpty ? Copy.text("web.mail") : card.sourceName,
            card.sentAt.flatMap(Self.date) ?? "", card.readingTime,
          ].filter { !$0.isEmpty }.joined(separator: " · "))
      }
      CardTitle(text: card.title, faded: faded, query: context.query)
      if !context.compact {
        SummaryBlock(
          summary: card.summary.isEmpty ? card.body.first ?? "" : card.summary, query: context.query
        )
      }
      FlowRow(spacing: AppleMetrics.space6) {
        ForEach(Array(card.attachments.prefix(3).enumerated()), id: \.offset) { _, file in
          FileRow(name: file.name, image: file.isImage, pill: true)
        }
      }
      if card.attachments.count > 3 {
        MoreItems(
          count: card.attachments.count - 3, suffix: Copy.text("web.templates.7aaf96ad52e0"))
      }
    }
  }
  static func date(_ value: String) -> String? {
    ReaderContent.fullDate(value)
  }
}

struct NoteBody: View {
  let card: CardModel
  let state: CardState
  let context: CardContext
  @Environment(\.cardFaded) private var faded
  var body: some View {
    if card.isQuote {
      BodyStack(
        spacing: AppleMetrics.space10, bottom: AppleMetrics.space22, compact: context.compact
      ) {
        CardHead(card: card, text: card.displaySourceLine)
        Highlighted(text: card.title, query: context.query)
          .textStyle(
            AppleMetrics.font21, .medium, leading: AppleMetrics.quoteLeading,
            tracking: AppleMetrics.quoteTracking
          )
          .foregroundStyle(faded ? AppleColors.secondary : AppleColors.primary)
          .lineLimit(nil)
          .fixedSize(horizontal: false, vertical: true)

      }
    } else if card.isCapture {
      // A quick note is its own text; the title only names it in search and archives.
      BodyStack(compact: context.compact) {
        CardHead(card: card, text: card.displaySourceLine)
        Highlighted(text: card.summary.isEmpty ? card.title : card.summary, query: context.query)
          .textStyle(AppleMetrics.font15, leading: AppleMetrics.noteLeading)
          .foregroundStyle(faded ? AppleColors.secondary : AppleColors.primary)
          .lineLimit(nil)
          .frame(maxWidth: .infinity, alignment: .leading)
          .fixedSize(horizontal: false, vertical: true)

      }
    } else {
      BodyStack(compact: context.compact) {
        CardHead(card: card, text: card.displaySourceLine) {
          ReadingProgress(card: card, state: state)
        }
        CardTitle(text: card.title, faded: faded, query: context.query)
        if !context.compact {
          SummaryBlock(
            summary: card.summary.isEmpty ? card.body.first ?? "" : card.summary,
            query: context.query
          )
        }
      }
    }
  }
}

struct TaskBody: View {
  let card: CardModel
  let state: CardState
  let context: CardContext
  @Environment(\.cardIntents) private var intents
  @Environment(\.cardFaded) private var faded
  var body: some View {
    let tasks = state.tasks(of: card)
    let done = tasks.filter(\.done).count
    // Unfinished first, then finished; at most three.
    let visible = Array((tasks.filter { !$0.done } + tasks.filter(\.done)).prefix(3))
    BodyStack(compact: context.compact) {
      CardHead(
        card: card,
        text: card.project ?? Copy.text("web.task"),
        detail: card.due.map {
          Text(" · " + Copy.text("web.card.dueShort") + " " + Format.dateLabel($0)).foregroundColor(
            AppleColors.warning)
        }
      ) {
        if !tasks.isEmpty {
          Text("\(done)/\(tasks.count)").textStyle(AppleMetrics.font13, .semibold, number: true)
            .foregroundStyle(AppleColors.primary)
        }
      }
      CardTitle(text: card.title, faded: faded, query: context.query)
      if !tasks.isEmpty {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(visible) { task in
            TaskRow(task: task, locked: state.isWriting) { intents.toggleTask(card.id, task.id) }
          }
        }

        if tasks.count > 3 {
          MoreItems(count: tasks.count - 3, suffix: Copy.text("web.templates.f9d529eacdf3"))
        }
      } else if !context.compact {
        SummaryBlock(
          summary: card.summary.isEmpty ? card.body.first ?? "" : card.summary, query: context.query
        )
      }
    }
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

struct ReminderBody: View {
  let card: CardModel
  let state: CardState
  let context: CardContext
  @Environment(\.cardFaded) private var faded
  var body: some View {
    let when = FeedPolicy.reminderTime(card, state: state, now: context.now)
    BodyStack(compact: context.compact) {
      CardHead(
        card: card,
        text: Array(
          NSOrderedSet(array: [Copy.text("web.reminder"), card.sourceName].filter { !$0.isEmpty })
        )
        .compactMap { $0 as? String }.joined(separator: " · ")
      ) {
        if let when {
          Text(Format.reminderClock(when.at, now: context.now))
            .textStyle(AppleMetrics.font13, .medium, number: true)
            .foregroundStyle(when.due ? AppleColors.warning : AppleColors.secondary)
        }
      }
      HStack(alignment: .top, spacing: AppleMetrics.space10) {
        ReminderCheck(card: card, state: state)
          .padding(
            .top,
            (LineHeight.height(size: AppleMetrics.font16 * context.appearance.scale)
              - AppleMetrics.reminderDotSize) / 2)
        CardTitle(text: card.title, faded: faded, query: context.query)
      }

      if !card.summary.isEmpty, !context.compact {
        CardSummary(
          text: card.summary, query: context.query,
          indent: AppleMetrics.space28)
      }
    }
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

struct SuggestionBody: View {
  let card: CardModel
  let context: CardContext
  @Environment(\.cardIntents) private var intents
  @Environment(\.cardFaded) private var faded
  @Environment(\.relatedCards) private var related
  var body: some View {
    let all = card.related.compactMap(related)
    BodyStack(compact: context.compact) {
      CardHead(card: card, text: card.displaySourceLine)
      CardTitle(text: card.title, faded: faded, query: context.query)
      if !context.compact {
        SummaryBlock(
          summary: card.why?.reason
            ?? (card.summary.isEmpty ? card.body.first ?? "" : card.summary), query: context.query
        )
      }
      if !all.isEmpty {
        VStack(spacing: AppleMetrics.space6) {
          ForEach(all.prefix(2), id: \.id) { item in
            RelatedRow(card: item) { intents.open(item.id) }
          }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Copy.text("web.templates.9f2ab3a03303"))
        if all.count > 2 {
          MoreItems(count: all.count - 2, suffix: Copy.text("web.related.moreSuffix"), indent: 0)
        }
      }
    }
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

struct PhotoBody: View {
  let card: CardModel
  let state: CardState
  let context: CardContext
  @Environment(\.cardFaded) private var faded
  var body: some View {
    let photos = card.photos.isEmpty ? [card.image].compactMap { $0 } : card.photos
    VStack(spacing: 0) {
      if !context.compact {
        PhotoGrid(photos: Array(photos.prefix(3)), faded: faded)
          .aspectRatio(16 / 9, contentMode: .fit)
          .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius, style: .continuous))
          .padding([.horizontal, .top], AppleMetrics.coverInset)
      }
      BodyStack(compact: context.compact) {
        CardHead(
          card: card,
          text: [
            card.location ?? "",
            card.takenDay.map { Format.shortDay($0, now: Format.date(context.now)) } ?? "",
          ].filter { !$0.isEmpty }.joined(separator: " · ")
        ) {
          if !photos.isEmpty {
            Text("\(photos.count)" + Copy.text("web.common.cardCountSuffix")).textStyle(
              AppleMetrics.font12, number: true)
          }
        }
        CardTitle(text: card.title, faded: faded, query: context.query)
        if let caption = card.caption { CardSummary(text: caption, query: context.query) }
      }
    }
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

struct FileBody: View {
  let card: CardModel
  let context: CardContext
  @Environment(\.cardFaded) private var faded
  var body: some View {
    BodyStack(compact: context.compact) {
      CardHead(
        card: card,
        text: [Copy.text("web.file"), card.sourceName, card.readingTime].filter { !$0.isEmpty }
          .joined(separator: " · ")
      ) {
        if !card.files.isEmpty {
          Text(String(card.files.count) + Copy.text("web.card.fileCountSuffix")).textStyle(
            AppleMetrics.font12, number: true)
        }
      }
      CardTitle(text: card.title, faded: faded, query: context.query)
      if !context.compact { SummaryBlock(summary: card.summary, query: context.query) }
      VStack(alignment: .leading, spacing: AppleMetrics.space6) {
        ForEach(Array(card.files.prefix(3).enumerated()), id: \.offset) { _, file in
          FileRow(name: file.name, image: file.isImage, pill: true)
        }
      }
      .padding(.top, AppleMetrics.space2)

      if card.files.count > 3 {
        MoreItems(count: card.files.count - 3, suffix: Copy.text("web.templates.7aaf96ad52e0"))
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
