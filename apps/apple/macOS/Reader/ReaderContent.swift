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

/// The content of a detail, by card type (Web `previews-components.tsx`). The first row reports
/// its height so the floating discs can center on it.
struct ReaderContent: View {
  let card: CardModel
  let state: CardState
  var type = ReaderType.preview
  /// Room kept on the right of the first row for the floating discs.
  var discRoom: CGFloat = 0
  var mediaHeight: CGFloat?
  var mediaOffset: CGFloat = 0
  var returnToPlayer: () -> Void = {}
  @Environment(\.cardIntents) private var intents

  var body: some View {
    // @design article-reading
    if card.kind == .article {
      articleReading
    } else {
      other
    }
  }

  private var other: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.previewBodyGap) {
      switch card.kind {
      case .mail: mail
      case .event: event
      case .file: file
      case .pr: PullRequestContent(card: card, detail: true, tags: state.tags(of: card))
      case .task, .reminder: taskReminder
      case .digest: digest
      case .media:
        MediaDetail(
          card: card, state: state, full: type.title == ReaderType.page.title,
          availableHeight: mediaHeight, scrollOffset: mediaOffset,
          returnToPlayer: returnToPlayer)
      default: article
      }
      NoteBox(note: state.note)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: Shared rows

  private var meta: some View {
    MetaRow(icon: AnyView(SourceIcon(card: card, size: AppleMetrics.font15))) {
      Text(
        [
          [.note, .suggestion, .file].contains(card.kind) ? card.publicationName : card.sourceName,
          [.note, .suggestion, .file].contains(card.kind) ? card.publication.date ?? "" : "",
          card.readingTime,
        ].filter { !$0.isEmpty }.joined(separator: " · "))
    }
    .padding(.trailing, discRoom)
    .firstRow()
  }

  private var title: some View {
    Text(card.title)
      .textStyle(type.title, .semibold, leading: type.titleLeading, tracking: type.titleTracking)
      .foregroundStyle(AppleColors.primary)
      .frame(maxWidth: .infinity, alignment: .leading)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityAddTraits(.isHeader)
  }

  private var heading: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      title
      if !state.tags(of: card).isEmpty || card.detailPublication.date != nil
        || !card.detailPublication.rows.isEmpty
      {
        VStack(alignment: .leading, spacing: AppleMetrics.space8) {
          ReaderTags(tags: state.tags(of: card))
          PublicationRows(publication: card.detailPublication)
        }
      }
    }
  }

  private func header<Source: View>(ruled: Bool = false, @ViewBuilder source: () -> Source)
    -> some View
  {
    VStack(alignment: .leading, spacing: AppleMetrics.space6) {
      source().frame(minHeight: AppleMetrics.space36, alignment: .leading)
      if card.kind == .digest {
        VStack(alignment: .leading, spacing: AppleMetrics.space16) {
          title
          ReaderTags(tags: state.tags(of: card))
        }
      } else {
        heading
      }
    }
    .padding(.bottom, ruled ? AppleMetrics.space24 : 0)
    .overlay(alignment: .bottom) {
      if ruled { Rectangle().fill(AppleColors.lineCard).frame(height: AppleMetrics.lineWidth) }
    }.padding(.bottom, AppleMetrics.space8)
  }

  @ViewBuilder private var detailText: some View {
    if !card.markdown.blocks.isEmpty {
      MarkdownText(document: card.markdown, size: type.body, leading: type.bodyLeading)
    }
  }

  // MARK: Article reading

  private var articleCover: some View {
    CoverImage(name: card.image)
      .frame(height: type.title == ReaderType.page.title ? 340 : AppleMetrics.space220)
      .frame(maxWidth: .infinity)
      .clipped()
      .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.previewCoverRadius))
  }

  private var articleReading: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space20) {
      if card.image != nil, type.title == ReaderType.preview.title {
        articleCover.padding(.horizontal, -AppleMetrics.articleGutter + AppleMetrics.space8)
          .padding(.top, -AppleMetrics.space16)
      }
      header(ruled: true) {
        MetaRow(icon: AnyView(SourceIcon(card: card))) {
          Text(
            [
              card.publicationName.nilIfEmpty ?? card.kind.label,
              card.articleDate.map { Format.shortDay($0) } ?? "", card.readingTime,
            ]
            .filter { !$0.isEmpty }.joined(separator: " · "))
        }.padding(.trailing, discRoom).firstRow()
      }
      if card.image != nil, type.title == ReaderType.page.title { articleCover }
      detailText
      NoteBox(note: state.note)
    }.frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: Types

  @ViewBuilder private var article: some View {
    header(ruled: card.kind == .note) { meta }
    if card.kind == .media, let duration = card.duration {
      Text(Format.duration(duration)).font(.number(AppleMetrics.font13))
        .foregroundStyle(AppleColors.secondary)
    }
    if card.image != nil {
      CoverImage(name: card.image)
        .aspectRatio(16 / 9, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipShape(
          RoundedRectangle(cornerRadius: AppleMetrics.previewCoverRadius, style: .continuous))
    }
    if card.kind == .suggestion, let why = card.why {
      VStack(alignment: .leading, spacing: AppleMetrics.space10) {
        Text(Copy.text("web.card.why")).font(.sans(AppleMetrics.font13, .semibold))
          .foregroundStyle(AppleColors.secondary)
        Text(why.reason).textStyle(AppleMetrics.font17, .medium, leading: 1.55)
        VStack(alignment: .leading, spacing: AppleMetrics.space4) {
          ForEach(Array(why.basis.prefix(5).enumerated()), id: \.offset) { _, line in
            Text("• \(line)").textStyle(AppleMetrics.font14, leading: 1.6)
          }
        }
      }
    }
    if card.kind == .suggestion {
      if !card.related.isEmpty {
        Text(Copy.text("web.card.related")).font(.sans(AppleMetrics.font13, .semibold))
          .foregroundStyle(AppleColors.secondary)
        related
      }
    } else {
      detailText
    }
  }

  @ViewBuilder private var digest: some View {
    header(ruled: true) {
      MetaRow(icon: AnyView(SourceIcon(card: card))) {
        Text(
          [
            card.coverageStart.flatMap { start in
              card.coverageEnd.map { "\(Format.dateLabel(start)) – \(Format.dateLabel($0))" }
            },
            card.related.isEmpty
              ? nil : "\(card.related.count)\(Copy.text("web.card.relatedCount"))",
          ]
          .compactMap { $0 }.joined(separator: " · "))
      }.padding(.trailing, discRoom).firstRow()
    }
    detailText
    if !card.related.isEmpty {
      Text(Copy.text("web.card.digestRelated")).font(.sans(AppleMetrics.font13, .semibold))
        .foregroundStyle(AppleColors.secondary)
      related
    }
  }

  @Environment(\.relatedCards) private var lookup

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
    .padding(.top, AppleMetrics.space4)
  }

  @ViewBuilder private var mail: some View {
    header {
      if let sender = card.sender {
        HStack(spacing: AppleMetrics.space10) {
          Avatar(name: sender, size: AppleMetrics.space36)
          VStack(alignment: .leading, spacing: 0) {
            Text(sender).font(.sans(AppleMetrics.font15, .bold)).foregroundStyle(
              AppleColors.primary)
            HStack(spacing: AppleMetrics.space6) {
              SourceIcon(card: card, size: AppleMetrics.font12)
              Text(
                [card.sourceName, card.sentAt.flatMap(Self.fullDate) ?? "", card.readingTime].filter
                { !$0.isEmpty }
                .joined(separator: " · ")
              )
              .font(.sans(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
            }
          }
        }
        .padding(.trailing, discRoom)
        .firstRow()
      } else {
        meta
      }
    }
    detailText
    DetailFiles(files: card.attachments, label: Copy.text("web.card.attachments"), attachment: true)
  }

  @ViewBuilder private var event: some View {
    let start = card.start ?? 0
    let end = card.end ?? start
    let relative = Format.eventRelative(start: start, end: end, now: Format.milliseconds())
    VStack(alignment: .leading, spacing: 0) {
      MetaRow(icon: AnyView(SourceIcon(card: card))) { Text(card.sourceName) }
        .padding(.trailing, discRoom).frame(minHeight: AppleMetrics.space36).firstRow()
        .padding(.bottom, AppleMetrics.space6)
      MetaRow(icon: nil) {
        Text(Format.dateLabel(start))
          + Text(relative.isEmpty ? "" : " · ")
          + Text(relative).foregroundColor(AppleColors.accent).fontWeight(.medium)
      }
      .padding(.bottom, AppleMetrics.space8)
      HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space12) {
        Text(Format.time(start))
          .textStyle(
            AppleMetrics.eventHeroSize, .semibold, leading: AppleMetrics.eventHeroLeading,
            tracking: AppleMetrics.previewTitleTracking, number: true
          )
          .foregroundStyle(AppleColors.primary)
        Text(
          "\(Copy.text("web.templates.83532308ecca"))\(Format.time(end)) · \(Int(((end - start) / 60000).rounded()))\(Copy.text("web.templates.40de54344d22"))"
            + (card.raw["timeZone"]?.string.map { " · \($0)" } ?? "")
        )
        .font(.number(AppleMetrics.font15)).foregroundStyle(AppleColors.secondary)
      }
      .padding(.bottom, AppleMetrics.space16)
      heading
    }.padding(.bottom, AppleMetrics.space8)
    let rows = eventRows
    if !rows.isEmpty {
      VStack(spacing: 0) {
        ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
          DetailRow(icon: row.icon, title: row.title, trailing: row.trailing, divider: index > 0)
        }
      }
    }
    if !card.markdown.blocks.isEmpty {
      Text(Copy.text("web.card.agenda")).font(.sans(AppleMetrics.font13, .semibold))
        .foregroundStyle(AppleColors.secondary)
      detailText
    }
  }

  private var eventRows: [(icon: String, title: String, trailing: String)] {
    var rows: [(String, String, String)] = []
    if let meeting = card.meeting { rows.append(("video", meeting.name, meeting.code ?? "")) }
    if let location = card.location { rows.append(("pin", location, "")) }
    if !card.people.isEmpty {
      rows.append(
        (
          "at", card.people.joined(separator: "、"),
          "\(card.people.count)\(Copy.text("web.preview.peopleCountSuffix"))"
        ))
    }
    return rows
  }

  @ViewBuilder private var file: some View {
    header {
      MetaRow(icon: AnyView(SourceIcon(card: card, size: AppleMetrics.font15))) {
        Text(
          Copy.text("web.preview.fileSourcePrefix")
            + [card.sourceName, card.readingTime].filter { !$0.isEmpty }.joined(separator: " · "))
      }
      .padding(.trailing, discRoom)
      .firstRow()
    }
    detailText
    DetailFiles(files: card.files)
  }

  @ViewBuilder private var taskReminder: some View {
    let label: String =
      card.kind == .reminder
      ? [
        Copy.text("web.reminder"), card.sourceName,
        FeedPolicy.reminderTime(card, state: state, now: Format.milliseconds()).map {
          Format.reminderClock($0.at, now: Format.milliseconds())
        } ?? "",
      ].filter { !$0.isEmpty }.uniqued().joined(separator: " · ")
      : [card.sourceName, card.project ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
    VStack(alignment: .leading, spacing: AppleMetrics.space6) {
      MetaRow(icon: AnyView(SourceIcon(card: card, size: AppleMetrics.font15))) { Text(label) }
        .padding(.trailing, discRoom)
        .firstRow()
      if card.kind == .reminder {
        HStack(alignment: .top, spacing: AppleMetrics.space12) {
          ReminderCheck(card: card, state: state, large: true)
            .padding(
              .top,
              (LineHeight.height(size: type.title) - AppleMetrics.space24) / 2)
          title
        }
        ReaderTags(tags: state.tags(of: card))
      } else {
        heading
      }
    }
    if card.kind == .task {
      VStack(alignment: .leading, spacing: 0) {
        if let due = card.due {
          DetailRow(
            icon: "clock", title: Copy.text("web.card.due") + " " + Format.dateLabel(due),
            tone: AppleColors.warning)
        }
        if !card.people.isEmpty {
          DetailRow(
            icon: "at", title: card.people.joined(separator: "、"),
            trailing: "\(card.people.count)\(Copy.text("web.preview.peopleCountSuffix"))")
        }
        if card.raw["priority"]?.number != nil {
          DetailRow(
            icon: "flag", title: Copy.text("web.card.priority") + " " + card.priority.formatted())
        }
      }
    }
    if card.kind == .task {
      VStack(alignment: .leading, spacing: 0) {
        ForEach(state.tasks(of: card)) { task in
          TaskRow(task: task, locked: state.isWriting, large: true) {
            intents.toggleTask(card.id, task.id)
          }
        }
      }
    }
    if !card.markdown.blocks.isEmpty {
      MarkdownText(document: card.markdown, size: type.body, leading: type.bodyLeading)
    }
    if card.kind == .reminder, let project = card.project {
      Text(Copy.text("web.metadata.project") + " · " + project).font(.sans(AppleMetrics.font13))
        .foregroundStyle(AppleColors.secondary)
    }
  }

  static func fullDate(_ value: String) -> String? {
    guard let date = Format.parseDate(value) else { return nil }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.dateFormat =
      Calendar.current.component(.year, from: date)
        == Calendar.current.component(.year, from: Date())
      ? "M月d日 HH:mm" : "yyyy年M月d日 HH:mm"
    return formatter.string(from: date)
  }
}

/// Source icon and source name over the title: secondary, one line.
struct MetaRow<Label: View>: View {
  let icon: AnyView?
  var size = AppleMetrics.font13
  @ViewBuilder var label: Label
  var body: some View {
    HStack(spacing: AppleMetrics.space6) {
      if let icon { icon.foregroundStyle(AppleColors.iconSecondary) }
      label.lineLimit(1).truncationMode(.tail)
    }
    .font(.sans(size))
    .foregroundStyle(AppleColors.iconSecondary)
  }
}

/// Small non-interactive tags under the title.
struct ReaderTags: View {
  let tags: [String]
  var body: some View {
    if !tags.isEmpty {
      FlowRow(spacing: AppleMetrics.space6) {
        ForEach(tags, id: \.self) { tag in
          Text("#\(tag)")
            .font(.sans(AppleMetrics.font12))
            .foregroundStyle(AppleColors.secondary)
            .padding(.vertical, AppleMetrics.space3).padding(.horizontal, AppleMetrics.space10)
            .background(Capsule().fill(AppleColors.surface))
        }
      }
    }
  }
}

/// Publication date and author rows: small grey text, no box (Medium-style).
struct PublicationRows: View {
  let publication: CardModel.Publication
  /// Off in article reading, where the date sits in the source line instead.
  var showsDate = true
  var body: some View {
    let date = showsDate ? publication.date : nil
    if date != nil || !publication.rows.isEmpty {
      VStack(alignment: .leading, spacing: AppleMetrics.space6) {
        if let date {
          Text(date).help(publication.dateTitle ?? "")
        }
        ForEach(Array(publication.rows.enumerated()), id: \.offset) { _, row in
          Text(row.label.isEmpty ? row.value : "\(row.label) · \(row.value)")
        }
      }
      .font(.sans(AppleMetrics.font12))
      .foregroundStyle(AppleColors.iconSecondary)
    }
  }
}

/// The personal note at the end of the text, in a light bordered box labelled 备注.
struct NoteBox: View {
  let note: String
  var body: some View {
    if !note.isEmpty {
      VStack(alignment: .leading, spacing: AppleMetrics.space4) {
        Text(Copy.text("web.metadata.note")).font(.sans(AppleMetrics.font12))
        Text(note).textStyle(AppleMetrics.font14, leading: AppleMetrics.previewLeadLeading)
          .fixedSize(horizontal: false, vertical: true)
          .textSelection(.enabled)
      }
      .foregroundStyle(AppleColors.iconSecondary)
      .padding(.vertical, AppleMetrics.space12).padding(.horizontal, AppleMetrics.space14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .overlay(
        RoundedRectangle(cornerRadius: AppleMetrics.space14)
          .strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth)
      )
      .accessibilityElement(children: .combine)
    }
  }
}

struct DetailRow: View {
  let icon: String
  let title: String
  var detail = ""
  var trailing = ""
  var divider = false
  var navigable = false
  var tone: Color? = nil
  var body: some View {
    HStack(spacing: AppleMetrics.space12) {
      Icon(icon, size: AppleMetrics.space16)
        .foregroundStyle(tone ?? AppleColors.secondary)
        .frame(width: AppleMetrics.space18, height: AppleMetrics.space18)
      VStack(alignment: .leading, spacing: 0) {
        Text(title).lineLimit(1).truncationMode(.tail)
        if !detail.isEmpty {
          Text(detail).font(.sans(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
            .lineLimit(1).truncationMode(.tail)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if !trailing.isEmpty {
        Text(trailing).font(.number(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
          .lineLimit(1)
      }
      if navigable {
        Icon("chevron", size: AppleMetrics.space14).foregroundStyle(AppleColors.secondary)
      }
    }
    .font(.sans(AppleMetrics.font14))
    .foregroundStyle(tone ?? AppleColors.primary)
    .frame(minHeight: AppleMetrics.detailRowHeight)
    .overlay(alignment: .top) {
      if divider { Rectangle().fill(AppleColors.line).frame(height: AppleMetrics.lineWidth) }
    }
  }
}

/// The first row of a detail reports its height; the floating discs center on it.
struct FirstRowHeight: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = max(value, nextValue())
  }
}

extension View {
  func firstRow() -> some View {
    background(
      GeometryReader { Color.clear.preference(key: FirstRowHeight.self, value: $0.size.height) })
  }
}

extension Array where Element: Hashable {
  func uniqued() -> [Element] {
    var seen = Set<Element>()
    return filter { seen.insert($0).inserted }
  }
}
