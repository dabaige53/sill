import SillKit
import SwiftUI

/// Type sizes for the preview sheet and the fullscreen page (Web `.preview-body`, `.reader-body`).
struct ReaderType {
  var full = false
  var title: CGFloat
  var titleLeading: CGFloat
  var titleTracking: CGFloat
  var body: CGFloat
  var bodyLeading: CGFloat

  static let preview = ReaderType(
    title: AppleMetrics.previewTitle, titleLeading: AppleMetrics.previewTitleLeading,
    titleTracking: AppleMetrics.previewTitleTracking, body: AppleMetrics.font15,
    bodyLeading: AppleMetrics.previewBodyLeading)
  static let page: ReaderType = {
    var value = preview
    value.full = true
    return value
  }()
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
        // Articles show their cover above the source and title, in the preview and expanded alike.
        if card.cover != nil,
          recipe.body.contains(where: { $0.name == "cover" && $0.string("preview") == "hoist" })
        {
          if page {
            articleCover
          } else {
            articleCover.padding(.horizontal, -AppleMetrics.articleGutter + AppleMetrics.space8)
              .padding(.top, -AppleMetrics.space16)
          }
        }
        head
        // Info rows (facts, time and place, people) lead; the summary follows them, then the body.
        // Photos speak for themselves: no summary block in their detail (Web the same).
        let rows = recipe.body.prefix { Self.infoRows.contains($0.name) }.count
        ForEach(Array(recipe.body.enumerated().prefix(rows)), id: \.offset) { index, entry in
          bodyBlock(entry, after: index > 0 ? recipe.body[index - 1] : nil)
        }
        if card.kind != .photo { SummaryOverview(card: card) }
        ForEach(Array(recipe.body.enumerated().dropFirst(rows)), id: \.offset) { index, entry in
          bodyBlock(entry, after: index > 0 ? recipe.body[index - 1] : nil)
        }
      }
      NoteBox(note: state.note)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .environment(\.contentAppearance, workspace.preferences.readerAppearance)
  }

  private static let infoRows: Set<String> = ["facts", "info", "participants"]

  private var page: Bool { type.full }

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
      MetaRow(icon: AnyView(SourceIcon(card: card, size: AppleMetrics.font15))) {
        Text(Format.dateLabel(start))
          + Text(relative.isEmpty ? "" : " · ")
          + Text(relative).foregroundColor(AppleColors.secondary).fontWeight(.medium)
      }
      .padding(.trailing, discRoom)
      .firstRow()
      .frame(minHeight: AppleMetrics.space36, alignment: .leading)
    case "timeSpan": timeSpan
    case "title":
      if entry.flag("bare") == true {
        title
      } else {
        VStack(alignment: .leading, spacing: AppleMetrics.rhythmItem) {
          title
          ReaderTags(tags: state.tags(of: card))
        }
      }
    case "tags": ReaderTags(tags: state.tags(of: card))
    case "schedule": CardScheduleLine(card: card, state: state)
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
      card.metaText(sourceLine(entry))
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
        card.sourceName.nilIfEmpty, card.displayDate.nilIfEmpty, card.readingTime.nilIfEmpty,
        card.related.isEmpty ? nil : "\(card.related.count)\(Copy.text("web.card.relatedCount"))",
      ].compactMap { $0 }.joined(separator: " · ")
    case "task": Copy.text("web.task")
    case "reminder": Copy.text("web.reminder")
    default:
      switch card.kind {
      case .article:
        [
          card.publicationName.nilIfEmpty ?? card.kind.label,
          card.displayDate, card.readingTime,
        ].filter { !$0.isEmpty }.joined(separator: " · ")
      default:
        [
          [.note, .suggestion].contains(card.kind) ? card.publicationName : card.sourceName,
          card.displayDate,
          card.readingTime,
        ].filter { !$0.isEmpty }.joined(separator: " · ")
      }
    }
  }

  private var sender: some View {
    MailSenderHeader(card: card, detail: true)
      .padding(.trailing, discRoom)
      .firstRow()
      .frame(minHeight: AppleMetrics.space36, alignment: .leading)
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
      if page, card.cover != nil, entry.string("preview") != "hoist" {
        CoverImage(name: card.cover)
          .aspectRatio(16 / 9, contentMode: .fit)
          .frame(maxWidth: .infinity)
          .clipShape(
            RoundedRectangle(cornerRadius: AppleMetrics.previewCoverRadius, style: .continuous))
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
          if !card.sourceName.isEmpty {
            DetailRow(icon: "link", title: Copy.text("web.card.source") + " · " + card.sourceName)
          }
          if let project = card.project {
            DetailRow(icon: "folder", title: Copy.text("web.metadata.project") + " · " + project)
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
    !card.sourceName.isEmpty || card.project != nil || card.raw["priority"]?.number != nil
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

  /// The preview keeps a fixed band; expanded, the cover spans the column at `readerCoverRatio`.
  @ViewBuilder private var articleCover: some View {
    if page {
      Color.clear
        .aspectRatio(AppleMetrics.readerCoverRatio, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .overlay { CoverImage(name: card.cover) }
        .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.previewCoverRadius))
    } else {
      CoverImage(name: card.cover)
        .frame(height: AppleMetrics.space220)
        .frame(maxWidth: .infinity)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.previewCoverRadius))
    }
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
