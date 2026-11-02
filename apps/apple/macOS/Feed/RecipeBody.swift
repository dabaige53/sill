import SillKit
import SwiftUI

extension CardModel {
  /// The recipe for this card: its type, or a variant for media and quote notes (Web `recipeKey`).
  var recipeKey: String {
    switch kind {
    case .media: isPodcast ? "media.podcast" : "media.video"
    case .note where isQuote: "note.quote"
    default: CardRecipes.has(kind.rawValue) ? kind.rawValue : "default"
    }
  }
}

/// A card is a stack of blocks; the recipe in design-system/recipes.json names them
/// (Web `cards/card-face.tsx`). Only this card's `CardState` is observed here.
struct CardBody: View {
  let card: CardModel
  let state: CardState
  let context: CardContext

  private static let topMedia: Set<String> = ["cover", "videoCover", "mosaic"]

  var body: some View {
    let recipe = CardRecipes.card(card.recipeKey)
    if recipe.contains(where: { $0.name == "pullRequest" }) {
      BodyStack { PullRequestContent(card: card) }
    } else {
      let top = recipe.filter { Self.topMedia.contains($0.name) }
      let rest = recipe.filter { !Self.topMedia.contains($0.name) }
      let quote = rest.contains { $0.name == "quote" }
      VStack(spacing: 0) {
        ForEach(Array(top.enumerated()), id: \.offset) { _, entry in
          CardBlock(entry: entry, card: card, state: state, context: context)
        }
        BodyStack(
          spacing: quote ? AppleMetrics.space10 : AppleMetrics.space8,
          bottom: quote ? AppleMetrics.space22 : AppleMetrics.cardPadding,
          compact: context.compact
        ) {
          ForEach(Array(rest.enumerated()), id: \.offset) { _, entry in
            CardBlock(entry: entry, card: card, state: state, context: context)
          }
        }
      }
    }
  }
}

/// One recipe entry on the card face: a block, or a layout group of blocks.
struct CardBlock: View {
  let entry: RecipeEntry
  let card: CardModel
  let state: CardState
  let context: CardContext
  @Environment(\.cardFaded) private var faded
  @Environment(\.cardIntents) private var intents
  @Environment(\.relatedCards) private var related

  var body: some View {
    if case .group(let name, let children) = entry {
      group(name, children)
    } else {
      block
    }
  }

  private func child(_ entry: RecipeEntry) -> AnyView {
    AnyView(CardBlock(entry: entry, card: card, state: state, context: context))
  }

  @ViewBuilder private func group(_ name: String, _ children: [RecipeEntry]) -> some View {
    switch name {
    case "reminderRow":
      HStack(alignment: .top, spacing: AppleMetrics.space10) {
        ForEach(Array(children.enumerated()), id: \.offset) { _, entry in child(entry) }
      }
    case "eventMain":
      HStack(alignment: .center, spacing: AppleMetrics.space14) {
        ForEach(Array(children.enumerated()), id: \.offset) { _, entry in child(entry) }
      }
    case "eventContent":
      VStack(alignment: .leading, spacing: AppleMetrics.space2) {
        ForEach(Array(children.enumerated()), id: \.offset) { _, entry in child(entry) }
      }.frame(maxWidth: .infinity, alignment: .leading)
    case "eventFooter":
      if !card.people.isEmpty || timely {
        HStack(spacing: AppleMetrics.space12) {
          ForEach(Array(children.enumerated()), id: \.offset) { index, entry in
            if index == children.count - 1 { Spacer(minLength: 0) }
            child(entry)
          }
        }
      }
    default:
      ForEach(Array(children.enumerated()), id: \.offset) { _, entry in child(entry) }
    }
  }

  private var timely: Bool {
    let start = card.start ?? 0
    return card.meeting != nil
      && Format.eventTimely(start: start, end: card.end ?? start, now: context.now)
  }

  private var played: Double {
    card.duration.map { $0 > 0 ? min(1, state.playbackPosition / Double($0)) : 0 } ?? 0
  }

  private var timeline: some View {
    GeometryReader { g in
      ZStack(alignment: .leading) {
        Rectangle().fill(
          card.isPodcast ? AppleColors.surface : AppleColors.fixedWhite.opacity(0.45))
        Rectangle().fill(card.isPodcast ? AppleColors.primary : AppleColors.fixedWhite)
          .frame(width: g.size.width * played)
      }
    }.frame(height: AppleMetrics.space3).clipShape(Capsule())
  }

  private var length: String {
    card.duration.map(Format.duration) ?? Copy.text("web.media.unknownDuration")
  }

  private var fallbackSummary: String {
    card.summary.isEmpty ? card.body.first ?? "" : card.summary
  }

  @ViewBuilder private var block: some View {
    switch entry.name {
    case "cover":
      if card.cover != nil, !context.compact {
        CardCover(card: card, faded: faded) { EmptyView() }
      }
    case "videoCover":
      if !context.compact { videoCover }
    case "mosaic":
      if !context.compact {
        PhotoGrid(photos: Array(card.images.prefix(3)), faded: faded)
          .aspectRatio(16 / 9, contentMode: .fit)
          .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius, style: .continuous))
          .padding([.horizontal, .top], AppleMetrics.coverInset)
      }
    case "source":
      CardHead(card: card, text: sourceText, detail: sourceDetail) { status }
    case "sender": sender
    case "title":
      CardTitle(text: card.title, faded: faded, query: context.query)
    case "quote":
      Highlighted(text: card.title, query: context.query)
        .textStyle(
          AppleMetrics.font21, .medium, leading: AppleMetrics.quoteLeading,
          tracking: AppleMetrics.quoteTracking
        )
        .foregroundStyle(faded ? AppleColors.secondary : AppleColors.primary)
        .lineLimit(nil)
        .fixedSize(horizontal: false, vertical: true)
    case "summary": summary
    case "schedule": CardScheduleLine(card: card, state: state, now: context.now)
    case "checklist": checklist
    case "reminderMark":
      ReminderCheck(card: card, state: state)
        .padding(
          .top,
          (LineHeight.height(size: AppleMetrics.font16 * context.appearance.scale)
            - AppleMetrics.reminderDotSize) / 2)
    case "timeSpan": timeSpan
    case "info":
      if let meeting = card.meeting { location(meeting.name, icon: "video") }
      if let place = card.location { location(place, icon: "pin") }
    case "participants":
      if !card.people.isEmpty {
        Avatars(names: card.people)
        Text(card.people.joined(separator: "、")).lineLimit(1)
          .textStyle(AppleMetrics.font13).foregroundStyle(AppleColors.secondary)
      }
    case "join":
      if timely {
        Button {
          intents.join(card.id)
        } label: {
          Text(Copy.text("web.templates.451755e3831f"))
            .font(.sans(AppleMetrics.font13, .medium)).foregroundStyle(AppleColors.fixedWhite)
            .padding(.horizontal, AppleMetrics.pillPaddingX)
            .frame(minWidth: AppleMetrics.primaryMinWidth, minHeight: AppleMetrics.pillHeight)
            .background(Capsule().fill(AppleColors.accentFill))
        }.buttonStyle(PrimaryPillStyle())
      }
    case "files": files
    case "references": references
    case "programBar":
      HStack(spacing: AppleMetrics.space10) {
        Icon("play", size: AppleMetrics.space12, filled: true)
          .frame(width: AppleMetrics.space20, height: AppleMetrics.space20)
          .foregroundStyle(AppleColors.card)
          .background(Circle().fill(AppleColors.primary))
        timeline
        Text(length).textStyle(AppleMetrics.font12, number: true)
      }.foregroundStyle(AppleColors.secondary).padding(.top, AppleMetrics.space4)
    default: EmptyView()
    }
  }

  private var sourceText: String {
    switch entry.string("line") {
    case "publication" where entry.string("date") == "article":
      [
        card.publicationName, card.displayDate,
        card.readingTime,
      ].filter { !$0.isEmpty }.joined(separator: " · ")
    case "task": Copy.text("web.task")
    case "reminder": Copy.text("web.reminder")
    case "eventDate": Format.dateLabel(card.start ?? 0)
    case "photo":
      [
        card.location ?? "",
        card.displayDate,
      ].filter { !$0.isEmpty }.joined(separator: " · ")
    case "file":
      [Copy.text("web.file"), card.sourceName, card.displayDate, card.readingTime].filter {
        !$0.isEmpty
      }
      .joined(separator: " · ")
    default:
      [card.publicationName.nilIfEmpty ?? card.kind.label, card.displayDate, card.readingTime]
        .filter { !$0.isEmpty }.joined(separator: " · ")
    }
  }

  private var sourceDetail: Text? { nil }

  @ViewBuilder private var status: some View {
    switch entry.string("status") {
    case "progress": ReadingProgress(card: card, state: state)
    case "remaining":
      if let duration = card.duration {
        Text(
          Copy.text("web.media.remaining").replacingOccurrences(
            of: "{minutes}",
            with: String(Int(ceil(max(0, Double(duration) - state.playbackPosition) / 60))))
        ).textStyle(AppleMetrics.font12, number: true)
      }
    case "taskCount":
      let tasks = state.tasks(of: card)
      if !tasks.isEmpty {
        Text("\(tasks.filter(\.done).count)/\(tasks.count)")
          .textStyle(AppleMetrics.font13, .semibold, number: true)
          .foregroundStyle(AppleColors.primary)
      }
    case "relative":
      let start = card.start ?? 0
      let relative = Format.eventRelative(start: start, end: card.end ?? start, now: context.now)
      if !relative.isEmpty {
        Text(relative).textStyle(AppleMetrics.font13, .medium).foregroundStyle(
          AppleColors.secondary)
      }
    case "reminderClock":
      if let when = FeedPolicy.reminderTime(card, state: state, now: context.now) {
        Text(Format.reminderClock(when.at, now: context.now))
          .textStyle(AppleMetrics.font13, .medium, number: true)
          .foregroundStyle(when.due ? AppleColors.warning : AppleColors.secondary)
      }
    case "relatedCount":
      if !card.related.isEmpty {
        Text("\(card.related.count)\(Copy.text("web.card.relatedCount"))")
      }
    case "photoCount":
      if !card.images.isEmpty {
        Text("\(card.images.count)" + Copy.text("web.common.cardCountSuffix")).textStyle(
          AppleMetrics.font12, number: true)
      }
    case "fileCount":
      if !card.files.isEmpty {
        Text(String(card.files.count) + Copy.text("web.card.fileCountSuffix")).textStyle(
          AppleMetrics.font12, number: true)
      }
    default: EmptyView()
    }
  }

  @ViewBuilder private var sender: some View {
    let date = card.displayDate
    if let sender = card.sender {
      HStack(spacing: AppleMetrics.space10) {
        Avatar(name: sender, size: AppleMetrics.space32)
        HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space8) {
          Text(sender).textStyle(AppleMetrics.font14, .semibold).lineLimit(1)
            .foregroundStyle(AppleColors.primary)
          Text(
            [card.sourceName, date, card.readingTime].filter { !$0.isEmpty }
              .joined(separator: " · ")
          )
          .textStyle(AppleMetrics.font12).foregroundStyle(AppleColors.secondary).lineLimit(1)
        }
      }
      .padding(.trailing, AppleMetrics.space30)
    } else {
      CardHead(
        card: card,
        text: [
          card.sourceName.isEmpty ? Copy.text("web.mail") : card.sourceName, date,
          card.readingTime,
        ].filter { !$0.isEmpty }.joined(separator: " · "))
    }
  }

  @ViewBuilder private var summary: some View {
    if entry.flag("fallback") == false {
      if !card.summary.isEmpty, !context.compact {
        CardSummary(
          text: card.summary, query: context.query,
          indent: entry.flag("indent") == true ? AppleMetrics.space28 : 0)
      }
    } else if !context.compact {
      SummaryBlock(summary: fallbackSummary, query: context.query)
    }
  }

  @ViewBuilder private var checklist: some View {
    let tasks = state.tasks(of: card)
    if !tasks.isEmpty {
      // Unfinished first, then finished; at most the recipe's limit.
      VStack(alignment: .leading, spacing: 0) {
        ForEach(state.previewTasks(of: card)) { task in
          TaskRow(task: task, locked: state.isWriting) { intents.toggleTask(card.id, task.id) }
        }
      }
    } else if !context.compact {
      SummaryBlock(summary: fallbackSummary, query: context.query)
    }
  }

  private var timeSpan: some View {
    let start = card.start ?? 0
    let end = card.end ?? start
    return VStack(alignment: .leading, spacing: AppleMetrics.space4) {
      Text(Format.time(start))
        .textStyle(
          AppleMetrics.eventCardTimeSize, .semibold, leading: 1,
          tracking: AppleMetrics.cardTitleTracking, number: true
        )
        .foregroundStyle(faded ? AppleColors.secondary : AppleColors.primary)
      Text(Copy.text("web.templates.83532308ecca") + Format.time(end))
        .textStyle(AppleMetrics.font13, number: true).foregroundStyle(AppleColors.secondary)
    }
    .padding(.trailing, AppleMetrics.space14)
    .overlay(alignment: .trailing) {
      Rectangle().fill(AppleColors.accent).frame(width: AppleMetrics.space2)
    }
  }

  private func location(_ text: String, icon: String) -> some View {
    HStack(spacing: AppleMetrics.space6) {
      Icon(icon, size: AppleMetrics.font15)
      Text(text).lineLimit(1).truncationMode(.tail)
    }.textStyle(AppleMetrics.font13).foregroundStyle(AppleColors.secondary)
  }

  @ViewBuilder private var files: some View {
    let limit = entry.number("limit") ?? Int.max
    if !card.files.isEmpty {
      // Hairlines only between files, none above or below the list (as on the Web).
      VStack(alignment: .leading, spacing: 0) {
        ForEach(Array(card.files.prefix(limit).enumerated()), id: \.offset) { index, file in
          DetailRow(
            icon: file.isImage ? "image" : "file", title: file.name,
            detail: file.detail, trailing: file.modifiedAt.flatMap(ReaderContent.fullDate) ?? "",
            divider: index > 0)
        }
      }
      .padding(.top, AppleMetrics.space2)
      if card.files.count > limit {
        MoreItems(count: card.files.count - limit, suffix: Copy.text("web.templates.7aaf96ad52e0"))
      }
    }
  }

  @ViewBuilder private var references: some View {
    let all = card.related.compactMap(related)
    let limit = entry.number("limit") ?? all.count
    if !all.isEmpty {
      VStack(spacing: AppleMetrics.space6) {
        ForEach(all.prefix(limit), id: \.id) { item in
          RelatedRow(card: item) { intents.open(item.id) }
        }
      }
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Copy.text("web.templates.9f2ab3a03303"))
      if all.count > limit {
        MoreItems(count: all.count - limit, suffix: Copy.text("web.related.moreSuffix"), indent: 0)
      }
    }
  }

  private var videoCover: some View {
    CardCover(card: card, faded: faded) {
      ZStack {
        Icon("play", size: AppleMetrics.space20, filled: true)
          .foregroundStyle(AppleColors.primary)
          .frame(width: AppleMetrics.space44, height: AppleMetrics.space44)
          .background(Circle().fill(AppleColors.glassThick))
        VStack {
          Spacer(minLength: 0)
          HStack(spacing: AppleMetrics.space6) {
            timeline
            Text(length)
              .textStyle(AppleMetrics.font12, number: true).foregroundStyle(
                AppleColors.fixedWhite
              )
              .padding(.horizontal, AppleMetrics.space8).padding(
                .vertical, AppleMetrics.space2
              )
              .background(
                RoundedRectangle(cornerRadius: AppleMetrics.mediaLengthRadius).fill(
                  AppleColors.fixedBlack55))
          }.padding(AppleMetrics.space10)
        }
      }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}
