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
    }
  }
}

/// Faded: read (when the preference is on), an ended event, or finished work.
@MainActor func cardFaded(_ card: CardModel, _ state: CardState, _ context: CardContext) -> Bool {
  (card.kind.readable && state.read && context.fadeRead)
    || (card.kind == .event && context.now >= (card.end ?? .infinity))
    || ((card.kind == .task || card.kind == .reminder) && state.completed(card))
}

/// Desktop rhythm: head → title 12, title → summary 6, text → list 12 (web-interaction.md).
struct BodyStack<Content: View>: View {
  var spacing = AppleMetrics.space8
  var bottom = AppleMetrics.cardPadding
  var compact = false
  @ViewBuilder var content: Content
  var body: some View {
    VStack(alignment: .leading, spacing: spacing) { content }
      .padding(.horizontal, AppleMetrics.cardPadding)
      .padding(.top, compact ? AppleMetrics.compactCardPaddingY : AppleMetrics.cardPadding)
      .padding(.bottom, compact ? AppleMetrics.compactCardPaddingY : bottom)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

extension View {
  /// Head → title adds 4 to the block gap; title → summary removes 2; lists add 4.
  func afterHead() -> some View { padding(.top, AppleMetrics.space4) }
  func afterTitle() -> some View { padding(.top, -AppleMetrics.space2) }
  func beforeList() -> some View { padding(.top, AppleMetrics.space4) }
}

private struct ReadingProgress: View {
  let card: CardModel
  let state: CardState
  var body: some View {
    if card.kind.readable, !state.read, state.progress > 0 {
      HStack(spacing: AppleMetrics.space4) {
        ProgressRing(progress: state.progress)
        Text("\(Int((state.progress * 100).rounded()))%").font(
          .number(AppleMetrics.font13, .medium))
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
        CardHead(card: card, text: card.sourceLine) {
          ReadingProgress(card: card, state: state)
        }
        CardTitle(text: card.title, faded: faded, query: context.query).afterHead()
        if !context.compact {
          SummaryBlock(
            summary: card.summary, points: card.points,
            lines: Int(AppleMetrics.cardReadingSummaryLines), query: context.query
          ).afterTitle()
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
          Avatar(name: sender)
          VStack(alignment: .leading, spacing: 0) {
            Text(sender).font(.sans(AppleMetrics.font15, .semibold)).lineLimit(1)
              .foregroundStyle(AppleColors.primary)
            Text(
              [Copy.text("web.mail"), card.sentAt.flatMap(Self.date) ?? "", card.readingTime]
                .filter { !$0.isEmpty }.joined(separator: " · ")
            )
            .font(.sans(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary).lineLimit(1)
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
      CardTitle(text: card.title, faded: faded, query: context.query).afterHead()
      if !context.compact {
        SummaryBlock(
          summary: card.summary, points: card.points, lines: Int(AppleMetrics.cardReadingSummaryLines),
          query: context.query
        ).afterTitle()
      }
      if let attachment = card.attachment {
        FileRow(name: attachment).padding(.trailing, AppleMetrics.space12).beforeList()
      }
    }
  }
  static func date(_ value: String) -> String? {
    Format.parseDate(value).map { Format.dateLabel($0.timeIntervalSince1970 * 1000) }
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
        CardHead(card: card, text: card.sourceLine)
        Highlighted(text: card.title, query: context.query)
          .textStyle(
            AppleMetrics.font21, .medium, leading: AppleMetrics.quoteLeading,
            tracking: AppleMetrics.quoteTracking
          )
          .foregroundStyle(faded ? AppleColors.secondary : AppleColors.primary)
          .lineLimit(Int(AppleMetrics.quoteLines))
          .fixedSize(horizontal: false, vertical: true)
          .afterHead()
      }
    } else if card.isCapture {
      // A quick note is its own text; the title only names it in search and archives.
      BodyStack(compact: context.compact) {
        CardHead(card: card, text: card.sourceLine)
        Highlighted(text: card.summary.isEmpty ? card.title : card.summary, query: context.query)
          .textStyle(AppleMetrics.font15, leading: AppleMetrics.noteLeading)
          .foregroundStyle(faded ? AppleColors.secondary : AppleColors.primary)
          .lineLimit(Int(AppleMetrics.noteLines))
          .frame(maxWidth: .infinity, alignment: .leading)
          .fixedSize(horizontal: false, vertical: true)
          .afterHead()
      }
    } else {
      BodyStack(compact: context.compact) {
        CardHead(card: card, text: card.sourceLine) { ReadingProgress(card: card, state: state) }
        CardTitle(text: card.title, faded: faded, query: context.query).afterHead()
        if !context.compact {
          SummaryBlock(
            summary: card.summary, points: card.points, lines: context.summaryLines,
            query: context.query
          ).afterTitle()
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
      CardHead(card: card, text: card.project ?? Copy.text("web.task")) {
        if !tasks.isEmpty {
          Text("\(done)/\(tasks.count)").font(.number(AppleMetrics.font13, .semibold))
            .foregroundStyle(AppleColors.primary)
        }
      }
      CardTitle(text: card.title, faded: faded, query: context.query).afterHead()
      if !tasks.isEmpty {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(visible) { task in
            TaskRow(task: task, locked: state.isWriting) { intents.toggleTask(card.id, task.id) }
          }
        }
        .beforeList()
        if tasks.count > 3 {
          MoreItems(count: tasks.count - 3, suffix: Copy.text("web.templates.f9d529eacdf3"))
        }
      } else if !context.compact {
        SummaryBlock(
          summary: card.summary, points: card.points, lines: context.summaryLines,
          query: context.query
        ).afterTitle()
      }
    }
  }
}

/// A task row is its own checkbox. It takes the click; the card never sees it.
struct TaskRow: View {
  let task: CardModel.TaskItem
  var locked = false
  var large = false
  let toggle: () -> Void
  @State private var hovered = false
  var body: some View {
    Button(action: toggle) {
      HStack(alignment: large ? .center : .top, spacing: AppleMetrics.space10) {
        CheckDot(done: task.done, highlighted: hovered && !task.done)
          .padding(.top, large ? 0 : AppleMetrics.space2)
        Text(task.text)
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
    .buttonStyle(.plain)
    .disabled(locked)
    .onHover { hovered = $0 }
    .accessibilityLabel(task.text)
    .accessibilityValue(
      Copy.text(task.done ? "web.templates.f28461bb49c8" : "web.templates.6707de42c29d")
    )
    .accessibilityAddTraits(.isToggle)
  }
}

struct EventBody: View {
  let card: CardModel
  let context: CardContext
  @Environment(\.cardIntents) private var intents
  @Environment(\.cardFaded) private var faded
  var body: some View {
    let start = card.start ?? 0
    let end = card.end ?? start
    let relative = Format.eventRelative(start: start, end: end, now: context.now)
    let timely = card.meeting != nil && Format.eventTimely(start: start, end: end, now: context.now)
    BodyStack(compact: context.compact) {
      CardHead(card: card, text: Format.dateLabel(start)) {
        if !relative.isEmpty {
          Text(relative).font(.sans(AppleMetrics.font13, .medium)).foregroundStyle(
            AppleColors.accent)
        }
      }
      HStack(alignment: .bottom, spacing: AppleMetrics.space12) {
        Text(Format.time(start))
          .textStyle(
            AppleMetrics.font34, .semibold, leading: AppleMetrics.eventStartLeading,
            tracking: AppleMetrics.cardTitleTracking, number: true
          )
          .foregroundStyle(faded ? AppleColors.secondary : AppleColors.primary)
        Spacer(minLength: 0)
        VStack(alignment: .trailing, spacing: 0) {
          Text("\(Copy.text("web.templates.83532308ecca"))\(Format.time(end))")
            .font(.number(AppleMetrics.font15, .medium))
          Text(
            "\(Copy.text("web.templates.2428420e407f"))\(Int(((end - start) / 60000).rounded()))\(Copy.text("web.templates.40de54344d22"))"
          )
          .font(.sans(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
        }
        .foregroundStyle(AppleColors.primary)
        .padding(.bottom, AppleMetrics.space3)
      }
      .padding(.top, AppleMetrics.space4)
      CardTitle(text: card.title, faded: faded, query: context.query)
      if !card.people.isEmpty {
        HStack(spacing: AppleMetrics.space8) {
          Avatars(names: card.people)
          Text(card.people.joined(separator: "、")).lineLimit(1)
        }
        .font(.sans(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
        .padding(.top, AppleMetrics.space4)
      }
      if timely, let meeting = card.meeting {
        HStack(spacing: AppleMetrics.space8) {
          Button {
            intents.join(card.id)
          } label: {
            Text(Copy.text("web.templates.451755e3831f"))
              .font(.sans(AppleMetrics.font13, .medium))
              .foregroundStyle(AppleColors.fixedWhite)
              .padding(.horizontal, AppleMetrics.pillPaddingX)
              .frame(minWidth: AppleMetrics.primaryMinWidth, minHeight: AppleMetrics.pillHeight)
              .background(Capsule().fill(AppleColors.accentFill))
          }
          .buttonStyle(PrimaryPillStyle())
          .accessibilityLabel("\(Copy.text("web.templates.451755e3831f"))\(meeting.name)")
        }
        .padding(.top, AppleMetrics.space8)
      }
    }
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
            .font(.number(AppleMetrics.font13, .medium))
            .foregroundStyle(when.due ? AppleColors.warning : AppleColors.secondary)
        }
      }
      HStack(spacing: AppleMetrics.space12) {
        ReminderCheck(card: card, state: state)
        CardTitle(text: card.title, faded: faded, query: context.query)
      }
      .afterHead()
      if !card.summary.isEmpty, !context.compact {
        CardSummary(
          text: card.summary, lines: context.summaryLines, query: context.query,
          indent: AppleMetrics.space34)
      }
    }
  }
}

/// The reminder's only action: a 44 target around a 22 circle. It changes Sill state only.
struct ReminderCheck: View {
  let card: CardModel
  let state: CardState
  @Environment(\.cardIntents) private var intents
  @State private var hovered = false
  var body: some View {
    let done = state.reminderDone
    Button {
      intents.reminder(card.id, done ? .restore : .complete)
    } label: {
      CheckDot(
        done: done, size: AppleMetrics.reminderDotSize, line: AppleMetrics.reminderDotLine,
        highlighted: hovered && !done
      )
      .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
      .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .padding(-AppleMetrics.space11)
    .disabled(state.isWriting)
    .onHover { hovered = $0 }
    .accessibilityLabel(Copy.text(done ? "web.reminder.restore" : "web.reminder.complete"))
    .accessibilityAddTraits(done ? .isSelected : [])
  }
}

struct MediaBody: View {
  let card: CardModel
  let state: CardState
  let context: CardContext
  @Environment(\.cardFaded) private var faded
  var body: some View {
    if card.isPodcast {
      BodyStack(compact: context.compact) {
        CardHead(card: card, text: card.sourceLine) { ReadingProgress(card: card, state: state) }
        CardTitle(text: card.title, faded: faded, query: context.query).afterHead()
        if !context.compact {
          SummaryBlock(summary: card.summary, points: card.points, lines: 2, query: context.query)
            .afterTitle()
        }
        if let duration = card.duration {
          Text(Format.duration(duration)).font(.number(AppleMetrics.font12))
            .foregroundStyle(AppleColors.secondary).padding(.top, AppleMetrics.space4)
        }
      }
    } else {
      VStack(spacing: 0) {
        if card.image != nil, !context.compact {
          CardCover(card: card, faded: faded) {
            if let duration = card.duration {
              Text(Format.duration(duration)).font(.number(AppleMetrics.font12))
                .foregroundStyle(AppleColors.fixedWhite)
                .padding(.horizontal, AppleMetrics.space8).padding(.vertical, AppleMetrics.space2)
                .background(
                  RoundedRectangle(cornerRadius: AppleMetrics.mediaLengthRadius)
                    .fill(AppleColors.fixedBlack55)
                )
                .padding(AppleMetrics.space12)
            }
          }
        }
        BodyStack(compact: context.compact) {
          CardHead(card: card, text: card.sourceLine) {
            ReadingProgress(card: card, state: state)
          }
          CardTitle(text: card.title, faded: faded, query: context.query).afterHead()
        }
      }
    }
  }
}

struct DigestBody: View {
  let card: CardModel
  let context: CardContext
  @Environment(\.cardFaded) private var faded
  var body: some View {
    BodyStack(compact: context.compact) {
      CardHead(card: card, text: card.sourceLine)
      CardTitle(text: card.title, faded: faded, query: context.query).afterHead()
      if !context.compact {
        SummaryBlock(
          summary: card.summary.isEmpty && card.points.isEmpty
            ? card.body.first ?? "" : card.summary,
          points: card.points, lines: context.summaryLines, query: context.query
        ).afterTitle()
      }
    }
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
      CardHead(card: card, text: card.sourceLine)
      CardTitle(text: card.title, faded: faded, query: context.query).afterHead()
      if !context.compact {
        SummaryBlock(
          summary: card.summary, points: card.points, lines: context.summaryLines,
          query: context.query
        ).afterTitle()
      }
      if !all.isEmpty {
        VStack(spacing: AppleMetrics.space8) {
          ForEach(all.prefix(2), id: \.id) { item in
            RelatedRow(card: item) { intents.open(item.id) }
          }
        }
        .padding(.top, AppleMetrics.space4)
        .beforeList()
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
  var background = AppleColors.canvas
  let open: () -> Void
  var body: some View {
    Button(action: open) {
      HStack(spacing: AppleMetrics.space8) {
        Icon(card.kind.icon, size: AppleMetrics.font15).foregroundStyle(AppleColors.iconSecondary)
        Text(card.title).lineLimit(1).truncationMode(.tail)
          .frame(maxWidth: .infinity, alignment: .leading)
        Icon("chevron", size: AppleMetrics.font14).foregroundStyle(AppleColors.iconSecondary)
      }
      .font(.sans(AppleMetrics.font13))
      .foregroundStyle(AppleColors.primary)
      .padding(.horizontal, AppleMetrics.space10)
      .frame(minHeight: AppleMetrics.refRowHeight)
    }
    .buttonStyle(RowStyle(fill: background))
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
          text: [Copy.text("web.photo"), card.location ?? ""].filter { !$0.isEmpty }
            .joined(separator: " · ")
        ) {
          if photos.count > 3 { Text("\(photos.count)").font(.number(AppleMetrics.font13)) }
        }
        CardTitle(text: card.title, faded: faded, query: context.query).afterHead()
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
          .joined(separator: " · "))
      CardTitle(text: card.title, faded: faded, query: context.query).afterHead()
      VStack(alignment: .leading, spacing: AppleMetrics.space2) {
        ForEach(Array(card.files.prefix(3).enumerated()), id: \.offset) { _, file in
          FileRow(name: file.name, image: file.isImage)
        }
      }
      .padding(.top, AppleMetrics.space2)
      .beforeList()
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
