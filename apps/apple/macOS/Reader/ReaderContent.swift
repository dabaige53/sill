import SillKit
import SwiftUI

/// Type sizes for the preview sheet and the fullscreen page (Web `.preview-body`, `.reader-body`).
struct ReaderType {
  var title: CGFloat
  var titleLeading: CGFloat
  var titleTracking: CGFloat
  var body: CGFloat
  var bodyLeading: CGFloat

  static let preview = ReaderType(
    title: AppleMetrics.previewTitle, titleLeading: AppleMetrics.previewTitleLeading,
    titleTracking: AppleMetrics.previewTitleTracking, body: AppleMetrics.font15,
    bodyLeading: AppleMetrics.previewBodyLeading)
  static let page = ReaderType(
    title: AppleMetrics.font30, titleLeading: AppleMetrics.readerTitleLeading,
    titleTracking: AppleMetrics.readerTitleTracking, body: AppleMetrics.font17,
    bodyLeading: AppleMetrics.readerBodyLeading)
}

/// Vertical rhythm between detail blocks (Web `detail-content.css`): blocks sit one group apart,
/// rows that carry their own padding one level closer, titled sections one level further.
struct DetailRhythm {
  // @design vertical-rhythm
  let scale: CGFloat
  var group: CGFloat { AppleMetrics.rhythmGroup * scale }
  /// Top padding that turns the group gap into the item gap beside padded rows.
  var rowLift: CGFloat { (AppleMetrics.rhythmItem - AppleMetrics.rhythmGroup) * scale }
  /// Top padding that turns the group gap into the section gap.
  var sectionLead: CGFloat { (AppleMetrics.rhythmSection - AppleMetrics.rhythmGroup) * scale }
}

/// The content of a detail, by its recipe in design-system/recipes.json (Web
/// `previews-components.tsx`). The first row reports its height so the floating discs can
/// center on it.
struct ReaderContent: View {
  let card: CardModel
  let state: CardState
  var type = ReaderType.preview
  /// Room kept on the right of the first row for the floating discs.
  var discRoom: CGFloat = 0
  var mediaWidth: CGFloat?
  var mediaHeight: CGFloat?
  var mediaBottomRoom: CGFloat = 0
  var mediaOffset: CGFloat = 0
  var returnToPlayer: () -> Void = {}
  @Environment(\.cardIntents) private var intents
  @Environment(\.relatedCards) private var lookup
  @Environment(Workspace.self) private var workspace

  var body: some View {
    // @design article-reading
    VStack(alignment: .leading, spacing: rhythm.group) {
      switch recipe.composite {
      case "pullRequest":
        PullRequestContent(card: card, detail: true, tags: state.tags(of: card), rhythm: rhythm)
      case "podcastDetail": PodcastDetail(card: card, state: state)
      case "videoPlayer":
        MediaDetail(
          card: card, state: state, full: page, availableWidth: mediaWidth,
          availableHeight: mediaHeight)
      default:
        if !page, card.cover != nil,
          recipe.body.contains(where: { $0.name == "cover" && $0.string("preview") == "hoist" })
        {
          articleCover.padding(.horizontal, -AppleMetrics.articleGutter + AppleMetrics.space8)
            .padding(.top, -AppleMetrics.space16)
        }
        head
        ForEach(Array(recipe.body.enumerated()), id: \.offset) { index, entry in
          bodyBlock(entry, after: index > 0 ? recipe.body[index - 1] : nil)
        }
      }
      NoteBox(note: state.note)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .environment(\.contentAppearance, workspace.preferences.readerAppearance)
  }

  private var page: Bool { type.title == ReaderType.page.title }

  /// The fullscreen page uses the reading recipe; types that cannot be read use the default.
  private var recipe: DetailRecipe {
    page ? CardRecipes.reader(card.recipeKey) : CardRecipes.detail(card.recipeKey)
  }

  private var rhythm: DetailRhythm {
    DetailRhythm(scale: workspace.preferences.readerSpacing.scale)
  }

  // MARK: Head

  /// Head blocks sit one level apart; the lines under the source and date sit closer.
  private var head: some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(recipe.head.enumerated()), id: \.offset) { index, entry in
        headBlock(entry)
          .padding(
            .top,
            index == 0
              ? 0
              : ["source", "sender", "eventDate"].contains(recipe.head[index - 1].name)
                ? AppleMetrics.rhythmClose : AppleMetrics.rhythmItem)
      }
    }
  }

  @ViewBuilder private func headBlock(_ entry: RecipeEntry) -> some View {
    switch entry.name {
    case "source": source(entry)
    case "sender": sender
    case "eventDate":
      let start = card.start ?? 0
      let relative = Format.eventRelative(
        start: start, end: card.end ?? start, now: Format.milliseconds())
      MetaRow(icon: nil) {
        Text(Format.dateLabel(start))
          + Text(relative.isEmpty ? "" : " · ")
          + Text(relative).foregroundColor(AppleColors.secondary).fontWeight(.medium)
      }
    case "timeSpan": timeSpan
    case "title":
      if entry.flag("bare") == true {
        title
      } else {
        VStack(alignment: .leading, spacing: AppleMetrics.rhythmItem) {
          title
          if entry.flag("publication") == false {
            ReaderTags(tags: state.tags(of: card))
          } else if !state.tags(of: card).isEmpty || card.detailDate != nil {
            VStack(alignment: .leading, spacing: AppleMetrics.rhythmClose) {
              ReaderTags(tags: state.tags(of: card))
              PublicationRows(card: card)
            }
          }
        }
      }
    case "tags": ReaderTags(tags: state.tags(of: card))
    case "reminderRow":
      HStack(alignment: .top, spacing: AppleMetrics.space12) {
        ReminderCheck(card: card, state: state, large: true)
          .padding(
            .top,
            (LineHeight.height(size: type.title * workspace.preferences.readerTextSize.scale)
              - AppleMetrics.space24) / 2)
        title
      }
    default: EmptyView()
    }
  }

  private func source(_ entry: RecipeEntry) -> some View {
    MetaRow(icon: AnyView(SourceIcon(card: card, size: sourceIconSize(entry)))) {
      Text(sourceLine(entry))
    }
    .padding(.trailing, discRoom)
    .firstRow()
    .frame(minHeight: AppleMetrics.space36, alignment: .leading)
  }

  private func sourceIconSize(_ entry: RecipeEntry) -> CGFloat {
    entry.string("line") == "meta" && card.kind != .article && card.kind != .event
      || ["task", "reminder"].contains(entry.string("line") ?? "")
      ? AppleMetrics.font15 : AppleMetrics.space16
  }

  private func sourceLine(_ entry: RecipeEntry) -> String {
    switch entry.string("line") {
    case "digest":
      [
        card.sourceName.nilIfEmpty,
        card.related.isEmpty ? nil : "\(card.related.count)\(Copy.text("web.card.relatedCount"))",
      ].compactMap { $0 }.joined(separator: " · ")
    case "task":
      [card.sourceName, card.project ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
    case "reminder":
      [
        Copy.text("web.reminder"), card.sourceName,
        FeedPolicy.reminderTime(card, state: state, now: Format.milliseconds()).map {
          Format.reminderClock($0.at, now: Format.milliseconds())
        } ?? "",
      ].filter { !$0.isEmpty }.uniqued().joined(separator: " · ")
    default:
      switch card.kind {
      case .article:
        [
          card.publicationName.nilIfEmpty ?? card.kind.label,
          card.articleDate.map { Format.shortDay($0) } ?? "", card.readingTime,
        ].filter { !$0.isEmpty }.joined(separator: " · ")
      case .event: card.sourceName
      case .file:
        Copy.text("web.preview.fileSourcePrefix")
          + [card.sourceName, card.readingTime].filter { !$0.isEmpty }.joined(separator: " · ")
      default:
        [
          [.note, .suggestion].contains(card.kind) ? card.publicationName : card.sourceName,
          [.note, .suggestion].contains(card.kind) ? card.publicationDate ?? "" : "",
          card.readingTime,
        ].filter { !$0.isEmpty }.joined(separator: " · ")
      }
    }
  }

  @ViewBuilder private var sender: some View {
    if let sender = card.sender {
      HStack(spacing: AppleMetrics.space10) {
        Avatar(name: sender, size: AppleMetrics.space36)
        HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space8) {
          Text(sender).lineLimit(1).textStyle(AppleMetrics.font15, .bold).foregroundStyle(
            AppleColors.primary)
          Text(
            [card.sourceName, card.publishedAt.flatMap(Self.fullDate) ?? "", card.readingTime]
              .filter { !$0.isEmpty }
              .joined(separator: " · ")
          )
          .textStyle(AppleMetrics.font12).foregroundStyle(AppleColors.secondary).lineLimit(1)
        }
      }
      .padding(.trailing, discRoom)
      .firstRow()
      .frame(minHeight: AppleMetrics.space36, alignment: .leading)
    } else {
      source(.block("source", ["line": .string("meta")]))
    }
  }

  private var title: some View {
    Text(card.title)
      .textStyle(type.title, .semibold, leading: type.titleLeading, tracking: type.titleTracking)
      .foregroundStyle(AppleColors.primary)
      .frame(maxWidth: .infinity, alignment: .leading)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityAddTraits(.isHeader)
  }

  private var timeSpan: some View {
    let start = card.start ?? 0
    let end = card.end ?? start
    return HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space12) {
      Text(Format.time(start))
        .textStyle(
          AppleMetrics.eventHeroSize, .semibold, leading: AppleMetrics.eventHeroLeading,
          tracking: AppleMetrics.previewTitleTracking, number: true
        )
        .foregroundStyle(AppleColors.primary)
      Text(
        "\(Copy.text("web.templates.83532308ecca"))\(Format.time(end)) · \(Int(((end - start) / 60000).rounded()))\(Copy.text("web.templates.40de54344d22"))"
      )
      .textStyle(AppleMetrics.font15, number: true).foregroundStyle(AppleColors.secondary)
    }
  }

  // MARK: Body

  /// Lists that carry their own row padding sit one level closer; titled sections and file
  /// lists sit one level further from the block before them.
  @ViewBuilder private func bodyBlock(_ entry: RecipeEntry, after previous: RecipeEntry?)
    -> some View
  {
    let lead = previous.map(renders) == true ? rhythm.sectionLead : 0
    switch entry.name {
    case "cover":
      if page, card.cover != nil {
        if entry.string("preview") == "hoist" {
          articleCover
        } else {
          CoverImage(name: card.cover)
            .aspectRatio(16 / 9, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .clipShape(
              RoundedRectangle(cornerRadius: AppleMetrics.previewCoverRadius, style: .continuous))
        }
      }
    case "body":
      if !card.markdown.blocks.isEmpty {
        if entry.string("section") == "agenda" {
          section(Copy.text("web.card.agenda")) { detailText(entry) }
        } else {
          detailText(entry).padding(.top, previous?.name == "checklist" ? rhythm.rowLift : 0)
        }
      }
    case "files":
      if !card.files.isEmpty {
        DetailFiles(files: card.files).padding(.top, lead)
      }
    case "participants":
      if !card.people.isEmpty {
        HStack(spacing: AppleMetrics.space10) {
          Avatars(names: card.people)
          Text(card.people.joined(separator: "、")).textStyle(AppleMetrics.font15)
            .foregroundStyle(AppleColors.primary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, rhythm.rowLift)
      }
    case "references":
      if !card.related.compactMap(lookup).isEmpty {
        section(
          Copy.text(card.kind == .digest ? "web.card.digestRelated" : "web.card.related"),
          rows: true
        ) { related }
        .padding(.top, lead)
      }
    case "facts":
      if hasFacts {
        VStack(alignment: .leading, spacing: 0) {
          if let due = card.due {
            DetailRow(
              icon: "clock", title: Copy.text("web.card.due") + " " + Format.dateLabel(due),
              tone: AppleColors.warning)
          }
          if card.raw["priority"]?.number != nil {
            DetailRow(
              icon: "flag", title: Copy.text("web.card.priority") + " " + card.priority.formatted())
          }
        }
        .padding(.top, rhythm.rowLift)
      }
    case "checklist":
      VStack(alignment: .leading, spacing: 0) {
        ForEach(state.tasks(of: card)) { task in
          TaskRow(task: task, locked: state.isWriting, large: true) {
            intents.toggleTask(card.id, task.id)
          }
        }
      }
      .padding(.top, rhythm.rowLift)
    case "info":
      if entry.string("style") == "line" {
        if let project = card.project {
          Text(Copy.text("web.metadata.project") + " · " + project).textStyle(AppleMetrics.font13)
            .foregroundStyle(AppleColors.secondary)
        }
      } else {
        let rows = infoRows
        if !rows.isEmpty {
          VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
              if row.icon == "video" {
                DetailRow(
                  icon: row.icon, title: row.title, detail: row.trailing, divider: index > 0,
                  wrapping: true)
              } else {
                DetailRow(
                  icon: row.icon, title: row.title, trailing: row.trailing, divider: index > 0)
              }
            }
          }
          .padding(.top, rhythm.rowLift)
        }
      }
    default: EmptyView()
    }
  }

  /// Whether a body block shows anything, so the next titled block knows its gap.
  private func renders(_ entry: RecipeEntry) -> Bool {
    switch entry.name {
    case "body": !card.markdown.blocks.isEmpty
    case "references": !card.related.compactMap(lookup).isEmpty
    case "files": !card.files.isEmpty
    default: false
    }
  }

  private var hasFacts: Bool {
    card.due != nil || card.raw["priority"]?.number != nil
  }

  /// A small grey section title over its content (Web `.detail-section`).
  private func section<Content: View>(
    _ label: String, rows: Bool = false, @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(
      alignment: .leading, spacing: rows ? AppleMetrics.rhythmClose : AppleMetrics.rhythmLabel
    ) {
      Text(label).textStyle(AppleMetrics.font13, .semibold)
        .foregroundStyle(AppleColors.secondary)
      content()
    }
  }

  private func detailText(_ entry: RecipeEntry) -> some View {
    MarkdownText(
      document: card.markdown, size: type.body, leading: type.bodyLeading,
      outline: entry.flag("outline") == true && card.kind == .article && page)
  }

  private var articleCover: some View {
    CoverImage(name: card.cover)
      .frame(height: page ? 340 : AppleMetrics.space220)
      .frame(maxWidth: .infinity)
      .clipped()
      .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.previewCoverRadius))
  }

  private var related: some View {
    VStack(spacing: 0) {
      ForEach(card.related.compactMap(lookup), id: \.id) { item in
        Button {
          intents.open(item.id)
        } label: {
          DetailRow(
            icon: item.kind.icon, title: item.title, trailing: item.kind.label, divider: true)
        }.buttonStyle(.plain)
      }
    }
  }

  private var infoRows: [(icon: String, title: String, trailing: String)] {
    var rows: [(String, String, String)] = []
    if let meeting = card.meeting { rows.append(("video", meeting.name, meeting.code ?? "")) }
    if let location = card.location { rows.append(("pin", location, "")) }
    return rows
  }

  static func fullDate(_ value: String) -> String? {
    Format.publication(value, includeTime: true)
  }
}
